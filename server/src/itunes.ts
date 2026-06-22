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
  limit = 50
): Promise<Song[]> {
  const url =
    `https://itunes.apple.com/lookup` +
    `?id=${artistId}&entity=song&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iTunes lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as ITunesResponse<RawTrack>;

  // First result is the artist record; the rest are tracks. Keep only songs
  // with a preview URL, and normalize into our Song shape.
  return (data.results ?? [])
    .filter(
      (r) =>
        r.wrapperType === "track" &&
        r.kind === "song" &&
        Boolean(r.previewUrl) &&
        Boolean(r.trackName)
    )
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
