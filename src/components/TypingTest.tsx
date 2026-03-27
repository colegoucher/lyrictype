"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

interface TypingTestProps {
  lyrics: string;
  songTitle: string;
  artist: string;
  accentColor?: string;
  onBack?: () => void;
  onFinish?: (wpm: number, accuracy: number, elapsed: number) => void;
}

type CharState = "pending" | "correct" | "incorrect" | "active";

const CONTAINER_HEIGHT = 240;
const MIDDLE = CONTAINER_HEIGHT / 2;

const CLASS: Record<CharState, string> = {
  pending:   "relative text-zinc-600",
  correct:   "relative text-zinc-300",
  incorrect: "relative text-red-400 bg-red-900/20",
  active:    "relative text-zinc-600 before:absolute before:-left-px before:top-0 before:h-full before:w-px before:bg-[var(--lyric-accent)] before:[animation:blink_1s_step-end_infinite]",
};

export default function TypingTest({
  lyrics,
  songTitle,
  artist,
  accentColor = "#22d3ee",
  onBack,
  onFinish,
}: TypingTestProps) {
  const charsRef      = useRef<CharState[]>([]);
  const cursorRef     = useRef(0);
  const finishedRef   = useRef(false);
  const startedRef    = useRef(false);
  const startTimeRef  = useRef<number | null>(null);
  const errorsRef     = useRef(0);
  const totalTypedRef = useRef(0);

  const [started,  setStarted]  = useState(false);
  const [finished, setFinished] = useState(false);

  const scrollRef       = useRef<HTMLDivElement>(null);
  const charDomRefs     = useRef<(HTMLSpanElement | null)[]>([]);
  const lineDomRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressNoteRef = useRef<HTMLSpanElement>(null);
  const wpmDomRef       = useRef<HTMLSpanElement>(null);
  const accDomRef       = useRef<HTMLSpanElement>(null);

  useEffect(() => { finishedRef.current = finished; }, [finished]);

  // Live WPM ticker
  useEffect(() => {
    if (!started || finished) return;
    const interval = setInterval(() => {
      if (!startTimeRef.current) return;
      const mins = (Date.now() - startTimeRef.current) / 1000 / 60;
      const correctChars = charsRef.current.filter(s => s === "correct").length;
      const live = Math.round((correctChars / 5) / mins);
      if (wpmDomRef.current) wpmDomRef.current.textContent = String(live);
    }, 500);
    return () => clearInterval(interval);
  }, [started, finished]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const cleanLyrics = useCallback((raw: string) => {
    return raw
      .replace(/\r/g, "")
      .replace(/[\u00AD\u200B\u200C\u200D\uFEFF\u2060]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2015\u2010\u2011]/g, "-")
      .replace(/\[.*?\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
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
      el.className = state === "active"
        ? "relative text-zinc-500 before:absolute before:-left-px before:top-0 before:h-full before:w-px before:bg-[var(--lyric-accent)] before:[animation:blink_1s_step-end_infinite]"
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

    requestAnimationFrame(() => {
      initial.forEach((state, i) => setCharDom(i, state));
      scrollToLine(charToLine[p] ?? 0);
      updateProgress(p);
      if (wpmDomRef.current) wpmDomRef.current.textContent = "—";
      if (accDomRef.current) accDomRef.current.textContent = "—";
    });
  }, [text, charToLine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { initState(); }, [initState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Tab = restart
      if (e.key === "Tab") { e.preventDefault(); initState(); return; }
      if (e.key === "Escape") { e.preventDefault(); onBack?.(); return; }

      if (finishedRef.current) return;

      const key = e.key;
      const cur = cursorRef.current;

      // Backspace
      if (key === "Backspace") {
        e.preventDefault();
        if (cur === 0) return;
        setCharDom(cur, "pending");
        charsRef.current[cur] = "pending";
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

      // Space at newline → advance
      if (text[cur] === "\n") {
        if (key !== " ") return;
        e.preventDefault();
        let p = cur;
        while (p < text.length && text[p] === "\n") {
          setCharDom(p, "correct");
          charsRef.current[p] = "correct";
          p++;
        }
        if (p >= text.length) {
          const mins = (Date.now() - (startTimeRef.current ?? Date.now())) / 1000 / 60;
          const correctChars = charsRef.current.filter(s => s === "correct").length;
          const finalWpm = Math.round((correctChars / 5) / mins);
          const finalAcc = Math.round(((totalTypedRef.current - errorsRef.current) / Math.max(totalTypedRef.current, 1)) * 100);
          const finalElapsed = Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000);
          finishedRef.current = true;
          setFinished(true);
          onFinish?.(finalWpm, finalAcc, finalElapsed);
          return;
        }
        setCharDom(p, "active");
        charsRef.current[p] = "active";
        cursorRef.current = p;
        scrollToLine(charToLine[p] ?? 0);
        updateProgress(p);
        return;
      }

      // Regular character
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

      const acc = Math.round(((totalTypedRef.current - errorsRef.current) / totalTypedRef.current) * 100);
      if (accDomRef.current) accDomRef.current.textContent = `${acc}%`;

      setCharDom(cur, isCorrect ? "correct" : "incorrect");
      charsRef.current[cur] = isCorrect ? "correct" : "incorrect";

      const p = cur + 1;
      if (p >= text.length) {
        const mins = (Date.now() - (startTimeRef.current ?? Date.now())) / 1000 / 60;
        const correctChars = charsRef.current.filter(s => s === "correct").length;
        const finalWpm = Math.round((correctChars / 5) / mins);
        const finalAcc = Math.round(((totalTypedRef.current - errorsRef.current) / Math.max(totalTypedRef.current, 1)) * 100);
        const finalElapsed = Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000);
        finishedRef.current = true;
        setFinished(true);
        onFinish?.(finalWpm, finalAcc, finalElapsed);
        return;
      }

      setCharDom(p, "active");
      charsRef.current[p] = "active";
      cursorRef.current = p;
      updateProgress(p);
      const newLine = text[p] === "\n" ? charToLine[p + 1] ?? charToLine[p] ?? 0 : charToLine[p] ?? 0;
      scrollToLine(newLine);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [text, charToLine, initState, onBack]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex flex-col w-full flex-1 overflow-hidden"
      style={{ "--lyric-accent": accentColor } as React.CSSProperties}
    >
      {/* Stats + progress */}
      <div className="flex items-center justify-center gap-6 shrink-0">
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <span ref={wpmDomRef} className="text-5xl font-bold font-mono" style={{ color: accentColor }}>—</span>
            <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">WPM</div>
          </div>
          <div className="text-center">
            <span ref={accDomRef} className="text-5xl font-bold font-mono" style={{ color: accentColor }}>—</span>
            <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Accuracy</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative w-56 h-3 bg-zinc-800 rounded-full">
          <div
            ref={progressFillRef}
            className="h-full rounded-full"
            style={{ width: "0%", transition: "width 0.1s ease-out", backgroundColor: accentColor, opacity: 0.5 }}
          />
          <span
            ref={progressNoteRef}
            className="absolute -top-5 text-2xl leading-none -translate-x-1/2 select-none"
            style={{ left: "0%", transition: "left 0.1s ease-out", color: accentColor }}
          >
            ♪
          </span>
        </div>
      </div>

      {/* Lyrics area */}
      <div
        className="relative w-full cursor-text overflow-hidden flex-1 mt-6"
        style={{
          maxHeight: CONTAINER_HEIGHT,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
        }}
      >
        <div
          ref={scrollRef}
          className="absolute inset-x-0 px-1"
          style={{ willChange: "transform", transition: "transform 0.12s ease-out" }}
        >
          {lineChars.map((line, lineIndex) => (
            <div
              key={lineIndex}
              ref={(el) => { lineDomRefs.current[lineIndex] = el; }}
              className="font-mono text-3xl py-1"
            >
              {line.length === 0 ? (
                <span className="opacity-0 select-none">|</span>
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

      {/* Action buttons */}
      <div className="mt-auto shrink-0 flex items-center gap-3 pt-6">
        <button
          onClick={initState}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-xs"
        >
          <kbd className="font-mono text-zinc-600 text-xs">Tab</kbd>
          Restart
        </button>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-xs"
          >
            <kbd className="font-mono text-zinc-600 text-xs">Esc</kbd>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
