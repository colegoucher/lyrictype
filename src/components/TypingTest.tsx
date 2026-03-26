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
  active:    "relative text-zinc-600 after:absolute after:left-0 after:bottom-0 after:w-full after:h-0.5 after:bg-violet-400 after:animate-pulse",
};

export default function TypingTest({ lyrics, songTitle, artist }: TypingTestProps) {
  // All mutable logic lives in refs — zero stale closures, handler registered once
  const charsRef    = useRef<CharState[]>([]);
  const cursorRef   = useRef(0);
  const finishedRef = useRef(false);
  const startedRef  = useRef(false);
  const startTimeRef= useRef<number | null>(null);
  const errorsRef   = useRef(0);

  // React state only for the UI panels that actually need re-renders
  const [started,  setStarted]  = useState(false);
  const [finished, setFinished] = useState(false);
  const [wpm,      setWpm]      = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [errors,   setErrors]   = useState(0);

  // DOM refs
  const scrollRef   = useRef<HTMLDivElement>(null);
  const charDomRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lineDomRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep finishedRef in sync so the window handler never reads stale state
  useEffect(() => { finishedRef.current = finished; }, [finished]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const cleanLyrics = useCallback((raw: string) => {
    return raw.replace(/\[.*?\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
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
    const result: Array<{ char: string; index: number }[]> = [];
    let charIdx = 0;
    for (const line of text.split("\n")) {
      const arr: { char: string; index: number }[] = [];
      for (const char of line) arr.push({ char, index: charIdx++ });
      result.push(arr);
      charIdx++;
    }
    return result;
  }, [text]);

  // Inline DOM helpers — no useCallback overhead, called only from event handler
  const setCharDom = (index: number, state: CharState) => {
    const el = charDomRefs.current[index];
    if (el) el.className = CLASS[state];
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

    charsRef.current     = initial;
    cursorRef.current    = p;
    finishedRef.current  = false;
    startedRef.current   = false;
    startTimeRef.current = null;
    errorsRef.current    = 0;

    setStarted(false);
    setFinished(false);
    setWpm(0);
    setAccuracy(100);
    setErrors(0);

    requestAnimationFrame(() => {
      initial.forEach((state, i) => setCharDom(i, state));
      scrollToLine(charToLine[p] ?? 0);
    });
  }, [text, charToLine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { initState(); }, [initState]);

  // Register keydown on window once — no React synthetic events, no focus dependency
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never intercept browser shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (finishedRef.current) return;

      const key = e.key;

      if (key === "Backspace") {
        e.preventDefault();
        const cur = cursorRef.current;
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
        return;
      }

      if (key.length !== 1) return;
      e.preventDefault();

      const cur = cursorRef.current;
      const isCorrect = key === text[cur];

      if (!startedRef.current) {
        startedRef.current   = true;
        startTimeRef.current = Date.now();
        setStarted(true);
      }

      if (!isCorrect) {
        errorsRef.current += 1;
        setErrors(errorsRef.current);
      }

      setCharDom(cur, isCorrect ? "correct" : "incorrect");
      charsRef.current[cur] = isCorrect ? "correct" : "incorrect";

      let p = cur + 1;
      while (p < text.length && text[p] === "\n") {
        setCharDom(p, "correct");
        charsRef.current[p] = "correct";
        p++;
      }

      const newLine  = charToLine[p] ?? charToLine[text.length - 1] ?? 0;

      if (p < text.length) {
        setCharDom(p, "active");
        charsRef.current[p] = "active";
      }
      cursorRef.current = p;
      scrollToLine(newLine);

      if (p >= text.length) {
        finishedRef.current = true;
        const elapsed     = (Date.now() - (startTimeRef.current ?? Date.now())) / 1000 / 60;
        const wordCount   = text.split(/\s+/).length;
        const totalErrors = errorsRef.current + (isCorrect ? 0 : 1);
        setWpm(Math.round(wordCount / elapsed));
        setAccuracy(Math.round(((text.length - totalErrors) / text.length) * 100));
        setFinished(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [text, charToLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestart = () => { initState(); };

  return (
    <div className="flex flex-col items-center w-full max-w-3xl gap-6">
      {/* Stats */}
      <div className="flex gap-8 text-sm text-zinc-400">
        <span>WPM: <span className="text-yellow-400 font-mono font-semibold">{wpm || "—"}</span></span>
        <span>Accuracy: <span className="text-yellow-400 font-mono font-semibold">{started ? `${accuracy}%` : "—"}</span></span>
        <span>Errors: <span className="text-red-400 font-mono font-semibold">{errors || "—"}</span></span>
      </div>

      {/* Lyrics */}
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
                line.map(({ char, index }) => (
                  <span
                    key={index}
                    ref={(el) => { charDomRefs.current[index] = el; }}
                    className={CLASS["pending"]}
                  >
                    {char}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {finished && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-zinc-800 px-10 py-6 text-center">
          <p className="text-2xl font-bold text-yellow-400">{wpm} WPM</p>
          <p className="text-zinc-300 text-sm">Accuracy: {accuracy}% &nbsp;·&nbsp; Errors: {errors}</p>
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
