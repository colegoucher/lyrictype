"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
        canvas.width = 60; canvas.height = 60;
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
      } catch { resolve("#22d3ee"); }
    };
    img.onerror = () => resolve("#22d3ee");
    img.src = imageUrl;
  });
}

// Logo mark — reused in left panel and header
function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-6 h-6 rounded-md" : "w-9 h-9 rounded-lg";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  const text = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${box} bg-cyan-500 flex items-center justify-center shrink-0`}>
        <svg className={`${icon} text-black`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
      <div>
        <div className={`${text} font-black tracking-tight text-white leading-none`}>
          Lyric<span className="text-cyan-400">Type</span>
        </div>
        {size === "md" && (
          <div className="text-xs text-zinc-600 tracking-widest uppercase mt-0.5">Type the lyrics.</div>
        )}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep]                     = useState<Step>("search");
  const [query, setQuery]                   = useState("");
  const [artists, setArtists]               = useState<Artist[]>([]);
  const [songs, setSongs]                   = useState<SongResult[]>([]);
  const [albumResults, setAlbumResults]     = useState<Album[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [albums, setAlbums]                 = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum]   = useState<Album | null>(null);
  const [tracks, setTracks]                 = useState<Track[]>([]);
  const [songData, setSongData]             = useState<SongData | null>(null);
  const [accentColor, setAccentColor]       = useState("#22d3ee");
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // ── Unified left-panel art crossfade ──
  const [artA, setArtA]     = useState("");
  const [artB, setArtB]     = useState("");
  const [showArt, setShowArt] = useState(true);
  const showArtRef            = useRef(true);

  // Hover preview layer (z-10 above art)
  const [previewUrl, setPreviewUrl]   = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const previewHideRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cycling
  const [topAlbums, setTopAlbums] = useState<TopAlbum[]>([]);
  const cycleIndexRef             = useRef(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Crossfade left panel to a new url
  const transitionArt = useCallback((newUrl: string) => {
    if (!newUrl) return;
    if (showArtRef.current) {
      setArtB(newUrl);
      setShowArt(false);
      showArtRef.current = false;
    } else {
      setArtA(newUrl);
      setShowArt(true);
      showArtRef.current = true;
    }
  }, []);

  // ── Load iconic albums for cycling ──
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
      "Whats Going On Marvin Gaye",
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
      "Harrys House Harry Styles",
      "Sour Olivia Rodrigo",
      "Future Nostalgia Dua Lipa",
      "Positions Ariana Grande",
      "Fine Line Harry Styles",
      "When We All Fall Asleep Where Do We Go Billie Eilish",
      "Melodrama Lorde",
      "Scorpion Drake",
      "The New Abnormal The Strokes",
      "Is This It The Strokes",
      "Norman Fucking Rockwell Lana Del Rey",
      "Ctrl SZA",
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
      entries.sort(() => Math.random() - 0.5);
      setTopAlbums(entries);
      if (entries.length > 0) {
        setArtA(entries[0].artworkUrl);
        showArtRef.current = true;
        setShowArt(true);
      }
      if (entries.length > 1) setArtB(entries[1].artworkUrl);
    });
  }, []);

  // ── Cycle art every 4s when on search step ──
  useEffect(() => {
    if (step !== "search" || topAlbums.length < 2) return;
    const interval = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % topAlbums.length;
      transitionArt(topAlbums[cycleIndexRef.current].artworkUrl);
    }, 4000);
    return () => clearInterval(interval);
  }, [step, topAlbums, transitionArt]);

  // ── Debounced unified search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSongs([]); setArtists([]); setAlbumResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const [sRes, alRes, aRes] = await Promise.all([
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&attribute=songTerm&limit=6`),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&attribute=albumTerm&limit=100`),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&attribute=artistTerm&limit=4`),
        ]);
        const [sData, alData, aData] = await Promise.all([sRes.json(), alRes.json(), aRes.json()]);
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
            collectionId:   r.collectionId,
            collectionName: r.collectionName,
            artworkUrl100:  r.artworkUrl100,
            artistName:     r.artistName,
          }));
        setSongs(sData.results ?? []);
        setAlbumResults(filteredAlbums);
        setArtists(aData.results ?? []);
      } catch { /* ignore */ }
    }, 280);
  }, [query]);

  // ── Navigation ──
  async function selectArtist(artist: Artist) {
    setSelectedArtist(artist);
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`https://itunes.apple.com/lookup?id=${artist.artistId}&entity=album&limit=200&sort=recent`);
      const data = await res.json();
      const artistAlbums: Album[] = data.results.filter((r: { wrapperType: string }) => r.wrapperType === "collection");
      setAlbums(artistAlbums);
      // Transition left panel to artist's first album art
      if (artistAlbums[0]?.artworkUrl100) transitionArt(bigArtwork(artistAlbums[0].artworkUrl100));
      setStep("albums");
    } catch { setError("Failed to load albums."); }
    finally  { setLoading(false); }
  }

  async function selectAlbum(album: Album) {
    setSelectedAlbum(album);
    setLoading(true);
    setError(null);
    // Transition left panel to album art immediately
    transitionArt(bigArtwork(album.artworkUrl100));
    try {
      const res  = await fetch(`https://itunes.apple.com/lookup?id=${album.collectionId}&entity=song`);
      const data = await res.json();
      setTracks(
        data.results
          .filter((r: { wrapperType: string }) => r.wrapperType === "track")
          .sort((a: Track, b: Track) => a.trackNumber - b.trackNumber)
      );
      setShowPreview(false);
      setStep("tracks");
    } catch { setError("Failed to load tracks."); }
    finally  { setLoading(false); }
  }

  async function selectAlbumFromSearch(album: Album) {
    if (previewHideRef.current) clearTimeout(previewHideRef.current);
    setPreviewUrl(bigArtwork(album.artworkUrl100));
    setShowPreview(true);
    setSelectedArtist({ artistId: 0, artistName: album.artistName ?? "" });
    await selectAlbum(album);
  }

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
      if (artUrl) {
        transitionArt(artUrl);
        extractAccentColor(artUrl).then(setAccentColor);
      }
      setSongData({ lyrics: data.lyrics, songTitle: track.trackName, artist: selectedArtist.artistName, artworkUrl: artUrl });
      setStep("typing");
    } catch { setError("Something went wrong fetching lyrics."); }
    finally  { setLoading(false); }
  }

  async function selectSong(song: SongResult) {
    // Immediately show the clicked song's art — prevents any flash of wrong art
    const artUrl = bigArtwork(song.artworkUrl100);
    if (previewHideRef.current) clearTimeout(previewHideRef.current);
    setPreviewUrl(artUrl);
    setShowPreview(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artistName)}/${encodeURIComponent(song.trackName)}`);
      if (!res.ok) { setError("Lyrics not found for this song."); return; }
      const data = await res.json();
      if (!data.lyrics) { setError("Lyrics not found for this song."); return; }
      transitionArt(artUrl);   // base layer transitions to same art
      extractAccentColor(artUrl).then(setAccentColor);
      setSongData({ lyrics: data.lyrics, songTitle: song.trackName, artist: song.artistName, artworkUrl: artUrl });
      setSelectedAlbum(null);
      setShowPreview(false);   // fade preview out — base now matches, so no visible change
      setStep("typing");
    } catch { setError("Something went wrong fetching lyrics."); }
    finally  { setLoading(false); }
  }

  function goBack() {
    setError(null);
    if (step === "albums") {
      setAlbums([]);
      setSelectedArtist(null);
      // Resume cycling
      if (topAlbums.length > 0) transitionArt(topAlbums[cycleIndexRef.current % topAlbums.length].artworkUrl);
      setStep("search");
    } else if (step === "tracks") {
      setTracks([]);
      setSelectedAlbum(null);
      if (albums[0]?.artworkUrl100) transitionArt(bigArtwork(albums[0].artworkUrl100));
      setStep("albums");
    } else if (step === "typing") {
      setSongData(null);
      if (selectedAlbum) {
        transitionArt(bigArtwork(selectedAlbum.artworkUrl100));
        setStep("tracks");
      } else {
        if (topAlbums.length > 0) transitionArt(topAlbums[cycleIndexRef.current % topAlbums.length].artworkUrl);
        setStep("search");
      }
    }
  }

  function hoverPreview(artUrl: string) {
    if (previewHideRef.current) clearTimeout(previewHideRef.current);
    setPreviewUrl(artUrl);
    setShowPreview(true);
  }

  function clearPreview() {
    setShowPreview(false);
    previewHideRef.current = setTimeout(() => setPreviewUrl(""), 500);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="h-screen overflow-hidden flex bg-[#252525]">

      {/* ── Left panel: full-bleed art with depth effect ── */}
      <div className="relative w-[42%] shrink-0 h-full bg-[#252525] p-2.5">
        {/* Art fills the padded area — thin background border creates depth */}
        <div className="relative w-full h-full rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.7)]">
          {artA && (
            <img
              src={artA} alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${showArt ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {artB && (
            <img
              src={artB} alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${showArt ? "opacity-0" : "opacity-100"}`}
            />
          )}
          {/* Hover preview */}
          {previewUrl && (
            <img
              src={previewUrl} alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 z-10 ${showPreview ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 bg-[#252525] flex flex-col overflow-hidden">

        {/* ── Search ── */}
        {step === "search" && (
          <div key="search" className="step-enter flex flex-col px-10 py-10 h-full overflow-y-auto">
            <div className="mb-8">
              <LogoMark />
            </div>

            {/* Search input */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search songs, albums, or artists..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="w-full rounded-xl bg-zinc-900/60 border border-zinc-800 pl-10 pr-4 py-3.5 text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:bg-zinc-800/60 transition-all text-sm"
              />
            </div>

            {error   && <p className="text-red-400 text-sm mt-3">{error}</p>}
            {loading && (
              <div className="flex items-center gap-2 mt-4 text-zinc-600 text-sm">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="20 60" />
                </svg>
                Loading...
              </div>
            )}

            {/* Results */}
            {(songs.length > 0 || albumResults.length > 0 || artists.length > 0) ? (
              <div className="results-enter mt-6 flex gap-5 flex-1 min-h-0">
                {/* Songs */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2 font-medium">Songs</p>
                  <div className="flex flex-col gap-0.5">
                    {songs.map((s) => (
                      <button key={s.trackId}
                        onClick={() => selectSong(s)}
                        onMouseEnter={() => hoverPreview(bigArtwork(s.artworkUrl100))}
                        onMouseLeave={clearPreview}
                        className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <img src={s.artworkUrl100} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                        <div className="min-w-0">
                          <p className="text-zinc-200 text-xs font-medium group-hover:text-white transition-colors truncate">{s.trackName}</p>
                          <p className="text-zinc-600 text-xs truncate">{s.artistName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px bg-zinc-900 shrink-0" />

                {/* Albums */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2 font-medium">Albums</p>
                  <div className="flex flex-col gap-0.5">
                    {albumResults.map((al) => (
                      <button key={al.collectionId}
                        onClick={() => selectAlbumFromSearch(al)}
                        onMouseEnter={() => hoverPreview(bigArtwork(al.artworkUrl100))}
                        onMouseLeave={clearPreview}
                        className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <img src={al.artworkUrl100} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                        <div className="min-w-0">
                          <p className="text-zinc-200 text-xs font-medium group-hover:text-white transition-colors truncate">{al.collectionName}</p>
                          <p className="text-zinc-600 text-xs truncate">{al.artistName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px bg-zinc-900 shrink-0" />

                {/* Artists */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2 font-medium">Artists</p>
                  <div className="flex flex-col gap-0.5">
                    {artists.map((a) => (
                      <button key={a.artistId}
                        onClick={() => selectArtist(a)}
                        className="w-full text-left px-2 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <p className="text-zinc-200 text-xs font-medium group-hover:text-white transition-colors truncate">{a.artistName}</p>
                        {a.primaryGenreName && <p className="text-zinc-600 text-xs truncate mt-0.5">{a.primaryGenreName}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : query.trim() === "" ? (
              /* Empty state */
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-zinc-700 text-sm">
                  Start typing to search across millions of songs.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Bohemian Rhapsody", "Blinding Lights", "Lose Yourself", "Hotline Bling"].map((hint) => (
                    <button
                      key={hint}
                      onClick={() => setQuery(hint)}
                      className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs hover:border-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Albums ── */}
        {step === "albums" && (
          <div key="albums" className="step-enter flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-10 py-7 shrink-0 border-b border-zinc-900">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedArtist?.artistName}</h2>
                <p className="text-zinc-600 text-xs mt-0.5">{albums.length} albums</p>
              </div>
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Back
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 px-10 py-4 text-zinc-600 text-sm">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="20 60" />
                </svg>
                Loading albums...
              </div>
            )}
            {error && <p className="text-red-400 text-sm px-10 py-4">{error}</p>}

            <div className="overflow-y-auto flex-1 px-10 py-6">
              <div className="grid grid-cols-3 gap-5 pb-10">
                {albums.map((album) => (
                  <button
                    key={album.collectionId}
                    onClick={() => selectAlbum(album)}
                    onMouseEnter={() => hoverPreview(bigArtwork(album.artworkUrl100))}
                    onMouseLeave={clearPreview}
                    className="flex flex-col gap-2 text-left group"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-900">
                      <img
                        src={bigArtwork(album.artworkUrl100)}
                        alt={album.collectionName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div>
                      <p className="text-zinc-200 text-xs font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">{album.collectionName}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">{album.releaseDate ? new Date(album.releaseDate).getFullYear() : ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tracks ── */}
        {step === "tracks" && (
          <div key="tracks" className="step-enter flex flex-col h-full overflow-hidden">
            {/* Album header */}
            <div className="flex items-start justify-between px-10 py-7 shrink-0 border-b border-zinc-900">
              <div className="flex items-center gap-4">
                {selectedAlbum && (
                  <img
                    src={bigArtwork(selectedAlbum.artworkUrl100)}
                    alt={selectedAlbum.collectionName}
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                  />
                )}
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">{selectedAlbum?.collectionName}</h2>
                  <p className="text-zinc-500 text-xs mt-0.5">{selectedArtist?.artistName}</p>
                  {selectedAlbum?.releaseDate && (
                    <p className="text-zinc-700 text-xs mt-0.5">{new Date(selectedAlbum.releaseDate).getFullYear()}</p>
                  )}
                </div>
              </div>
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm shrink-0 ml-4"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Back
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 px-10 py-4 text-zinc-600 text-sm">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="20 60" />
                </svg>
                Loading tracks...
              </div>
            )}
            {error && <p className="text-red-400 text-sm px-10 py-4">{error}</p>}

            <div className="overflow-y-auto flex-1 py-2">
              {tracks.map((track, idx) => (
                <button
                  key={track.trackId}
                  onClick={() => selectTrack(track)}
                  className="flex items-center gap-4 w-full px-10 py-2.5 hover:bg-white/5 transition-colors text-left group"
                >
                  <span className="text-zinc-700 text-xs font-mono w-5 text-right shrink-0 group-hover:text-zinc-500 transition-colors">
                    {idx + 1}
                  </span>
                  <span className="text-zinc-300 text-sm group-hover:text-white transition-colors">{track.trackName}</span>
                  <svg className="w-3.5 h-3.5 text-zinc-700 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Typing ── */}
        {step === "typing" && songData && (
          <div key="typing" className="step-enter flex flex-col px-10 py-8 h-full overflow-hidden">
            {/* Song header */}
            <div className="mb-7 shrink-0">
              <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">{songData.songTitle}</h2>
              <p className="text-zinc-500 text-sm mt-1">{songData.artist}</p>
            </div>

            <div className="flex-1 min-h-0">
              <TypingTest
                lyrics={songData.lyrics}
                songTitle={songData.songTitle}
                artist={songData.artist}
                accentColor={accentColor}
                onBack={goBack}
              />
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
