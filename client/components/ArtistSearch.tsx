"use client";

import { useEffect, useRef, useState } from "react";
import { searchArtists, type Artist } from "@/lib/itunes";

// Wait this long after the last keystroke before firing a search, so we don't
// hit iTunes on every character.
const SEARCH_DEBOUNCE_MS = 300;

/** A search box that live-populates artist results as the user types. Picking a
 *  result calls `onSelect`. Designed to be embedded (e.g. in the lobby). */
export function ArtistSearch({
  onSelect,
}: {
  onSelect: (artistId: number, artistName: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Monotonic id so a slow earlier request can't clobber a newer one's results.
  const searchSeq = useRef(0);

  // Auto-search as the user types (debounced). Only the latest in-flight
  // request is allowed to commit its results.
  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setArtists([]);
      setError("");
      setLoading(false);
      return;
    }

    const seq = ++searchSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchArtists(q);
        if (seq !== searchSeq.current) return; // a newer search superseded this
        setArtists(results);
        setError(results.length === 0 ? "No artists found." : "");
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setError(err instanceof Error ? err.message : "Search failed.");
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  return (
    // `relative` anchors the floating results dropdown so it overlays the
    // content below instead of pushing it down the page.
    <div className="relative">
      <input
        type="text"
        autoFocus
        placeholder="Search an artist (e.g. Daft Punk)"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full rounded-lg border border-edge bg-neutral-900 px-4 py-2.5 pr-11 text-base text-neutral-100 outline-none focus:border-accent"
      />
      {loading && (
        <div className="absolute right-3.5 top-[1.35rem] h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-edge border-t-accent" />
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {artists.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-2 flex max-h-72 flex-col gap-1 overflow-auto rounded-lg border border-edge bg-panel p-1.5 shadow-2xl shadow-black/50">
          {artists.map((a) => (
            <li key={a.artistId}>
              <button
                type="button"
                onClick={() => onSelect(a.artistId, a.artistName)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-neutral-800"
              >
                <span className="min-w-0 truncate">
                  {a.artistName}{" "}
                  {a.primaryGenreName && (
                    <span className="text-neutral-400">
                      · {a.primaryGenreName}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
