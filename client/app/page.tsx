"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useGameClient } from "@/lib/useGameClient";
import { ChooseArtist } from "@/components/ChooseArtist";
import { Lobby } from "@/components/Lobby";
import { GameRound } from "@/components/GameRound";

export default function Home() {
  const game = useGameClient();
  const { roomState, playerId } = game;
  const [pickingArtist, setPickingArtist] = useState(false);

  const me = roomState?.players.find((p) => p.id === playerId) ?? null;
  const isHost = me?.isHost ?? false;

  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-10">
      <h1 className="mb-8 text-center text-2xl font-black">
        🎵 Ball Knowledge
      </h1>

      {game.error && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
          <span>{game.error}</span>
          <button
            onClick={game.dismissError}
            className="text-red-300/70 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <Screen
        game={game}
        isHost={isHost}
        pickingArtist={pickingArtist}
        setPickingArtist={setPickingArtist}
      />
    </div>
  );
}

type GameClient = ReturnType<typeof useGameClient>;

function Screen({
  game,
  isHost,
  pickingArtist,
  setPickingArtist,
}: {
  game: GameClient;
  isHost: boolean;
  pickingArtist: boolean;
  setPickingArtist: (v: boolean) => void;
}) {
  const { roomState, playerId } = game;

  // Not in a room yet → home screen.
  if (!roomState) {
    return <HomeScreen game={game} />;
  }

  switch (roomState.phase) {
    case "loading":
      return (
        <Centered>
          <Spinner />
          <p className="mt-4 text-neutral-400">
            Loading {roomState.artistName}&apos;s songs…
          </p>
        </Centered>
      );

    case "lobby": {
      // Host with no artist (or actively re-picking) → artist chooser.
      const needsArtist = isHost && (!roomState.artistName || pickingArtist);
      if (needsArtist) {
        return (
          <ChooseArtist
            onSelect={(id, name) => {
              setPickingArtist(false);
              game.selectArtist(id, name);
            }}
            onCancel={
              roomState.artistName ? () => setPickingArtist(false) : undefined
            }
          />
        );
      }
      return (
        <Lobby
          state={roomState}
          meId={playerId}
          isHost={isHost}
          onStart={game.startGame}
          onChangeArtist={() => setPickingArtist(true)}
        />
      );
    }

    case "countdown":
    case "playing":
    case "reveal":
    case "finished":
      return (
        <GameRound
          state={roomState}
          meId={playerId}
          isHost={isHost}
          clockOffset={game.clockOffset}
          guessFeedback={game.guessFeedback}
          onGuess={game.guess}
          onNext={game.nextRound}
        />
      );

    default:
      return null;
  }
}

function HomeScreen({ game }: { game: GameClient }) {
  const { isReady, error: authError } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  // Block connecting until we have an anonymous session (and thus a token).
  const busy = game.status === "connecting" || !isReady;

  return (
    <div>
      <p className="mb-6 text-center text-neutral-400">
        Create a room, pick an artist, and race your friends to name the songs.
      </p>

      {authError && (
        <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Couldn&apos;t sign in: {authError}
        </div>
      )}

      <label className="mb-1 block text-sm text-neutral-400">Your name</label>
      <input
        type="text"
        autoFocus
        placeholder="e.g. Alex"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-5 w-full rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent"
      />

      <button
        onClick={() => game.create(name.trim() || "Player")}
        disabled={busy}
        className="mb-6 w-full rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {isReady ? "Create a room" : authError ? "Sign-in failed" : "Signing in…"}
      </button>

      <div className="mb-4 flex items-center gap-3 text-sm text-neutral-500">
        <div className="h-px flex-1 bg-edge" />
        or join one
        <div className="h-px flex-1 bg-edge" />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="w-36 rounded-xl border border-edge bg-panel px-4 py-3 text-center font-mono text-base uppercase tracking-[0.2em] text-neutral-100 outline-none focus:border-accent"
        />
        <button
          onClick={() => game.join(code.trim(), name.trim() || "Player")}
          disabled={busy || code.trim().length < 4}
          className="flex-1 rounded-xl bg-neutral-800 px-5 py-3 font-semibold text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
        >
          Join room
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-edge border-t-accent" />
  );
}
