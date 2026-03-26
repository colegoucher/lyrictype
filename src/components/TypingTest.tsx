"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TypingTestProps {
  lyrics: string;
  songTitle: string;
  artist: string;
}

type CharState = "pending" | "correct" | "incorrect" | "active";

export default function TypingTest({ lyrics, songTitle, artist }: TypingTestProps) {
  const [chars, setChars] = useState<CharState[]>([]);
  const [cursor, setCursor] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [errors, setErrors] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCharRef = useRef<HTMLSpanElement>(null);

  const cleanLyrics = useCallback((raw: string) => {
    return raw
      .replace(/\[.*?\]/g, "")       // remove section tags like [Verse 1]
      .replace(/\n{3,}/g, "\n\n")    // collapse multiple blank lines
      .trim();
  }, []);

  const text = cleanLyrics(lyrics);

  useEffect(() => {
    setChars(text.split("").map((_, i) => (i === 0 ? "active" : "pending")));
    setCursor(0);
    setStarted(false);
    setFinished(false);
    setStartTime(null);
    setWpm(0);
    setAccuracy(100);
    setErrors(0);
  }, [text]);

  useEffect(() => {
    if (activeCharRef.current) {
      activeCharRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [cursor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (finished) return;

      const key = e.key;

      if (key === "Backspace") {
        e.preventDefault();
        if (cursor === 0) return;
        const newCursor = cursor - 1;
        setChars((prev) => {
          const next = [...prev];
          next[newCursor] = "active";
          next[cursor] = "pending";
          return next;
        });
        setCursor(newCursor);
        return;
      }

      if (key.length !== 1 && key !== "Enter") return;

      const expected = text[cursor];
      const typed = key === "Enter" ? "\n" : key;

      if (!started) {
        setStarted(true);
        setStartTime(Date.now());
      }

      const isCorrect = typed === expected;
      if (!isCorrect) setErrors((prev) => prev + 1);

      const newCursor = cursor + 1;
      const isDone = newCursor >= text.length;

      setChars((prev) => {
        const next = [...prev];
        next[cursor] = isCorrect ? "correct" : "incorrect";
        if (!isDone) next[newCursor] = "active";
        return next;
      });

      setCursor(newCursor);

      if (isDone) {
        setFinished(true);
        const elapsed = (Date.now() - (startTime ?? Date.now())) / 1000 / 60;
        const words = text.split(/\s+/).length;
        const calculatedWpm = Math.round(words / elapsed);
        const totalChars = text.length;
        const totalErrors = errors + (isCorrect ? 0 : 1);
        const calculatedAccuracy = Math.round(((totalChars - totalErrors) / totalChars) * 100);
        setWpm(calculatedWpm);
        setAccuracy(calculatedAccuracy);
      }
    },
    [cursor, finished, started, startTime, text, errors]
  );

  const handleRestart = () => {
    setChars(text.split("").map((_, i) => (i === 0 ? "active" : "pending")));
    setCursor(0);
    setStarted(false);
    setFinished(false);
    setStartTime(null);
    setWpm(0);
    setAccuracy(100);
    setErrors(0);
    inputRef.current?.focus();
  };

  const colorMap: Record<CharState, string> = {
    pending: "text-zinc-500",
    correct: "text-zinc-100",
    incorrect: "text-red-400 bg-red-900/30",
    active: "text-zinc-100",
  };

  return (
    <div className="flex flex-col items-center w-full max-w-3xl gap-6">
      {/* Song info */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-100">{songTitle}</h2>
        <p className="text-sm text-zinc-400">{artist}</p>
      </div>

      {/* Stats bar */}
      <div className="flex gap-8 text-sm text-zinc-400">
        <span>
          WPM: <span className="text-yellow-400 font-mono font-semibold">{wpm || "—"}</span>
        </span>
        <span>
          Accuracy: <span className="text-yellow-400 font-mono font-semibold">{started ? `${accuracy}%` : "—"}</span>
        </span>
        <span>
          Errors: <span className="text-red-400 font-mono font-semibold">{errors || "—"}</span>
        </span>
      </div>

      {/* Typing area */}
      <div
        className="relative w-full rounded-lg bg-zinc-900 p-6 font-mono text-lg leading-8 cursor-text max-h-80 overflow-y-auto"
        onClick={() => inputRef.current?.focus()}
      >
        {!started && !finished && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-900/80 text-zinc-400 text-sm pointer-events-none">
            Click here and start typing...
          </div>
        )}
        {text.split("").map((char, i) => {
          const state = chars[i] ?? "pending";
          const isActive = state === "active";
          return (
            <span
              key={i}
              ref={isActive ? activeCharRef : null}
              className={`relative ${colorMap[state]} ${isActive ? "after:absolute after:left-0 after:bottom-0 after:w-full after:h-0.5 after:bg-yellow-400 after:animate-pulse" : ""}`}
            >
              {char === "\n" ? (
                <>
                  {isActive && <span className="opacity-30">↵</span>}
                  {"\n"}
                </>
              ) : (
                char
              )}
            </span>
          );
        })}
      </div>

      {/* Hidden input to capture keystrokes */}
      <input
        ref={inputRef}
        className="absolute opacity-0 w-0 h-0"
        onKeyDown={handleKeyDown}
        readOnly
        autoFocus
      />

      {/* Finished overlay */}
      {finished && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-zinc-800 px-10 py-6 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {wpm} WPM
          </p>
          <p className="text-zinc-300 text-sm">
            Accuracy: {accuracy}% &nbsp;·&nbsp; Errors: {errors}
          </p>
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
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Restart (or press Tab)
        </button>
      )}
    </div>
  );
}
