"use client";

import { useState } from "react";
import { searchArtists, type Artist } from "@/lib/itunes";

export function ChooseArtist({
  onSelect,
  onCancel,
}: {
  onSelect: (artistId: number, artistName: string) => void;
  onCancel?: () => void;
}) {
  const [term, setTerm] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setError("");
    setLoading(true);
    try {
      const results = await searchArtists(term.trim());
      setArtists(results);
      if (results.length === 0) setError("No artists found.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold">Choose an artist</h2>
      <p className="mb-5 mt-1 text-neutral-400">
        The game will play clips from this artist&apos;s catalogue.
      </p>

      <form className="mb-4 flex gap-2" onSubmit={handleSearch}>
        <input
          type="text"
          autoFocus
          placeholder="Artist name (e.g. Daft Punk)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="flex-1 rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

      {error && <p className="my-3 text-red-400">{error}</p>}

      <ul className="flex flex-col gap-2">
        {artists.map((a) => (
          <li
            key={a.artistId}
            className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3"
          >
            <span>
              {a.artistName}{" "}
              {a.primaryGenreName && (
                <span className="text-neutral-400">· {a.primaryGenreName}</span>
              )}
            </span>
            <button
              onClick={() => onSelect(a.artistId, a.artistName)}
              className="rounded-lg bg-neutral-800 px-4 py-2 font-semibold text-neutral-100 hover:bg-neutral-700"
            >
              Choose
            </button>
          </li>
        ))}
      </ul>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-5 text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← Back to lobby
        </button>
      )}
    </div>
  );
}
