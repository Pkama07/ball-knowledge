// Client-side iTunes Search API helpers.
//
// We use JSONP rather than fetch(): the iTunes Search API does not reliably
// send CORS headers, so a plain fetch() from the browser often fails. iTunes
// does support a `callback` query param, which lets us load results via a
// <script> tag from any origin.

export interface Artist {
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
}

export interface Track {
  trackId: number;
  trackName: string;
  collectionName: string;
  artworkUrl100?: string;
  previewUrl: string;
}

interface ITunesResponse<T> {
  resultCount: number;
  results: T[];
}

// Raw track shape from the lookup endpoint, before we narrow to playable songs.
interface RawTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

let jsonpCounter = 0;

function jsonp<T>(url: string): Promise<ITunesResponse<T>> {
  return new Promise((resolve, reject) => {
    const callbackName = `__itunes_jsonp_${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement("script");
    const globals = window as unknown as Record<string, unknown>;

    const cleanup = () => {
      delete globals[callbackName];
      script.remove();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("iTunes request timed out"));
    }, 10000);

    globals[callbackName] = (data: ITunesResponse<T>) => {
      clearTimeout(timeout);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("iTunes request failed"));
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

// Search for artists by name.
export async function searchArtists(term: string): Promise<Artist[]> {
  const url =
    `https://itunes.apple.com/search` +
    `?term=${encodeURIComponent(term)}` +
    `&entity=musicArtist&limit=8`;
  const data = await jsonp<Artist>(url);
  return data.results ?? [];
}

// Look up a given artist's songs that have playable previews.
export async function getArtistTracks(
  artistId: number,
  limit = 50
): Promise<Track[]> {
  // The lookup endpoint with entity=song returns the artist record first,
  // followed by their songs. We over-fetch and filter to playable previews.
  const url =
    `https://itunes.apple.com/lookup` +
    `?id=${artistId}` +
    `&entity=song&limit=${limit}`;
  const data = await jsonp<RawTrack>(url);
  const results = data.results ?? [];

  // First result is the artist; the rest are tracks. Keep only songs that
  // actually have a preview URL we can play.
  return results.filter(
    (r): r is Track =>
      r.wrapperType === "track" && r.kind === "song" && Boolean(r.previewUrl)
  );
}
