// A single game room and its state machine.
//
// Phase flow:
//   lobby ──selectArtist──> loading ──(fetch ok)──> lobby (artist set)
//   lobby ──startGame────> countdown ──(countdownMs)──> playing
//   playing ──first correct guess OR roundDurationMs──> reveal
//   reveal ──nextRound───> countdown (next)  |  reveal ──nextRound──> finished
//
// The server owns the playlist (the answers). Clients only ever receive a
// sanitized RoomState; the title leaves the server only inside a reveal.

import { WebSocket } from "ws";
import {
  GAME_DEFAULTS,
  MAX_ROUND_DURATION_MS,
  MAX_TOTAL_ROUNDS,
  MIN_ROUND_DURATION_MS,
  MIN_TOTAL_ROUNDS,
  type GamePhase,
  type Player,
  type RoomConfig,
  type RoomState,
  type RoundPublic,
  type RoundResult,
  type Song,
} from "@ball-knowledge/shared";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
import { fetchArtistSongs } from "./itunes.js";
import { isCorrectGuess } from "./matching.js";
import { send } from "./net.js";

interface PlayerEntry {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  conn: WebSocket;
  /**
   * Round index this player joined during, if they joined mid-round. Such a
   * player sits out that round (can't score it, doesn't block its end) and
   * starts participating from the next one. -1 once they're a full participant.
   */
  joinRound: number;
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Room {
  readonly code: string;
  readonly config: RoomConfig;

  private phase: GamePhase = "lobby";
  private artistName: string | null = null;
  private readonly players = new Map<string, PlayerEntry>();

  // Server-only answer data — never serialized into RoomState during play.
  private selectedArtistId: number | null = null;
  /** Every playable song fetched for the artist, before primary-artist filtering
   *  and slicing. Kept so config changes can re-derive the playlist in the lobby. */
  private allSongs: Song[] = [];
  private playlist: Song[] = [];
  private totalRounds = 0;
  private currentRoundIndex = -1;
  private roundStartsAt = 0;
  private firstWinnerId: string | null = null;
  /** Players who hit "I don't know" this round; reset each round. */
  private gaveUp = new Set<string>();
  private lastResult: RoundResult | null = null;

  private countdownTimer?: ReturnType<typeof setTimeout>;
  private roundTimer?: ReturnType<typeof setTimeout>;

  constructor(code: string, config: RoomConfig = { ...GAME_DEFAULTS }) {
    this.code = code;
    this.config = config;
  }

  // --- membership ---------------------------------------------------------

  /**
   * Add a player, or reconnect an existing one. Identity (`id`) is the verified
   * Supabase user id, so a returning user rebinds to their existing entry —
   * keeping their score and host status — instead of duplicating.
   */
  addPlayer(conn: WebSocket, name: string, id: string): string {
    const existing = this.players.get(id);
    if (existing) {
      existing.conn = conn;
      existing.connected = true;
      existing.name = name;
      return id;
    }
    const isHost = this.players.size === 0;
    // A player joining while a round is live must wait for the next round.
    const joinRound = this.isActiveRound() ? this.currentRoundIndex : -1;
    this.players.set(id, {
      id,
      name,
      score: 0,
      isHost,
      connected: true,
      conn,
      joinRound,
    });
    return id;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  removePlayer(playerId: string): void {
    const leaving = this.players.get(playerId);
    if (!leaving) return;

    // During an active round, keep the entry but mark it disconnected so the
    // same user can rejoin and resume their score. Otherwise (lobby, loading,
    // finished) just drop them.
    if (this.isActiveRound()) {
      leaving.connected = false;
    } else {
      this.players.delete(playerId);
    }

    // If the host is gone, hand off to a connected player so play can continue.
    if (leaving.isHost) {
      for (const p of this.players.values()) {
        if (p.id !== playerId && p.connected) {
          p.isHost = true;
          leaving.isHost = false;
          break;
        }
      }
    }
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** True if at least one player still has a live connection. */
  hasConnectedPlayers(): boolean {
    for (const p of this.players.values()) {
      if (p.connected) return true;
    }
    return false;
  }

  isFinished(): boolean {
    return this.phase === "finished";
  }

  /** A round is live (so a dropped player should be kept for reconnect). */
  private isActiveRound(): boolean {
    return (
      this.phase === "countdown" ||
      this.phase === "playing" ||
      this.phase === "reveal"
    );
  }

  // --- host controls ------------------------------------------------------

  async selectArtist(
    playerId: string,
    artistId: number,
    artistName: string
  ): Promise<void> {
    if (!this.requireHost(playerId)) return;
    if (this.phase !== "lobby") {
      return this.error(playerId, "You can only pick an artist in the lobby.");
    }

    this.artistName = artistName;
    this.phase = "loading";
    this.broadcast();

    try {
      const songs = await fetchArtistSongs(artistId);
      if (songs.length === 0) {
        this.artistName = null;
        this.phase = "lobby";
        this.broadcast();
        return this.error(playerId, "No playable songs found for that artist.");
      }
      this.selectedArtistId = artistId;
      this.allSongs = songs;
      this.derivePlaylist();
      this.phase = "lobby";
      this.broadcast();
    } catch {
      this.artistName = null;
      this.phase = "lobby";
      this.broadcast();
      this.error(playerId, "Failed to load songs from iTunes.");
    }
  }

  /** (Re)build the playlist from `allSongs` for the current config. Applies the
   *  primary-artist filter and slices to the requested round count, then shuffles.
   *  Safe to call repeatedly in the lobby as the host tweaks settings. */
  private derivePlaylist(): void {
    let pool = this.allSongs;
    if (!this.config.includeNonPrimaryArtist && this.selectedArtistId != null) {
      const primaryOnly = pool.filter(
        (s) => s.artistId === this.selectedArtistId
      );
      // Fall back to the full pool if filtering would leave nothing to play.
      if (primaryOnly.length > 0) pool = primaryOnly;
    }
    this.playlist = shuffle(pool).slice(0, this.config.totalRounds);
    this.totalRounds = this.playlist.length;
  }

  /** Host-only, lobby-only: update settings, then re-derive the playlist. */
  updateConfig(playerId: string, partial: Partial<RoomConfig>): void {
    if (!this.requireHost(playerId)) return;
    if (this.phase !== "lobby") {
      return this.error(playerId, "Settings can only change in the lobby.");
    }

    if (typeof partial.totalRounds === "number") {
      this.config.totalRounds = clamp(
        Math.round(partial.totalRounds),
        MIN_TOTAL_ROUNDS,
        MAX_TOTAL_ROUNDS
      );
    }
    if (typeof partial.roundDurationMs === "number") {
      this.config.roundDurationMs = clamp(
        Math.round(partial.roundDurationMs),
        MIN_ROUND_DURATION_MS,
        MAX_ROUND_DURATION_MS
      );
    }
    if (typeof partial.includeNonPrimaryArtist === "boolean") {
      this.config.includeNonPrimaryArtist = partial.includeNonPrimaryArtist;
    }

    // Re-derive only once an artist is loaded; otherwise just store the prefs.
    if (this.allSongs.length > 0) this.derivePlaylist();
    this.broadcast();
  }

  startGame(playerId: string): void {
    if (!this.requireHost(playerId)) return;
    if (this.phase !== "lobby") {
      return this.error(playerId, "The game has already started.");
    }
    if (this.playlist.length === 0) {
      return this.error(playerId, "Pick an artist before starting.");
    }
    this.beginRound(0);
  }

  nextRound(playerId: string): void {
    if (!this.requireHost(playerId)) return;
    if (this.phase !== "reveal") {
      return this.error(playerId, "Can only advance after a round's reveal.");
    }
    const next = this.currentRoundIndex + 1;
    if (next >= this.totalRounds) {
      this.finish();
    } else {
      this.beginRound(next);
    }
  }

  /** Host-only, finished-only: send everyone back to the lobby for a rematch.
   *  Scores reset to 0 and the playlist is reshuffled; the selected artist and
   *  config are kept so the host can tweak settings and start again. */
  resetGame(playerId: string): void {
    if (!this.requireHost(playerId)) return;
    if (this.phase !== "finished") {
      return this.error(playerId, "Can only reset the game once it's over.");
    }
    this.clearTimers();
    this.currentRoundIndex = -1;
    this.firstWinnerId = null;
    this.gaveUp.clear();
    this.lastResult = null;
    for (const p of this.players.values()) {
      p.score = 0;
      p.joinRound = -1;
    }
    // Reshuffle so a rematch isn't the same song order.
    if (this.allSongs.length > 0) this.derivePlaylist();
    this.phase = "lobby";
    this.broadcast();
  }

  // --- gameplay -----------------------------------------------------------

  guess(playerId: string, roundIndex: number, text: string): void {
    if (this.phase !== "playing") return; // guesses only count while playing
    if (roundIndex !== this.currentRoundIndex) return; // stale round
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.joinRound === this.currentRoundIndex) return; // joined mid-round

    const song = this.playlist[this.currentRoundIndex];
    const correct = isCorrectGuess(text, song.title);

    if (!correct) {
      send(player.conn, { type: "guessResult", correct: false, awarded: false });
      return;
    }
    if (this.firstWinnerId) {
      // Correct, but someone already claimed the point this round.
      send(player.conn, { type: "guessResult", correct: true, awarded: false });
      return;
    }

    // First correct guess wins the round's single point.
    this.firstWinnerId = playerId;
    player.score += 1;
    send(player.conn, { type: "guessResult", correct: true, awarded: true });
    this.endRound();
  }

  /** A player concedes the round. Once every connected player has conceded, the
   *  round ends early with no winner. */
  giveUp(playerId: string, roundIndex: number): void {
    if (this.phase !== "playing") return;
    if (roundIndex !== this.currentRoundIndex) return;
    if (!this.players.has(playerId)) return;
    if (this.gaveUp.has(playerId)) return;

    this.gaveUp.add(playerId);
    if (this.everyoneGaveUp()) {
      this.endRound();
    } else {
      // Surface the updated tally so clients can show "2/4 gave up".
      this.broadcast();
    }
  }

  /** True if at least one player is connected and all connected players have
   *  conceded the current round. */
  private everyoneGaveUp(): boolean {
    let connected = 0;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      if (p.joinRound === this.currentRoundIndex) continue; // sitting out
      connected++;
      if (!this.gaveUp.has(p.id)) return false;
    }
    return connected > 0;
  }

  // --- round lifecycle ----------------------------------------------------

  private beginRound(index: number): void {
    this.clearTimers();
    this.currentRoundIndex = index;
    this.firstWinnerId = null;
    this.gaveUp.clear();
    // Anyone who was sitting out a prior round is now a full participant.
    for (const p of this.players.values()) p.joinRound = -1;
    this.lastResult = null;
    this.phase = "countdown";
    this.roundStartsAt = Date.now() + this.config.countdownMs;
    this.broadcast();

    // After the countdown, flip to playing and arm the round timeout.
    this.countdownTimer = setTimeout(() => {
      this.phase = "playing";
      this.broadcast();
      this.roundTimer = setTimeout(
        () => this.endRound(),
        this.config.roundDurationMs
      );
    }, this.config.countdownMs);
  }

  private endRound(): void {
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    this.clearTimers();
    this.phase = "reveal";

    const song = this.playlist[this.currentRoundIndex];
    this.lastResult = {
      index: this.currentRoundIndex,
      song,
      winnerId: this.firstWinnerId,
      elapsedMs: this.firstWinnerId ? Date.now() - this.roundStartsAt : null,
    };
    this.broadcast();
  }

  private finish(): void {
    this.clearTimers();
    this.phase = "finished";
    this.broadcast();
  }

  destroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.countdownTimer = undefined;
    this.roundTimer = undefined;
  }

  // --- serialization / broadcast -----------------------------------------

  broadcast(): void {
    const state = this.toRoomState();
    for (const p of this.players.values()) {
      send(p.conn, { type: "roomState", state });
    }
  }

  private toRoomState(): RoomState {
    const live = this.phase === "countdown" || this.phase === "playing";
    const currentRound: RoundPublic | null = live
      ? {
          index: this.currentRoundIndex,
          previewUrl: this.playlist[this.currentRoundIndex].previewUrl,
          durationMs: this.config.roundDurationMs,
          startsAt: this.roundStartsAt,
        }
      : null;

    return {
      code: this.code,
      phase: this.phase,
      artistName: this.artistName,
      players: [...this.players.values()].map(toPublicPlayer),
      roundNumber: this.currentRoundIndex >= 0 ? this.currentRoundIndex + 1 : 0,
      totalRounds: this.totalRounds,
      config: { ...this.config },
      currentRound,
      gaveUpCount: this.phase === "playing" ? this.gaveUp.size : 0,
      lastResult:
        this.phase === "reveal" || this.phase === "finished"
          ? this.lastResult
          : null,
    };
  }

  // --- helpers ------------------------------------------------------------

  private requireHost(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p?.isHost) {
      this.error(playerId, "Only the host can do that.");
      return false;
    }
    return true;
  }

  private error(playerId: string, message: string): void {
    const p = this.players.get(playerId);
    if (p) send(p.conn, { type: "error", message });
  }
}

function toPublicPlayer(p: PlayerEntry): Player {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    isHost: p.isHost,
    connected: p.connected,
  };
}
