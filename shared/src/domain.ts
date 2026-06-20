// Core domain types shared between the client and server.
//
// Design decisions baked in (MVP):
//   - Scoring: only the FIRST correct guesser scores, +1 point. Nothing else.
//   - No anti-cheat proxying: previewUrl is the raw iTunes URL. We still keep
//     the title out of in-flight round data so the honest client UI can hide it.
//   - No reconnection: a player's identity lives for one socket connection.
//   - Host advances rounds manually; each round opens with a countdown.

/** A playable preview clip. The full record — the ANSWER — only ever leaves
 *  the server at reveal time, never during a live round. */
export interface Song {
  /** iTunes trackId, used as a stable identifier. */
  trackId: number;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  /** ~30s preview clip URL played in the browser. */
  previewUrl: string;
}

/** A connected participant in a room. */
export interface Player {
  id: string;
  name: string;
  /** Number of rounds this player has won (each win = 1 point). */
  score: number;
  isHost: boolean;
  connected: boolean;
}

/** Where a room is in the game lifecycle. */
export type GamePhase =
  | "lobby" // waiting for players; host picks an artist
  | "loading" // fetching the artist's tracks
  | "countdown" // round locked in; 3..2..1 before the clip plays
  | "playing" // clip is playing, players are guessing
  | "reveal" // round answer + winner shown; waiting for host to advance
  | "finished"; // all rounds done

/** What clients learn about the CURRENT round while it's live.
 *  Deliberately omits the title/answer. `startsAt` is a server-clock instant a
 *  few seconds in the future so every client can begin audio in sync. */
export interface RoundPublic {
  index: number; // 0-based round index
  previewUrl: string;
  /** Max guessing window length, in ms (the clip is ~30s). */
  durationMs: number;
  /** Server epoch ms when audio should begin (i.e. when the countdown ends). */
  startsAt: number;
}

/** The outcome of a finished round, revealed to everyone. */
export interface RoundResult {
  index: number;
  song: Song; // the answer
  /** First correct guesser, or null if nobody got it. */
  winnerId: string | null;
  /** How long the winner took from `startsAt`, in ms (null if no winner). */
  elapsedMs: number | null;
}

/** Authoritative room snapshot the server broadcasts after any change.
 *  This is the single source of truth the client renders from. */
export interface RoomState {
  code: string;
  phase: GamePhase;
  artistName: string | null;
  players: Player[];
  /** 1-based number of the round in progress; 0 while in the lobby. */
  roundNumber: number;
  totalRounds: number;
  /** Present during countdown/playing; null otherwise. */
  currentRound: RoundPublic | null;
  /** Populated during the `reveal` phase; the most recent round's outcome. */
  lastResult: RoundResult | null;
}

/** Per-room tuning knobs. */
export interface RoomConfig {
  totalRounds: number;
  /** Guessing window per round, in ms. */
  roundDurationMs: number;
  /** Countdown shown before each clip starts, in ms. */
  countdownMs: number;
}

export const GAME_DEFAULTS: RoomConfig = {
  totalRounds: 10,
  roundDurationMs: 30_000,
  countdownMs: 3_000,
};
