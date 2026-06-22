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
  /** iTunes artistId of the track's PRIMARY artist. Used to tell whether the
   *  selected artist actually headlines the song (vs. being a featured guest). */
  artistId?: number;
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
  /** Actual number of rounds the game will run — i.e. the playlist length once
   *  an artist is loaded (`min(config.totalRounds, songs available)`); 0 before. */
  totalRounds: number;
  /** The host-tunable settings, surfaced so everyone (and the settings UI) can
   *  see them. `config.totalRounds` is the *requested* max, which may exceed the
   *  derived `totalRounds` above when the artist has fewer playable songs. */
  config: RoomConfig;
  /** Present during countdown/playing; null otherwise. */
  currentRound: RoundPublic | null;
  /** During `playing`, how many connected players have hit "I don't know". When
   *  every connected player has, the round ends early. 0 outside a live round. */
  gaveUpCount: number;
  /** Populated during the `reveal` phase; the most recent round's outcome. */
  lastResult: RoundResult | null;
}

/** Per-room tuning knobs. */
export interface RoomConfig {
  totalRounds: number;
  /** Guessing window per round, in ms. Clamped to [MIN, MAX]_ROUND_DURATION_MS. */
  roundDurationMs: number;
  /** Countdown shown before each clip starts, in ms. */
  countdownMs: number;
  /** When false, only songs the selected artist HEADLINES are used. When true,
   *  songs where they're merely a featured/secondary artist are included too. */
  includeNonPrimaryArtist: boolean;
}

export const GAME_DEFAULTS: RoomConfig = {
  totalRounds: 10,
  roundDurationMs: 30_000,
  countdownMs: 3_000,
  includeNonPrimaryArtist: false,
};

// Bounds the host may set the per-round guessing window to, in ms.
export const MIN_ROUND_DURATION_MS = 5_000;
export const MAX_ROUND_DURATION_MS = 30_000;
// Bounds for the number of rounds.
export const MIN_TOTAL_ROUNDS = 1;
export const MAX_TOTAL_ROUNDS = 20;
