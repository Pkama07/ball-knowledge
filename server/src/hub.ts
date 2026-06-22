// Connection hub: owns the set of rooms, maps each socket to its room +
// player, and routes incoming client messages to the right room method.

import { WebSocket } from "ws";
import {
  GAME_DEFAULTS,
  type ClientMessage,
  type RoomConfig,
} from "@ball-knowledge/shared";
import { Room } from "./room.js";
import { send } from "./net.js";

interface Membership {
  code: string;
  playerId: string;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // letters only, no ambiguous I/O
const ROOM_CODE_LENGTH = 6;

// How long a room with players but no live connections lingers before it's
// reaped. Gives disconnected players a window to reconnect mid-game.
const ABANDON_GRACE_MS = envInt("ABANDON_MS", 60_000);

export class GameHub {
  private readonly rooms = new Map<string, Room>();
  private readonly byConn = new Map<WebSocket, Membership>();
  /** Verified Supabase user id per socket, set at connect time. */
  private readonly authByConn = new Map<WebSocket, string>();
  /** Pending cleanup timers for rooms whose players are all disconnected. */
  private readonly abandonTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  /** Record a socket's verified identity. Called once the JWT is verified. */
  attach(conn: WebSocket, userId: string): void {
    this.authByConn.set(conn, userId);
  }

  /** Whether a joinable room exists for a code. Backs the HTTP existence check
   *  the client makes before letting a user into a `/<CODE>` URL. */
  hasRoom(code: string): boolean {
    return this.rooms.has(code.trim().toUpperCase());
  }

  /** Config applied to new rooms; env overrides make tests fast. */
  private readonly config: RoomConfig = {
    totalRounds: envInt("TOTAL_ROUNDS", GAME_DEFAULTS.totalRounds),
    roundDurationMs: envInt("ROUND_MS", GAME_DEFAULTS.roundDurationMs),
    countdownMs: envInt("COUNTDOWN_MS", GAME_DEFAULTS.countdownMs),
    includeNonPrimaryArtist: GAME_DEFAULTS.includeNonPrimaryArtist,
  };

  onMessage(conn: WebSocket, raw: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return send(conn, { type: "error", message: "Malformed message." });
    }
    if (!msg || typeof msg.type !== "string") {
      return send(conn, { type: "error", message: "Missing message type." });
    }

    switch (msg.type) {
      case "create":
        return this.handleCreate(conn, msg.playerName);
      case "join":
        return this.handleJoin(conn, msg.roomCode, msg.playerName);
      case "timeSync":
        return send(conn, {
          type: "timeSyncReply",
          clientSentAt: msg.clientSentAt,
          serverTime: Date.now(),
        });
      case "leave":
        return this.detach(conn);
      case "selectArtist":
        return this.withRoom(conn, (room, pid) => {
          void room.selectArtist(pid, msg.artistId, msg.artistName);
        });
      case "updateConfig":
        return this.withRoom(conn, (room, pid) =>
          room.updateConfig(pid, msg.config)
        );
      case "startGame":
        return this.withRoom(conn, (room, pid) => room.startGame(pid));
      case "nextRound":
        return this.withRoom(conn, (room, pid) => room.nextRound(pid));
      case "resetGame":
        return this.withRoom(conn, (room, pid) => room.resetGame(pid));
      case "guess":
        return this.withRoom(conn, (room, pid) =>
          room.guess(pid, msg.roundIndex, msg.text)
        );
      case "giveUp":
        return this.withRoom(conn, (room, pid) =>
          room.giveUp(pid, msg.roundIndex)
        );
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        return send(conn, { type: "error", message: "Unknown message type." });
      }
    }
  }

  onClose(conn: WebSocket): void {
    this.detach(conn);
    this.authByConn.delete(conn);
  }

  // --- handlers -----------------------------------------------------------

  private handleCreate(conn: WebSocket, playerName: string): void {
    if (this.byConn.has(conn)) {
      return send(conn, { type: "error", message: "Already in a room." });
    }
    const userId = this.authByConn.get(conn);
    if (!userId) {
      return send(conn, { type: "error", message: "Not authenticated." });
    }
    const code = this.freshCode();
    const room = new Room(code, { ...this.config });
    this.rooms.set(code, room);

    const playerId = room.addPlayer(conn, sanitizeName(playerName), userId);
    this.byConn.set(conn, { code, playerId });

    send(conn, { type: "joined", playerId, roomCode: code });
    room.broadcast();
  }

  private handleJoin(
    conn: WebSocket,
    roomCode: string,
    playerName: string
  ): void {
    if (this.byConn.has(conn)) {
      return send(conn, { type: "error", message: "Already in a room." });
    }
    const userId = this.authByConn.get(conn);
    if (!userId) {
      return send(conn, { type: "error", message: "Not authenticated." });
    }
    const code = roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return send(conn, { type: "error", message: "Room not found." });
    }
    // Anyone can join mid-game: returning players resume their score, and new
    // players are added (sitting out any in-progress round, then participating
    // from the next one — see Room.addPlayer). A finished game has nothing to
    // join, so it's the only closed phase.
    if (!room.hasPlayer(userId) && room.isFinished()) {
      return send(conn, { type: "error", message: "Game is already over." });
    }

    const playerId = room.addPlayer(conn, sanitizeName(playerName), userId);
    this.byConn.set(conn, { code, playerId });
    this.cancelAbandon(code); // someone's connected again — don't reap the room

    send(conn, { type: "joined", playerId, roomCode: code });
    room.broadcast();
  }

  /** Remove a connection from its room and clean up an emptied room. */
  private detach(conn: WebSocket): void {
    const info = this.byConn.get(conn);
    if (!info) return;
    this.byConn.delete(conn);

    const room = this.rooms.get(info.code);
    if (!room) return;

    room.removePlayer(info.playerId);
    if (room.isEmpty()) {
      this.destroyRoom(info.code);
    } else if (!room.hasConnectedPlayers()) {
      // Players remain (mid-game, disconnected) but nobody's online — reap the
      // room after a grace period unless someone reconnects first.
      this.scheduleAbandon(info.code);
      room.broadcast();
    } else {
      room.broadcast();
    }
  }

  private destroyRoom(code: string): void {
    this.cancelAbandon(code);
    const room = this.rooms.get(code);
    if (room) room.destroy();
    this.rooms.delete(code);
  }

  private scheduleAbandon(code: string): void {
    if (this.abandonTimers.has(code)) return;
    const timer = setTimeout(() => {
      this.abandonTimers.delete(code);
      const room = this.rooms.get(code);
      if (room && !room.hasConnectedPlayers()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }, ABANDON_GRACE_MS);
    this.abandonTimers.set(code, timer);
  }

  private cancelAbandon(code: string): void {
    const timer = this.abandonTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this.abandonTimers.delete(code);
    }
  }

  private withRoom(
    conn: WebSocket,
    fn: (room: Room, playerId: string) => void
  ): void {
    const info = this.byConn.get(conn);
    if (!info) {
      return send(conn, { type: "error", message: "Not in a room." });
    }
    const room = this.rooms.get(info.code);
    if (!room) {
      this.byConn.delete(conn);
      return send(conn, { type: "error", message: "Room no longer exists." });
    }
    fn(room, info.playerId);
  }

  private freshCode(): string {
    let code = "";
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () =>
          ROOM_CODE_ALPHABET[
            Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
          ]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }
}

function sanitizeName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Player";
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
