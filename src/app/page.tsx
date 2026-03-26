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
  artistName?: string;
  releaseDate?: string;
  trackCount?: number;
}

interface Track {
  trackId: number;
  trackName: string;
  trackNumber: number;
}

interface SongResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  collectionName: string;
}

interface SongData {
  lyrics: string;
  songTitle: string;
  artist: string;
  artworkUrl?: string;
}

interface TopAlbum {
  name: string;
  artist: string;
  artworkUrl: string;
}

type Step = "search" | "albums" | "tracks" | "typing";

// ── Helpers ────────────────────────────────────────────────────────────────
function bigArtwork(url: string) {
  return url.replace("100x100", "600x600");
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
        if (buckets[best] < 8) { resolve("#22d3ee"); return; }
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
  const [step, setStep]                       = useState<Step>("search");
  const [query, setQuery]                     = useState("");
  const [artists, setArtists]                 = useState<Artist[]>([]);
  const [songs, setSongs]                     = useState<SongResult[]>([]);
  const [albumResults, setAlbumResults]       = useState<Album[]>([]);
  const [selectedArtist, setSelectedArtist]   = useState<Artist | null>(null);
  const [albums, setAlbums]                   = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum]     = useState<Album | null>(null);
  const [tracks, setTracks]                   = useState<Track[]>([]);
  const [songData, setSongData]               = useState<SongData | null>(null);
  const [accentColor, setAccentColor]         = useState("#22d3ee");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Cycling album art
  const [topAlbums, setTopAlbums]   = useState<TopAlbum[]>([]);
  const [albumA, setAlbumA]         = useState("");
  const [albumB, setAlbumB]         = useState("");
  const [showA, setShowA]           = useState(true);
  const cycleIndexRef               = useRef(0);

  // Hover preview
  const [previewUrl, setPreviewUrl]   = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const previewHideRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch artwork for a curated list of iconic albums
  useEffect(() => {
    const ICONIC = [
      "The Dark Side of the Moon Pink Floyd",
      "Thriller Michael Jackson",
      "Abbey Road Beatles",
      "Rumours Fleetwood Mac",
      "Nevermind Nirvana",
      "Random Access Memories Daft Punk",
      "To Pimp a Butterfly Kendrick Lamar",
      "good kid maad city Kendrick Lamar",
      "folklore Taylor Swift",
      "21 Adele",
      "The College Dropout Kanye West",
      "Kind of Blue Miles Davis",
      "channel ORANGE Frank Ocean",
      "IGOR Tyler the Creator",
      "Currents Tame Impala",
      "Purple Rain Prince",
      "Led Zeppelin IV",
      "What's Going On Marvin Gaye",
      "Appetite for Destruction Guns N Roses",
      "The Blueprint Jay-Z",
      "Born to Run Bruce Springsteen",
      "Illmatic Nas",
      "OK Computer Radiohead",
      "Pet Sounds Beach Boys",
      "Blonde on Blonde Bob Dylan",
      "Midnights Taylor Swift",
      "After Hours The Weeknd",
      "Certified Lover Boy Drake",
      "Harry's House Harry Styles",
      "Sour Olivia Rodrigo",
      "Future Nostalgia Dua Lipa",
      "Positions Ariana Grande",
      "Justice Justin Bieber",
      "Fine Line Harry Styles",
      "When We All Fall Asleep Billie Eilish",
      "Melodrama Lorde",
      "A Star Is Born Lady Gaga",
      "Scorpion Drake",
      "The New Abnormal The Strokes",
      "Is This It The Strokes",
    ];

    Promise.all(
      ICONIC.map((q) =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=1`)
          .then((r) => r.json())
          .then((d) => {
            const result = d.results?.[0];
            if (!result?.artworkUrl100) return null;
            return {
              name:       result.collectionName as string,
              artist:     result.artistName as string,
              artworkUrl: (result.artworkUrl100 as string).replace("100x100", "600x600"),
            } as TopAlbum;
          })
          .catch(() => null)
      )
    ).then((results) => {
      const entries = results.filter((r): r is TopAlbum => r !== null);
      // Shuffle so order varies each visit
      entries.sort(() => Math.random() - 0.5);
      setTopAlbums(entries);
      if (entries.length > 0) setAlbumA(entries[0].artworkUrl);
      if (entries.length > 1) setAlbumB(entries[1].artworkUrl);
    });
  }, []);

  // Crossfade cycle every 4s
  useEffect(() => {
    if (topAlbums.length < 2) return;
    const interval = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % topAlbums.length;
      const nextUrl = topAlbums[cycleIndexRef.current].artworkUrl;
      setShowA((prev) => {
        if (prev) setAlbumB(nextUrl);
        else      setAlbumA(nextUrl);
        return !prev;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [topAlbums]);

  // Debounced unified search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSongs([]); setArtists([]); setAlbumResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const [sRes, alRes, aRes] = await Promise.all([
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&attribute=songTerm&limit=5`),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&attribute=albumTerm&limit=100`),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&attribute=artistTerm&limit=4`),
        ]);
        const [sData, alData, aData] = await Promise.all([sRes.json(), alRes.json(), aRes.json()]);
        // Deduplicate song results by collectionId to build unique album cards
        const seenIds = new Set<number>();
        const filteredAlbums = (alData.results ?? [])
          .filter((r: { collectionId?: number; collectionName?: string; artworkUrl100?: string }) => {
            if (!r.collectionId || !r.collectionName || !r.artworkUrl100) return false;
            if (seenIds.has(r.collectionId)) return false;
            seenIds.add(r.collectionId);
            return true;
          })
          .slice(0, 6)
          .map((r: { collectionId: number; collectionName: string; artworkUrl100: string; artistName: string }) => ({
            collectionId: r.collectionId,
            collectionName: r.collectionName,
            artworkUrl100: r.artworkUrl100,
            artistName: r.artistName,
          }));
        setSongs(sData.results ?? []);
        setAlbumResults(filteredAlbums);
        setArtists(aData.results ?? []);
      } catch { /* ignore */ }
    }, 300);
  }, [query]);

  // Select artist → albums
  async function selectArtist(artist: Artist) {
    setSelectedArtist(artist);
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`https://itunes.apple.com/lookup?id=${artist.artistId}&entity=album&limit=200&sort=recent`);
      const data = await res.json();
      setAlbums(data.results.filter((r: { wrapperType: string }) => r.wrapperType === "collection"));
      setStep("albums");
    } catch { setError("Failed to load albums."); }
    finally  { setLoading(false); }
  }

  // Select album → tracks
  async function selectAlbum(album: Album) {
    setSelectedAlbum(album);
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`https://itunes.apple.com/lookup?id=${album.collectionId}&entity=song`);
      const data = await res.json();
      setTracks(
        data.results
          .filter((r: { wrapperType: string }) => r.wrapperType === "track")
          .sort((a: Track, b: Track) => a.trackNumber - b.trackNumber)
      );
      setStep("tracks");
    } catch { setError("Failed to load tracks."); }
    finally  { setLoading(false); }
  }

  // Select album directly from search (sets a stub artist so selectTrack works)
  async function selectAlbumFromSearch(album: Album) {
    setSelectedArtist({ artistId: 0, artistName: album.artistName ?? "" });
    await selectAlbum(album);
  }

  // Select track from album browser → typing
  async function selectTrack(track: Track) {
    if (!selectedArtist) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(selectedArtist.artistName)}/${encodeURIComponent(track.trackName)}`);
      if (!res.ok) { setError("Lyrics not found for this song."); return; }
      const data = await res.json();
      if (!data.lyrics) { setError("Lyrics not found for this song."); return; }
      const artUrl = selectedAlbum ? bigArtwork(selectedAlbum.artworkUrl100) : undefined;
      setSongData({ lyrics: data.lyrics, songTitle: track.trackName, artist: selectedArtist.artistName, artworkUrl: artUrl });
      if (artUrl) extractAccentColor(artUrl).then(setAccentColor);
      setStep("typing");
    } catch { setError("Something went wrong fetching lyrics."); }
    finally  { setLoading(false); }
  }

  // Select song directly from search → typing (skips albums/tracks)
  async function selectSong(song: SongResult) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artistName)}/${encodeURIComponent(song.trackName)}`);
      if (!res.ok) { setError("Lyrics not found for this song."); return; }
      const data = await res.json();
      if (!data.lyrics) { setError("Lyrics not found for this song."); return; }
      const artUrl = bigArtwork(song.artworkUrl100);
      setSongData({ lyrics: data.lyrics, songTitle: song.trackName, artist: song.artistName, artworkUrl: artUrl });
      extractAccentColor(artUrl).then(setAccentColor);
      setSelectedAlbum(null); // mark as direct pick (goBack uses this)
      setStep("typing");
    } catch { setError("Something went wrong fetching lyrics."); }
    finally  { setLoading(false); }
  }

  function goBack() {
    setError(null);
    if (step === "albums") { setStep("search"); setAlbums([]); setSelectedArtist(null); }
    if (step === "tracks") { setStep("albums"); setTracks([]); setSelectedAlbum(null); }
    if (step === "typing") {
      setSongData(null);
      // If we got here via direct song search, selectedAlbum is null → back to search
      setStep(selectedAlbum ? "tracks" : "search");
    }
  }

  function hoverPreview(artUrl: string) {
    if (previewHideRef.current) clearTimeout(previewHideRef.current);
    setPreviewUrl(artUrl);
    setShowPreview(true);
  }

  function clearPreview() {
    setShowPreview(false);
    previewHideRef.current = setTimeout(() => setPreviewUrl(""), 600);
  }

  const isSplitLayout = step === "search" || step === "typing";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main
      className={isSplitLayout ? "h-screen overflow-hidden flex" : "min-h-screen flex flex-col overflow-hidden"}
      style={!isSplitLayout ? { background: "radial-gradient(ellipse at 50% 0%, #1a4a6b 0%, #0d2540 70%)" } : undefined}
    >
      {/* Header — only for albums / tracks */}
      {!isSplitLayout && (
        <header className="flex items-center justify-between px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white leading-none">
                Lyric<span className="text-cyan-400">Type</span>
              </h1>
              <p className="text-xs text-zinc-500 tracking-widest uppercase mt-0.5">Type the lyrics. Feel the music.</p>
            </div>
          </div>
          <button
            onClick={goBack}
            className="step-enter rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            ← Back
          </button>
        </header>
      )}

      {/* ── Search: split layout with cycling art ── */}
      {step === "search" && (
        <div key="search" className="step-enter flex w-full h-full">

          {/* Left: cycling art + hover preview layer */}
          <div className="relative w-[42%] shrink-0 h-full bg-black overflow-hidden">
            {albumA && (
              <img src={albumA} alt=""
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ${showA ? "opacity-100" : "opacity-0"}`}
              />
            )}
            {albumB && (
              <img src={albumB} alt=""
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ${showA ? "opacity-0" : "opacity-100"}`}
              />
            )}
            {/* Hover preview — fades in over cycling art */}
            {previewUrl && (
              <img src={previewUrl} alt=""
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 z-10 ${showPreview ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </div>

          {/* Right: black panel */}
          <div className="flex-1 bg-black flex flex-col px-12 py-10 overflow-y-auto">
            {/* Logo */}
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-white leading-none">
                    Lyric<span className="text-cyan-400">Type</span>
                  </h1>
                  <p className="text-xs text-zinc-500 tracking-widest uppercase mt-0.5">Type the lyrics. Feel the music.</p>
                </div>
              </div>
            </div>

            {/* Single search bar */}
            <input
              type="text"
              placeholder="Search songs, albums, or artists..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 text-zinc-100 placeholder-zinc-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors mb-2"
            />

            {error   && <p className="text-red-400 text-sm mt-2">{error}</p>}
            {loading && <p className="text-zinc-500 text-sm mt-2">Loading...</p>}

            {/* Results — 3 columns side by side */}
            {(songs.length > 0 || albumResults.length > 0 || artists.length > 0) && (
              <div className="mt-5 flex gap-4 flex-1 min-h-0">

                {/* Songs */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Songs</p>
                  {songs.map((s) => (
                    <button key={s.trackId}
                      onClick={() => selectSong(s)}
                      onMouseEnter={() => hoverPreview(s.artworkUrl100.replace("100x100", "600x600"))}
                      onMouseLeave={clearPreview}
                      className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    >
                      <img src={s.artworkUrl100} alt={s.trackName} className="w-8 h-8 rounded object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="text-zinc-100 text-xs font-medium group-hover:text-white transition-colors truncate">{s.trackName}</p>
                        <p className="text-zinc-500 text-xs truncate">{s.artistName}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="w-px bg-zinc-800 shrink-0" />

                {/* Albums */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Albums</p>
                  {albumResults.map((al) => {
                    return (
                      <button key={al.collectionId}
                        onClick={() => selectAlbumFromSearch(al)}
                        onMouseEnter={() => hoverPreview(al.artworkUrl100.replace("100x100", "600x600"))}
                        onMouseLeave={clearPreview}
                        className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <img src={al.artworkUrl100} alt={al.collectionName} className="w-8 h-8 rounded object-cover shrink-0" />
                        <div className="min-w-0">
                          <p className="text-zinc-100 text-xs font-medium group-hover:text-white transition-colors truncate">{al.collectionName}</p>
                          <p className="text-zinc-500 text-xs truncate">{al.artistName}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Divider */}
                <div className="w-px bg-zinc-800 shrink-0" />

                {/* Artists */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Artists</p>
                  {artists.map((a) => (
                    <button key={a.artistId}
                      onClick={() => selectArtist(a)}
                      className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <p className="text-zinc-200 text-xs font-medium group-hover:text-white transition-colors truncate">{a.artistName}</p>
                      {a.primaryGenreName && <p className="text-zinc-600 text-xs truncate">{a.primaryGenreName}</p>}
                    </button>
                  ))}
                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Albums ── */}
      {step === "albums" && (
        <div key="albums" className="step-enter flex flex-1 flex-col items-center px-6 pt-6 gap-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-white">{selectedArtist?.artistName}</h2>
          {loading && <p className="text-zinc-500 text-sm">Loading albums...</p>}
          {error   && <p className="text-red-400 text-sm">{error}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-3xl pb-12">
            {albums.map((album) => (
              <button key={album.collectionId} onClick={() => selectAlbum(album)} className="flex flex-col gap-2 text-left group">
                <div className="aspect-square w-full overflow-hidden rounded-lg">
                  <img
                    src={bigArtwork(album.artworkUrl100)}
                    alt={album.collectionName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
                <div>
                  <p className="text-zinc-100 text-sm font-medium leading-tight line-clamp-2">{album.collectionName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{album.releaseDate ? new Date(album.releaseDate).getFullYear() : ""}</p>
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
              <img src={bigArtwork(selectedAlbum.artworkUrl100)} alt={selectedAlbum.collectionName} className="w-24 h-24 rounded-lg object-cover shrink-0" />
            )}
            <div>
              <h2 className="text-xl font-bold text-white">{selectedAlbum?.collectionName}</h2>
              <p className="text-zinc-400 text-sm">{selectedArtist?.artistName}</p>
            </div>
          </div>
          {loading && <p className="text-zinc-500 text-sm">Loading tracks...</p>}
          {error   && <p className="text-red-400 text-sm">{error}</p>}
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

          {/* Left: album art */}
          <div className="relative w-[42%] shrink-0 h-full bg-black">
            {songData.artworkUrl ? (
              <img src={songData.artworkUrl} alt={songData.songTitle} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-zinc-900" />
            )}
            <div className="absolute bottom-6 left-6 flex items-center gap-2 opacity-30">
              <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              </div>
              <span className="text-sm font-black tracking-tight text-white">
                Lyric<span className="text-cyan-400">Type</span>
              </span>
            </div>
          </div>

          {/* Right: black panel */}
          <div className="flex-1 bg-black flex flex-col px-12 py-8 overflow-hidden">
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
