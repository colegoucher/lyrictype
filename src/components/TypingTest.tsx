"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

interface TypingTestProps {
  lyrics: string;
  songTitle: string;
  artist: string;
}

type CharState = "pending" | "correct" | "incorrect" | "active";

const CONTAINER_HEIGHT = 240;
const MIDDLE = CONTAINER_HEIGHT / 2;

const CLASS: Record<CharState, string> = {
  pending:   "relative text-zinc-600",
  correct:   "relative text-zinc-300",
  incorrect: "relative text-red-400 bg-red-900/20",
  active:    "relative text-zinc-600 after:absolute after:left-0 after:bottom-0 after:w-full after:h-0.5 after:bg-cyan-400 after:animate-pulse",
};

export default function TypingTest({ lyrics, songTitle, artist }: TypingTestProps) {
  const charsRef      = useRef<CharState[]>([]);
  const cursorRef     = useRef(0);
  const finishedRef   = useRef(false);
  const startedRef    = useRef(false);
  const startTimeRef  = useRef<number | null>(null);
  const errorsRef     = useRef(0);
  const totalTypedRef = useRef(0);

  const [started,  setStarted]  = useState(false);
  const [finished, setFinished] = useState(false);
  const [wpm,      setWpm]      = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [errors,   setErrors]   = useState(0);

  const scrollRef      = useRef<HTMLDivElement>(null);
  const charDomRefs    = useRef<(HTMLSpanElement | null)[]>([]);
  const lineDomRefs    = useRef<(HTMLDivElement | null)[]>([]);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressNoteRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { finishedRef.current = finished; }, [finished]);

  useEffect(() => {
    if (!started || finished) return;
    const interval = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60;
      const correctChars = charsRef.current.filter(s => s === "correct").length;
      setWpm(Math.round((correctChars / 5) / elapsed));
    }, 500);
    return () => clearInterval(interval);
  }, [started, finished]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const cleanLyrics = useCallback((raw: string) => {
    return raw
      .replace(/\r/g, "")                                          // strip \r from Windows line endings
      .replace(/[\u00AD\u200B\u200C\u200D\uFEFF\u2060]/g, "")     // strip invisible/zero-width chars (soft hyphen, ZWS, BOM, etc.)
      .replace(/\u00A0/g, " ")                                     // non-breaking space → regular space
      .replace(/[\u2018\u2019]/g, "'")                             // curly apostrophes → straight
      .replace(/[\u201C\u201D]/g, '"')                             // curly quotes → straight
      .replace(/[\u2013\u2014\u2015\u2010\u2011]/g, "-")          // all dash variants → hyphen-minus
      .replace(/\[.*?\]/g, "")                                     // remove [Verse], [Chorus] etc.
      .replace(/\n{3,}/g, "\n\n")                                  // collapse 3+ blank lines
      .trim();
  }, []);

  const text = cleanLyrics(lyrics);

  const charToLine = useMemo(() => {
    const map: number[] = [];
    let line = 0;
    for (let i = 0; i < text.length; i++) {
      map[i] = line;
      if (text[i] === "\n") line++;
    }
    return map;
  }, [text]);

  // Include newline chars as entries so they get a DOM span and can hold the cursor
  const lineChars = useMemo(() => {
    const result: Array<{ char: string; index: number; isNewline?: boolean }[]> = [];
    let charIdx = 0;
    const lines = text.split("\n");
    for (let li = 0; li < lines.length; li++) {
      const arr: { char: string; index: number; isNewline?: boolean }[] = [];
      for (const char of lines[li]) arr.push({ char, index: charIdx++ });
      if (li < lines.length - 1) {
        arr.push({ char: "\n", index: charIdx++, isNewline: true });
      }
      result.push(arr);
    }
    return result;
  }, [text]);

  const setCharDom = (index: number, state: CharState) => {
    const el = charDomRefs.current[index];
    if (!el) return;
    if (charDomRefs.current[index]?.dataset.newline) {
      // Newline span: only show ↵ when active, invisible otherwise
      el.className = state === "active"
        ? "relative text-zinc-500 after:absolute after:left-0 after:bottom-0 after:w-full after:h-0.5 after:bg-cyan-400 after:animate-pulse"
        : "relative opacity-0 select-none";
    } else {
      el.className = CLASS[state];
    }
  };

  const updateProgress = (pos: number) => {
    const pct = Math.min((pos / text.length) * 100, 100);
    if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
    if (progressNoteRef.current) progressNoteRef.current.style.left = `${pct}%`;
  };

  const scrollToLine = (lineIndex: number) => {
    const el = lineDomRefs.current[lineIndex];
    if (!el || !scrollRef.current) return;
    const ty = MIDDLE - (el.offsetTop + el.offsetHeight / 2);
    scrollRef.current.style.transform = `translateY(${ty}px)`;
  };

  const initState = useCallback(() => {
    const initial: CharState[] = text.split("").map(() => "pending");
    let p = 0;
    // Only skip leading newlines (shouldn't happen after trim, but just in case)
    while (p < text.length && text[p] === "\n") { initial[p] = "correct"; p++; }
    if (p < text.length) initial[p] = "active";

    charsRef.current      = initial;
    cursorRef.current     = p;
    finishedRef.current   = false;
    startedRef.current    = false;
    startTimeRef.current  = null;
    errorsRef.current     = 0;
    totalTypedRef.current = 0;

    setStarted(false);
    setFinished(false);
    setWpm(0);
    setAccuracy(100);
    setErrors(0);

    requestAnimationFrame(() => {
      initial.forEach((state, i) => setCharDom(i, state));
      scrollToLine(charToLine[p] ?? 0);
      updateProgress(p);
    });
  }, [text, charToLine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { initState(); }, [initState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (finishedRef.current) return;

      const key = e.key;
      const cur = cursorRef.current;

      // ── Backspace ──────────────────────────────────────────────────────
      if (key === "Backspace") {
        e.preventDefault();
        if (cur === 0) return;

        setCharDom(cur, "pending");
        charsRef.current[cur] = "pending";

        // Go back, skipping newlines
        let p = cur - 1;
        while (p > 0 && text[p] === "\n") {
          setCharDom(p, "pending");
          charsRef.current[p] = "pending";
          p--;
        }

        setCharDom(p, "active");
        charsRef.current[p] = "active";
        cursorRef.current = p;
        scrollToLine(charToLine[p] ?? 0);
        updateProgress(p);
        return;
      }

      // ── Space at a newline — advance to next line ───────────────────────
      if (text[cur] === "\n") {
        if (key !== " ") return; // only space advances past newlines
        e.preventDefault();

        let p = cur;
        while (p < text.length && text[p] === "\n") {
          setCharDom(p, "correct");
          charsRef.current[p] = "correct";
          p++;
        }

        if (p >= text.length) {
          finishedRef.current = true;
          const elapsed = (Date.now() - (startTimeRef.current ?? Date.now())) / 1000 / 60;
          const correctChars = charsRef.current.filter(s => s === "correct").length;
          setWpm(Math.round((correctChars / 5) / elapsed));
          setAccuracy(Math.round(((totalTypedRef.current - errorsRef.current) / totalTypedRef.current) * 100));
          setFinished(true);
          return;
        }

        setCharDom(p, "active");
        charsRef.current[p] = "active";
        cursorRef.current = p;
        scrollToLine(charToLine[p] ?? 0);
        updateProgress(p);
        return;
      }

      // ── Regular character ───────────────────────────────────────────────
      if (key.length !== 1) return;
      e.preventDefault();

      if (!startedRef.current) {
        startedRef.current   = true;
        startTimeRef.current = Date.now();
        setStarted(true);
      }

      const isCorrect = key === text[cur];
      totalTypedRef.current += 1;
      if (!isCorrect) errorsRef.current += 1;
      setErrors(errorsRef.current);
      setAccuracy(Math.round(((totalTypedRef.current - errorsRef.current) / totalTypedRef.current) * 100));

      setCharDom(cur, isCorrect ? "correct" : "incorrect");
      charsRef.current[cur] = isCorrect ? "correct" : "incorrect";

      const p = cur + 1;

      if (p >= text.length) {
        finishedRef.current = true;
        const elapsed = (Date.now() - (startTimeRef.current ?? Date.now())) / 1000 / 60;
        const correctChars = charsRef.current.filter(s => s === "correct").length;
        setWpm(Math.round((correctChars / 5) / elapsed));
        setAccuracy(Math.round(((totalTypedRef.current - errorsRef.current) / totalTypedRef.current) * 100));
        setFinished(true);
        return;
      }

      // If next char is a newline, show cursor on the ↵ span
      setCharDom(p, "active");
      charsRef.current[p] = "active";
      cursorRef.current = p;
      updateProgress(p);

      // Only scroll if the newline takes us to the next line
      const newLine = text[p] === "\n" ? charToLine[p + 1] ?? charToLine[p] ?? 0 : charToLine[p] ?? 0;
      scrollToLine(newLine);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [text, charToLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestart = () => { initState(); };

  return (
    <div className="flex flex-col items-center w-full max-w-3xl gap-6">
      {/* Stats + progress bar */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <div className="text-5xl font-bold font-mono text-yellow-400">{wpm || "—"}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">WPM</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold font-mono text-yellow-400">{started ? `${accuracy}%` : "—"}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Accuracy</div>
          </div>
        </div>

        <div className="relative w-56 h-3 bg-zinc-800 rounded-full">
          <div
            ref={progressFillRef}
            className="h-full bg-cyan-500/50 rounded-full"
            style={{ width: "0%", transition: "width 0.1s ease-out" }}
          />
          <span
            ref={progressNoteRef}
            className="absolute -top-5 text-2xl leading-none -translate-x-1/2 text-cyan-400 select-none"
            style={{ left: "0%", transition: "left 0.1s ease-out" }}
          >
            ♪
          </span>
        </div>
      </div>

      <div
        className="relative w-full cursor-text overflow-hidden"
        style={{
          height: CONTAINER_HEIGHT,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        }}
      >
        <div
          ref={scrollRef}
          className="absolute inset-x-0 px-8"
          style={{ willChange: "transform", transition: "transform 0.12s ease-out" }}
        >
          {lineChars.map((line, lineIndex) => (
            <div
              key={lineIndex}
              ref={(el) => { lineDomRefs.current[lineIndex] = el; }}
              className="font-mono text-3xl py-1"
            >
              {line.length === 0 ? (
                <span className="opacity-0">|</span>
              ) : (
                line.map(({ char, index, isNewline }) => (
                  <span
                    key={index}
                    ref={(el) => { charDomRefs.current[index] = el; }}
                    data-newline={isNewline ? "1" : undefined}
                    className={isNewline ? "relative opacity-0 select-none" : CLASS["pending"]}
                  >
                    {isNewline ? " " : char}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {finished && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-zinc-800 px-10 py-6 text-center">
          <p className="text-2xl font-bold text-yellow-400">{wpm} WPM</p>
          <p className="text-zinc-300 text-sm">Accuracy: {accuracy}%</p>
          <button
            onClick={handleRestart}
            className="mt-2 rounded-full bg-yellow-400 px-6 py-2 text-sm font-semibold text-zinc-900 hover:bg-yellow-300 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!finished && (
        <button
          onClick={handleRestart}
          className="fixed bottom-8 rounded-full bg-zinc-800 border border-zinc-700 px-6 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          Restart
        </button>
      )}
    </div>
  );
}
