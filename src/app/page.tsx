"use client";

import { useState, useEffect, useRef } from "react";
import TypingTest from "@/components/TypingTest";

// ── Types ──────────────────────────────────────────────────────────────────
interface Artist {
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
}

interface Album {
  collectionId: number;
  collectionName: string;
  artworkUrl100: string;
  releaseDate: string;
  trackCount: number;
}

interface Track {
  trackId: number;
  trackName: string;
  trackNumber: number;
}

interface SongData {
  lyrics: string;
  songTitle: string;
  artist: string;
  artworkUrl?: string;
}

type Step = "search" | "albums" | "tracks" | "typing";

// ── Helpers ────────────────────────────────────────────────────────────────
function bigArtwork(url: string) {
  return url.replace("100x100", "400x400");
}

function extractAccentColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve("#22d3ee"); return; }
        ctx.drawImage(img, 0, 0, 60, 60);
        const { data } = ctx.getImageData(0, 0, 60, 60);

        // Bucket pixels by hue, skipping near-grey / near-black / near-white
        const buckets = new Array(36).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
          if (s < 0.3 || l < 0.15 || l > 0.85) continue;
          let h = 0;
          if (max === r)      h = ((g - b) / (max - min)) % 6;
          else if (max === g) h = (b - r) / (max - min) + 2;
          else                h = (r - g) / (max - min) + 4;
          h = Math.round(h * 60);
          if (h < 0) h += 360;
          buckets[Math.floor(h / 10)]++;
        }

        const best = buckets.indexOf(Math.max(...buckets));
        if (buckets[best] < 8) { resolve("#22d3ee"); return; } // image too grey — fall back
        resolve(`hsl(${best * 10 + 5}, 75%, 62%)`);
      } catch {
        resolve("#22d3ee");
      }
    };
    img.onerror = () => resolve("#22d3ee");
    img.src = imageUrl;
  });
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep]             = useState<Step>("search");
  const [query, setQuery]           = useState("");
  const [artists, setArtists]       = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum]   = useState<Album | null>(null);
  const [tracks, setTracks]         = useState<Track[]>([]);
  const [songData, setSongData]     = useState<SongData | null>(null);
  const [accentColor, setAccentColor] = useState("#22d3ee");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced artist search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setArtists([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=6`
        );
        const data = await res.json();
        setArtists(data.results ?? []);
      } catch {
        // silently ignore search errors
      }
    }, 300);
  }, [query]);

  // Fetch albums for an artist
  async function selectArtist(artist: Artist) {
    setSelectedArtist(artist);
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(
        `https://itunes.apple.com/lookup?id=${artist.artistId}&entity=album&limit=200&sort=recent`
      );
      const data = await res.json();
      const albumResults: Album[] = data.results
        .filter((r: { wrapperType: string }) => r.wrapperType === "collection")
        .map((r: Album) => ({
          collectionId:   r.collectionId,
          collectionName: r.collectionName,
          artworkUrl100:  r.artworkUrl100,
          releaseDate:    r.releaseDate,
          trackCount:     r.trackCount,
        }));
      setAlbums(albumResults);
      setStep("albums");
    } catch {
      setError("Failed to load albums.");
    } finally {
      setLoading(false);
    }
  }

  // Fetch tracks for an album
  async function selectAlbum(album: Album) {
    setSelectedAlbum(album);
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(
        `https://itunes.apple.com/lookup?id=${album.collectionId}&entity=song`
      );
      const data = await res.json();
      const trackResults: Track[] = data.results
        .filter((r: { wrapperType: string }) => r.wrapperType === "track")
        .map((r: Track & { trackNumber: number; trackName: string }) => ({
          trackId:     r.trackId,
          trackName:   r.trackName,
          trackNumber: r.trackNumber,
        }))
        .sort((a: Track, b: Track) => a.trackNumber - b.trackNumber);
      setTracks(trackResults);
      setStep("tracks");
    } catch {
      setError("Failed to load tracks.");
    } finally {
      setLoading(false);
    }
  }

  // Fetch lyrics for a track
  async function selectTrack(track: Track) {
    if (!selectedArtist) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(selectedArtist.artistName)}/${encodeURIComponent(track.trackName)}`
      );
      if (!res.ok) { setError("Lyrics not found for this song."); return; }
      const data = await res.json();
      if (!data.lyrics) { setError("Lyrics not found for this song."); return; }
      const artUrl = selectedAlbum ? bigArtwork(selectedAlbum.artworkUrl100) : undefined;
      setSongData({ lyrics: data.lyrics, songTitle: track.trackName, artist: selectedArtist.artistName, artworkUrl: artUrl });
      if (artUrl) extractAccentColor(artUrl).then(setAccentColor);
      setStep("typing");
    } catch {
      setError("Something went wrong fetching lyrics.");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setError(null);
    if (step === "albums")  { setStep("search"); setAlbums([]); setSelectedArtist(null); }
    if (step === "tracks")  { setStep("albums"); setTracks([]); setSelectedAlbum(null); }
    if (step === "typing")  { setStep("tracks"); setSongData(null); }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main
      className={step === "typing" ? "h-screen overflow-hidden flex" : "min-h-screen flex flex-col overflow-hidden"}
      style={step !== "typing" ? { background: "radial-gradient(ellipse at 50% 0%, #1a4a6b 0%, #0d2540 70%)" } : undefined}
    >
      {/* Header — hidden during typing */}
      {step !== "typing" && (
        <header className="flex items-center justify-between px-8 py-5 shrink-0">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Lyric<span className="text-cyan-400">Type</span>
            </h1>
            <p className="text-xs text-zinc-500 tracking-widest uppercase">Type the lyrics. Feel the music.</p>
          </div>
          {step !== "search" && (
            <button
              onClick={goBack}
              className="step-enter rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              ← Back
            </button>
          )}
        </header>
      )}

      {/* ── Search ── */}
      {step === "search" && (
        <div key="search" className="step-enter flex flex-1 flex-col items-center px-4 pt-12 gap-6">
          <p className="text-zinc-400">Search for an artist to get started</p>
          <div className="relative w-full max-w-sm">
            <input
              type="text"
              placeholder="Artist name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
          </div>
          {artists.length > 0 && (
            <div className="w-full max-w-sm flex flex-col gap-2">
              {artists.map((a) => (
                <button
                  key={a.artistId}
                  onClick={() => selectArtist(a)}
                  className="text-left rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 hover:border-cyan-500 hover:bg-zinc-750 transition-colors"
                >
                  <p className="text-zinc-100 font-medium">{a.artistName}</p>
                  {a.primaryGenreName && (
                    <p className="text-zinc-500 text-xs mt-0.5">{a.primaryGenreName}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          {loading && <p className="text-zinc-500 text-sm">Loading...</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}

      {/* ── Albums ── */}
      {step === "albums" && (
        <div key="albums" className="step-enter flex flex-1 flex-col items-center px-6 pt-6 gap-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-white">{selectedArtist?.artistName}</h2>
          {loading && <p className="text-zinc-500 text-sm">Loading albums...</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-3xl pb-12">
            {albums.map((album) => (
              <button
                key={album.collectionId}
                onClick={() => selectAlbum(album)}
                className="flex flex-col gap-2 text-left group"
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg">
                  <img
                    src={bigArtwork(album.artworkUrl100)}
                    alt={album.collectionName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
                <div>
                  <p className="text-zinc-100 text-sm font-medium leading-tight line-clamp-2">{album.collectionName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{new Date(album.releaseDate).getFullYear()}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tracks ── */}
      {step === "tracks" && (
        <div key="tracks" className="step-enter flex flex-1 flex-col items-center px-6 pt-6 gap-6 overflow-y-auto">
          <div className="flex items-center gap-6 w-full max-w-lg">
            {selectedAlbum && (
              <img
                src={bigArtwork(selectedAlbum.artworkUrl100)}
                alt={selectedAlbum.collectionName}
                className="w-24 h-24 rounded-lg object-cover shrink-0"
              />
            )}
            <div>
              <h2 className="text-xl font-bold text-white">{selectedAlbum?.collectionName}</h2>
              <p className="text-zinc-400 text-sm">{selectedArtist?.artistName}</p>
            </div>
          </div>
          {loading && <p className="text-zinc-500 text-sm">Loading tracks...</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex flex-col w-full max-w-lg pb-12">
            {tracks.map((track) => (
              <button
                key={track.trackId}
                onClick={() => selectTrack(track)}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
              >
                <span className="text-zinc-600 text-sm w-5 text-right shrink-0">{track.trackNumber}</span>
                <span className="text-zinc-200 group-hover:text-white transition-colors">{track.trackName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Typing: split layout ── */}
      {step === "typing" && songData && (
        <div key="typing" className="step-enter flex w-full h-full">

          {/* Left: album art fills full height */}
          <div className="relative w-[42%] shrink-0 h-full bg-black">
            {songData.artworkUrl ? (
              <img
                src={songData.artworkUrl}
                alt={songData.songTitle}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full bg-zinc-900" />
            )}
            {/* Fade into right panel */}
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-black pointer-events-none" />
            {/* Logo watermark */}
            <div className="absolute bottom-6 left-6">
              <span className="text-sm font-black tracking-tight text-white/40">
                Lyric<span className="text-cyan-400/40">Type</span>
              </span>
            </div>
          </div>

          {/* Right: black panel */}
          <div className="flex-1 bg-black flex flex-col px-12 py-8 overflow-hidden">
            {/* Song info + back button */}
            <div className="flex items-start justify-between mb-8 shrink-0">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight leading-tight">{songData.songTitle}</h2>
                <p className="text-zinc-500 mt-1 text-sm">{songData.artist}</p>
              </div>
              <button
                onClick={goBack}
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors shrink-0 ml-8"
              >
                ← Back
              </button>
            </div>

            {/* Typing engine */}
            <TypingTest
              lyrics={songData.lyrics}
              songTitle={songData.songTitle}
              artist={songData.artist}
              accentColor={accentColor}
            />
          </div>

        </div>
      )}
    </main>
  );
}
