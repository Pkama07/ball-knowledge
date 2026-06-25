// ShotFor.Me game server.
//
// An HTTP server with a /health check, plus a WebSocket endpoint where all the
// room/game traffic flows. Each socket is authenticated at connect time with a
// Supabase access token (passed as the "bearer" subprotocol); the verified user
// id becomes the player's identity. The GameHub owns the room state; this file
// just verifies and wires sockets to it.

import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { GameHub } from "./hub.js";
import { verifyToken } from "./auth.js";

const PORT = Number(process.env.PORT ?? 4000);
const AUTH_DISABLED = process.env.AUTH_DISABLED === "1";
// Origin allowed to call the existence-check endpoint cross-origin. `*` is fine
// for this unauthenticated, read-only check; set CLIENT_ORIGIN to lock it down.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // GET /rooms/:code — does a joinable room exist? Lets the client decide
  // whether a `/<CODE>` visit proceeds to a name prompt or bounces home.
  const roomMatch = req.url && /^\/rooms\/([^/?#]+)/.exec(req.url);
  if (roomMatch && req.method === "GET") {
    const code = decodeURIComponent(roomMatch[1]);
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": CLIENT_ORIGIN,
    });
    res.end(JSON.stringify({ exists: hub.hasRoom(code) }));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

// Echo back the "bearer" subprotocol so browsers accept the handshake. The JWT
// itself is the second offered protocol; we never select it as the protocol.
const wss = new WebSocketServer({
  server: httpServer,
  handleProtocols: (protocols) => (protocols.has("bearer") ? "bearer" : false),
});
const hub = new GameHub();

wss.on("connection", (conn: WebSocket, req: IncomingMessage) => {
  // Verifying the token is async (it may fetch the JWKS), but the client sends
  // its first message — e.g. `create` — the instant the socket opens. If we only
  // attached the `message` listener after the await, that first message would be
  // emitted with no listener and silently dropped, so the action appeared to need
  // a second click. Instead we attach the listener synchronously and buffer
  // anything that arrives before auth finishes, then flush it in order.
  let ready = false;
  const pending: string[] = [];

  conn.on("message", (data) => {
    const text = data.toString();
    if (ready) hub.onMessage(conn, text);
    else pending.push(text);
  });
  conn.on("close", () => hub.onClose(conn));
  conn.on("error", () => hub.onClose(conn));

  void (async () => {
    let userId: string;
    if (AUTH_DISABLED) {
      // Local/smoke mode: skip verification, assign a throwaway identity.
      userId = randomUUID();
    } else {
      const token = extractToken(req);
      if (!token) {
        conn.close(1008, "unauthorized");
        return;
      }
      try {
        ({ userId } = await verifyToken(token));
      } catch {
        conn.close(1008, "unauthorized");
        return;
      }
    }

    // The socket may have closed while we were verifying.
    if (conn.readyState !== conn.OPEN) return;

    hub.attach(conn, userId);
    ready = true;
    for (const text of pending) hub.onMessage(conn, text);
    pending.length = 0;
  })();
});

/**
 * Pull the access token from the handshake. The client offers two subprotocols,
 * ["bearer", <jwt>], so the token is the second entry of Sec-WebSocket-Protocol.
 * Falls back to a `?token=` query param.
 */
function extractToken(req: IncomingMessage): string | null {
  const header = req.headers["sec-websocket-protocol"];
  if (header) {
    const parts = header.split(",").map((p) => p.trim());
    const idx = parts.indexOf("bearer");
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  }
  if (req.url) {
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    if (token) return token;
  }
  return null;
}

httpServer.listen(PORT, () => {
  console.log(`[ball-knowledge] server listening on http://localhost:${PORT}`);
  console.log(`[ball-knowledge] websocket endpoint ws://localhost:${PORT}`);
  if (AUTH_DISABLED) console.log("[ball-knowledge] AUTH_DISABLED — tokens not verified");
});
