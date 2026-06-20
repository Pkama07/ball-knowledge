import { WebSocket } from "ws";
import type { ServerMessage } from "@ball-knowledge/shared";

/** Send a typed server message over a socket, if it's still open. */
export function send(conn: WebSocket, msg: ServerMessage): void {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(JSON.stringify(msg));
  }
}
