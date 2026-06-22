// WebSocket message protocol shared between client and server.
//
// Both directions are discriminated unions keyed on `type`, so a single
// switch statement on each side can exhaustively handle every message.
//
// Channel design: `roomState` is the authoritative snapshot and does most of
// the work — clients re-render from it on every change (lobby updates, phase
// transitions, score changes, the live round, and the reveal). Only things
// that are PRIVATE to one client (their own guess outcome, their identity) or
// that don't belong in shared state (clock sync, errors) get their own message.

import type { RoomConfig, RoomState } from "./domain.js";

/** Messages the client sends to the server. */
export type ClientMessage =
  // --- room membership ---
  | { type: "create"; playerName: string }
  | { type: "join"; roomCode: string; playerName: string }
  | { type: "leave" }
  // --- host-only controls ---
  | { type: "selectArtist"; artistId: number; artistName: string }
  // Update one or more room settings (lobby only). Server validates/clamps.
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "startGame" } // lobby -> first round's countdown
  | { type: "nextRound" } // reveal -> next round's countdown (or -> finished)
  | { type: "resetGame" } // finished -> lobby (rematch; scores cleared)
  // --- gameplay ---
  | { type: "guess"; roundIndex: number; text: string }
  // Player concedes the current round. When ALL connected players have, the
  // round ends early (no winner).
  | { type: "giveUp"; roundIndex: number }
  // --- clock sync (for synced playback) ---
  | { type: "timeSync"; clientSentAt: number };

/** Messages the server sends to the client. */
export type ServerMessage =
  // Identity confirmed on create/join. `playerId` is the authenticated Supabase
  // user id (durable across connections), so rejoining the same room resumes the
  // same player.
  | { type: "joined"; playerId: string; roomCode: string }
  // The authoritative snapshot; sent on every meaningful change.
  | { type: "roomState"; state: RoomState }
  // Private reply to this client's own guess. `awarded` is true only for the
  // first correct guesser (the round's sole scorer).
  | { type: "guessResult"; correct: boolean; awarded: boolean }
  // Reply to `timeSync`; lets the client estimate its offset from server time.
  | { type: "timeSyncReply"; clientSentAt: number; serverTime: number }
  | { type: "error"; message: string };

/** Narrowing helper: extract a specific client message by its `type`. */
export type ClientMessageOf<T extends ClientMessage["type"]> = Extract<
  ClientMessage,
  { type: T }
>;

/** Narrowing helper: extract a specific server message by its `type`. */
export type ServerMessageOf<T extends ServerMessage["type"]> = Extract<
  ServerMessage,
  { type: T }
>;
