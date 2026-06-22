// Plain HTTP calls to the game server. The WebSocket carries all gameplay; this
// is only for the pre-connect room existence check behind `/<CODE>` URLs.

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

// The server speaks HTTP and WS on the same origin (ws→http, wss→https).
export const HTTP_BASE = WS_URL.replace(/^ws/, "http");

/** Whether a joinable room exists for a code. Returns false on any error so the
 *  caller can treat "unknown" the same as "missing" and bounce the user home. */
export async function roomExists(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${HTTP_BASE}/rooms/${encodeURIComponent(code)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { exists?: boolean };
    return Boolean(data.exists);
  } catch {
    return false;
  }
}
