// Ball Knowledge game server.
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

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
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

wss.on("connection", async (conn: WebSocket, req: IncomingMessage) => {
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

  hub.attach(conn, userId);
  conn.on("message", (data) => hub.onMessage(conn, data.toString()));
  conn.on("close", () => hub.onClose(conn));
  conn.on("error", () => hub.onClose(conn));
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
