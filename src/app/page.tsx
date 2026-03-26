"use client";

import { useState } from "react";
import TypingTest from "@/components/TypingTest";

interface SongData {
  lyrics: string;
  songTitle: string;
  artist: string;
}

export default function Home() {
  const [artist, setArtist] = useState("");
  const [song, setSong] = useState("");
  const [songData, setSongData] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artist.trim() || !song.trim()) return;

    setLoading(true);
    setError(null);
    setSongData(null);

    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(song.trim())}`
      );
      if (!res.ok) {
        setError("Song not found. Try a different artist or title.");
        return;
      }
      const data = await res.json();
      if (!data.lyrics) {
        setError("No lyrics found for that song.");
        return;
      }
      setSongData({ lyrics: data.lyrics, songTitle: song.trim(), artist: artist.trim() });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSongData(null);
    setError(null);
  };

  return (
    <main
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #1e1533 0%, #0a0a0f 60%)" }}
    >
      {/* Top bar — always visible */}
      <header className="flex items-center justify-between px-8 py-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Lyric<span className="text-violet-400">Type</span>
          </h1>
          <p className="text-xs text-zinc-500 tracking-widest uppercase">Type the lyrics. Feel the music.</p>
        </div>
        {songData && (
          <button
            onClick={handleBack}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Search another song
          </button>
        )}
      </header>

      {/* Main content */}
      {!songData ? (
        // Search screen — centered
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
          <div className="text-center">
            <p className="text-zinc-400 text-lg">Search for a song to start typing</p>
          </div>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 w-full max-w-sm">
            <input
              type="text"
              placeholder="Artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Song title"
              value={song}
              onChange={(e) => setSong(e.target.value)}
              className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Find Song"}
            </button>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          </form>
        </div>
      ) : (
        // Typing screen — song title at top, box front and center
        <div className="flex flex-1 flex-col items-center px-4 pt-6 gap-6">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white tracking-tight">{songData.songTitle}</h2>
            <p className="text-zinc-400 mt-1">{songData.artist}</p>
          </div>
          <TypingTest
            lyrics={songData.lyrics}
            songTitle={songData.songTitle}
            artist={songData.artist}
          />
        </div>
      )}
    </main>
  );
}
