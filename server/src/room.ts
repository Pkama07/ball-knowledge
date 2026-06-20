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
  type GamePhase,
  type Player,
  type RoomConfig,
  type RoomState,
  type RoundPublic,
  type RoundResult,
  type Song,
} from "@ball-knowledge/shared";
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
  private playlist: Song[] = [];
  private totalRounds = 0;
  private currentRoundIndex = -1;
  private roundStartsAt = 0;
  private firstWinnerId: string | null = null;
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
    this.players.set(id, {
      id,
      name,
      score: 0,
      isHost,
      connected: true,
      conn,
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

  canJoin(): boolean {
    return this.phase === "lobby";
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
      this.playlist = shuffle(songs).slice(0, this.config.totalRounds);
      this.totalRounds = this.playlist.length;
      this.phase = "lobby";
      this.broadcast();
    } catch {
      this.artistName = null;
      this.phase = "lobby";
      this.broadcast();
      this.error(playerId, "Failed to load songs from iTunes.");
    }
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

  // --- gameplay -----------------------------------------------------------

  guess(playerId: string, roundIndex: number, text: string): void {
    if (this.phase !== "playing") return; // guesses only count while playing
    if (roundIndex !== this.currentRoundIndex) return; // stale round
    const player = this.players.get(playerId);
    if (!player) return;

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

  // --- round lifecycle ----------------------------------------------------

  private beginRound(index: number): void {
    this.clearTimers();
    this.currentRoundIndex = index;
    this.firstWinnerId = null;
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
      currentRound,
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
