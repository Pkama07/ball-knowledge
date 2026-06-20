"use client";

import type { RoomState } from "@ball-knowledge/shared";
import { Scoreboard } from "./Scoreboard";

export function Lobby({
  state,
  meId,
  isHost,
  onStart,
  onChangeArtist,
}: {
  state: RoomState;
  meId: string | null;
  isHost: boolean;
  onStart: () => void;
  onChangeArtist: () => void;
}) {
  const hasArtist = Boolean(state.artistName);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-neutral-400">
            Room code
          </div>
          <div className="font-mono text-3xl font-bold tracking-[0.3em]">
            {state.code}
          </div>
        </div>
        <div className="text-right text-sm text-neutral-400">
          Share this code
          <br />
          so friends can join
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-edge bg-panel px-4 py-3">
        <div className="text-sm text-neutral-400">Artist</div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">
            {hasArtist ? (
              <>
                {state.artistName}{" "}
                <span className="text-neutral-400">
                  · {state.totalRounds} rounds
                </span>
              </>
            ) : (
              <span className="text-neutral-500">Not chosen yet</span>
            )}
          </span>
          {isHost && hasArtist && (
            <button
              onClick={onChangeArtist}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              Change
            </button>
          )}
        </div>
      </div>

      <div className="mb-2 text-sm uppercase tracking-wide text-neutral-400">
        Players ({state.players.length})
      </div>
      <Scoreboard players={state.players} meId={meId} />

      <div className="mt-7">
        {isHost ? (
          <button
            onClick={onStart}
            disabled={!hasArtist}
            className="w-full rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white disabled:opacity-40"
          >
            {hasArtist ? "Start game" : "Choose an artist first"}
          </button>
        ) : (
          <div className="rounded-xl border border-edge bg-panel px-5 py-4 text-center text-neutral-400">
            Waiting for the host to start…
          </div>
        )}
      </div>
    </div>
  );
}
