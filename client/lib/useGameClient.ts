"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ClientMessage,
  RoomConfig,
  RoomState,
  ServerMessage,
} from "@ball-knowledge/shared";
import { useAuth } from "@/components/AuthProvider";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

export interface GuessFeedback {
  correct: boolean;
  awarded: boolean;
  /** local ms timestamp, so the UI can ignore stale feedback */
  at: number;
}

export interface GameClient {
  status: ConnStatus;
  playerId: string | null;
  roomState: RoomState | null;
  error: string | null;
  guessFeedback: GuessFeedback | null;
  /** server clock minus local clock, in ms; add to local time to get server time */
  clockOffset: number;
  create: (playerName: string) => void;
  join: (roomCode: string, playerName: string) => void;
  selectArtist: (artistId: number, artistName: string) => void;
  updateConfig: (config: Partial<RoomConfig>) => void;
  startGame: () => void;
  nextRound: () => void;
  resetGame: () => void;
  guess: (roundIndex: number, text: string) => void;
  giveUp: (roundIndex: number) => void;
  dismissError: () => void;
}

export function useGameClient(): GameClient {
  const { getAccessToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<ClientMessage | null>(null);
  const bestRttRef = useRef<number>(Number.POSITIVE_INFINITY);

  const [status, setStatus] = useState<ConnStatus>("idle");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guessFeedback, setGuessFeedback] = useState<GuessFeedback | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handle = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "joined":
        setPlayerId(msg.playerId);
        break;
      case "roomState":
        // A fresh round clears any stale guess feedback.
        if (msg.state.phase === "countdown") setGuessFeedback(null);
        setRoomState(msg.state);
        break;
      case "guessResult":
        setGuessFeedback({
          correct: msg.correct,
          awarded: msg.awarded,
          at: Date.now(),
        });
        break;
      case "timeSyncReply": {
        const now = Date.now();
        const rtt = now - msg.clientSentAt;
        // Keep the estimate from the lowest-latency sample.
        if (rtt < bestRttRef.current) {
          bestRttRef.current = rtt;
          setClockOffset(msg.serverTime - (msg.clientSentAt + rtt / 2));
        }
        break;
      }
      case "error":
        setError(msg.message);
        break;
    }
  }, []);

  const ensureSocket = useCallback(
    async (initial: ClientMessage) => {
      setError(null);
      const existing = wsRef.current;
      if (existing && existing.readyState <= WebSocket.OPEN) {
        send(initial);
        return;
      }

      // The Supabase access token authorizes the socket. It rides the
      // handshake as the second WebSocket subprotocol ("bearer", <jwt>),
      // which the server verifies before any game logic runs.
      const token = await getAccessToken();
      if (!token) {
        setError("Not signed in yet — please try again in a moment.");
        return;
      }

      setStatus("connecting");
      const ws = new WebSocket(WS_URL, ["bearer", token]);
      wsRef.current = ws;
      pendingRef.current = initial;

      ws.onopen = () => {
        setStatus("connected");
        // Fire a few clock-sync pings; the lowest-RTT one wins.
        for (let i = 0; i < 4; i++) {
          setTimeout(
            () => send({ type: "timeSync", clientSentAt: Date.now() }),
            i * 120
          );
        }
        if (pendingRef.current) {
          send(pendingRef.current);
          pendingRef.current = null;
        }
      };
      ws.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerMessage);
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        wsRef.current = null;
      };
    },
    [send, handle, getAccessToken]
  );

  return {
    status,
    playerId,
    roomState,
    error,
    guessFeedback,
    clockOffset,
    create: useCallback(
      (playerName) => ensureSocket({ type: "create", playerName }),
      [ensureSocket]
    ),
    join: useCallback(
      (roomCode, playerName) =>
        ensureSocket({ type: "join", roomCode, playerName }),
      [ensureSocket]
    ),
    selectArtist: useCallback(
      (artistId, artistName) => {
        setError(null);
        send({ type: "selectArtist", artistId, artistName });
      },
      [send]
    ),
    updateConfig: useCallback(
      (config) => {
        setError(null);
        send({ type: "updateConfig", config });
      },
      [send]
    ),
    startGame: useCallback(() => {
      setError(null);
      send({ type: "startGame" });
    }, [send]),
    nextRound: useCallback(() => {
      setError(null);
      send({ type: "nextRound" });
    }, [send]),
    resetGame: useCallback(() => {
      setError(null);
      send({ type: "resetGame" });
    }, [send]),
    guess: useCallback(
      (roundIndex, text) => send({ type: "guess", roundIndex, text }),
      [send]
    ),
    giveUp: useCallback(
      (roundIndex) => send({ type: "giveUp", roundIndex }),
      [send]
    ),
    dismissError: useCallback(() => setError(null), []),
  };
}
