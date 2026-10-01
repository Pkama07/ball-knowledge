// Server-side iTunes Search API access.
//
// Unlike the client (which must use JSONP to dodge CORS), the server can hit
// the API with a plain fetch and parse JSON directly. The server fetches the
// playlist because it owns the answers — clients never see the song list.

import type { Song } from "@ball-knowledge/shared";

interface RawTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  artistId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

interface ITunesResponse<T> {
  resultCount: number;
  results: T[];
}

/** Look up an artist's songs that have playable preview clips. */
export async function fetchArtistSongs(
  artistId: number,
  limit = 200 // iTunes' max — a deep pool keeps games from repeating the same hits
): Promise<Song[]> {
  const url =
    `https://itunes.apple.com/lookup` +
    `?id=${artistId}&entity=song&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iTunes lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as ITunesResponse<RawTrack>;

  // First result is the artist record; the rest are tracks (roughly in
  // popularity order). Keep only songs with a preview URL, drop repeat versions
  // of the same song, and normalize into our Song shape.
  const seen = new Set<string>();
  return (data.results ?? [])
    .filter(
      (r) =>
        r.wrapperType === "track" &&
        r.kind === "song" &&
        Boolean(r.previewUrl) &&
        Boolean(r.trackName)
    )
    .filter((r) => {
      const key = dedupeKey(r.trackName!);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      trackId: r.trackId!,
      artistId: r.artistId,
      title: r.trackName!,
      artist: r.artistName ?? "",
      album: r.collectionName ?? "",
      artworkUrl: r.artworkUrl100,
      previewUrl: r.previewUrl!,
    }));
}

/** Collapse versions of the same song ("Anti-Hero", "Anti-Hero (Live)",
 *  "Clean - Remastered", "Love Story (Taylor's Version)") to one key. */
function dedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
