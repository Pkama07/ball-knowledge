"use client";

// `/<CODE>` — a shareable join link. On visit we ask the server whether the room
// exists: if not, bounce home with a red "couldn't find that game" banner. If it
// does, prompt for a name (prefilled from the cookie) and join — landing the
// player straight into the lobby/round. New players sit out any in-progress round
// and start participating from the next one (enforced server-side).

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useGameClient } from "@/lib/useGameClient";
import { AppFrame } from "@/components/AppFrame";
import { GameScreens } from "@/components/GameScreens";
import { MiniSpinner } from "@/components/ui";
import { roomExists } from "@/lib/api";
import { getStoredName, storeName } from "@/lib/playerName";

type Check = "checking" | "found" | "missing";

export default function JoinByCode() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const game = useGameClient();
  const { isReady, error: authError } = useAuth();

  const [check, setCheck] = useState<Check>("checking");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  // Ask the server if the room exists. Missing (or unreachable) → home.
  useEffect(() => {
    let active = true;
    void roomExists(code).then((exists) => {
      if (!active) return;
      if (exists) {
        setName(getStoredName());
        setCheck("found");
      } else {
        setCheck("missing");
        router.replace("/?error=notfound");
      }
    });
    return () => {
      active = false;
    };
  }, [code, router]);

  // A failed join (e.g. the room vanished between the check and the connect)
  // sends the player home with the same banner.
  useEffect(() => {
    if (game.error) {
      setJoining(false);
      router.replace("/?error=notfound");
    }
  }, [game.error, router]);

  // Already joined → render the game, same as the home route does.
  if (game.roomState) {
    return (
      <AppFrame>
        <GameScreens game={game} />
      </AppFrame>
    );
  }

  if (check !== "found") {
    return (
      <AppFrame>
        <div className="flex items-center justify-center gap-2 py-10 text-neutral-400">
          <MiniSpinner />
          Looking for room {code}…
        </div>
      </AppFrame>
    );
  }

  const busy = !isReady || game.status === "connecting" || joining;
  const joinLabel = !isReady
    ? authError
      ? "Sign-in failed"
      : "Signing in…"
    : joining
      ? "Joining…"
      : "Join game";

  const onJoin = () => {
    const finalName = name.trim() || "Player";
    storeName(finalName);
    setJoining(true);
    game.join(code, finalName);
  };

  return (
    <AppFrame>
      <p className="mb-6 text-center text-neutral-400">
        Joining room{" "}
        <span className="font-mono font-bold tracking-[0.2em] text-neutral-200">
          {code}
        </span>
        . Pick a name to play.
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onJoin();
        }}
        className="mb-5 w-full rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent"
      />

      <button
        onClick={onJoin}
        disabled={busy}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white disabled:cursor-default disabled:opacity-50"
      >
        {joining && <MiniSpinner />}
        {joinLabel}
      </button>
    </AppFrame>
  );
}
