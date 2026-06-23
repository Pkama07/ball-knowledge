"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomState } from "@ball-knowledge/shared";
import type { GuessFeedback } from "@/lib/useGameClient";
import { Scoreboard } from "./Scoreboard";

export function GameRound({
  state,
  meId,
  isHost,
  clockOffset,
  guessFeedback,
  onGuess,
  onGiveUp,
  onNext,
  onReset,
}: {
  state: RoomState;
  meId: string | null;
  isHost: boolean;
  clockOffset: number;
  guessFeedback: GuessFeedback | null;
  onGuess: (roundIndex: number, text: string) => void;
  onGiveUp: (roundIndex: number) => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const { phase, currentRound, lastResult } = state;

  // --- ticking clock (drives countdown + progress bar) ---
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase]);

  // --- synced audio playback ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    if (!currentRound) return;
    const audio = new Audio(currentRound.previewUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const startLocal = currentRound.startsAt - clockOffset; // local epoch ms
    const start = () => {
      const elapsed = Date.now() - startLocal;
      if (elapsed > 0 && elapsed < currentRound.durationMs) {
        try {
          audio.currentTime = elapsed / 1000;
        } catch {
          /* ignore seek errors */
        }
      }
      audio.play().then(
        () => setNeedsUnlock(false),
        () => setNeedsUnlock(true) // autoplay blocked → show unlock button
      );
    };

    const delay = startLocal - Date.now();
    const timer = delay <= 0 ? undefined : setTimeout(start, delay);
    if (delay <= 0) start();

    return () => {
      if (timer) clearTimeout(timer);
      audio.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.previewUrl, currentRound?.startsAt]);

  // --- guess input ---
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const alreadyWon = guessFeedback?.awarded === true;

  // The guess input lives in the DOM during the countdown too (disabled), so a
  // bare autoFocus won't fire when play actually begins — focus it explicitly
  // once the round goes live.
  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase]);

  // Whether *this* player has hit "I don't know" for the current round. Reset
  // whenever the round changes so the button is live again next round.
  const [gaveUp, setGaveUp] = useState(false);
  const roundIndex = currentRound?.index;
  useEffect(() => {
    setGaveUp(false);
  }, [roundIndex]);

  const locked = alreadyWon || gaveUp;

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !currentRound || locked) return;
    onGuess(currentRound.index, text.trim());
    setText("");
  }

  function handleGiveUp() {
    if (!currentRound || locked) return;
    setGaveUp(true);
    onGiveUp(currentRound.index);
  }

  const header = (
    <div className="mb-5 flex items-center justify-between text-sm text-neutral-400">
      <span>{state.artistName}</span>
      <span>
        Round {state.roundNumber} / {state.totalRounds}
      </span>
    </div>
  );

  // Seconds left in the countdown, clamped to the configured countdown length so
  // a not-yet-synced clock offset can't briefly flash a wildly wrong number.
  const countdownSecs =
    phase === "countdown" && currentRound
      ? Math.min(
          Math.ceil(state.config.countdownMs / 1000),
          Math.max(
            0,
            Math.ceil((currentRound.startsAt - clockOffset - now) / 1000)
          )
        )
      : 0;

  // ------------- COUNTDOWN + PLAYING (one shared layout) -------------
  // Both phases render the exact same skeleton, so nothing reflows when the
  // countdown ends: only the status block (countdown digit vs. timer) and the
  // disabled state of the controls change. The status block is a fixed height so
  // the big countdown number and the small timer text take the same vertical
  // space — keeping the header and everything below pinned in place. (This also
  // covers the brief local tail of the countdown once it hits 0 and audio is
  // starting, so we slide straight into the live guess UI with no flicker.)
  if ((phase === "playing" || phase === "countdown") && currentRound) {
    const isCountdown = phase === "countdown" && countdownSecs > 0;
    const endLocal = currentRound.startsAt + currentRound.durationMs - clockOffset;
    const remaining = Math.max(0, endLocal - now);
    const pct = isCountdown
      ? 100
      : Math.min(100, (remaining / currentRound.durationMs) * 100);
    const inputLocked = locked || isCountdown;

    return (
      <div>
        {header}
        <div className="mb-6 flex h-24 flex-col items-center justify-center text-center">
          {isCountdown ? (
            <>
              <div className="text-sm text-neutral-400">Get ready…</div>
              <div className="text-7xl font-black leading-none tabular-nums">
                {countdownSecs}
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold">Name that song!</div>
              <div className="mt-1 text-sm text-neutral-400">
                {(remaining / 1000).toFixed(0)}s left
              </div>
            </>
          )}
        </div>

        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-edge">
          <div
            className="h-full bg-accent transition-[width] duration-100 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>

        {needsUnlock && (
          <div className="mb-4 flex justify-center">
            <UnlockButton audioRef={audioRef} onUnlocked={() => setNeedsUnlock(false)} />
          </div>
        )}

        <form onSubmit={submitGuess} className="mb-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            disabled={inputLocked}
            placeholder={
              isCountdown
                ? "Get ready…"
                : alreadyWon
                  ? "You got it! 🎉"
                  : gaveUp
                    ? "You gave up — waiting on others…"
                    : "Type your guess…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={inputLocked}
            className="cursor-pointer rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:cursor-default disabled:opacity-40"
          >
            Guess
          </button>
        </form>

        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleGiveUp}
            disabled={inputLocked}
            className="cursor-pointer rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-default disabled:opacity-40"
          >
            🤷 I don&apos;t know
          </button>
          {state.gaveUpCount > 0 && (
            <span className="text-sm text-neutral-400">
              {state.gaveUpCount} / {state.players.length} gave up
            </span>
          )}
        </div>

        <GuessFeedbackLine feedback={isCountdown ? null : guessFeedback} />

        <div className="mt-6">
          <Scoreboard players={state.players} meId={meId} />
        </div>

        {isHost && <HostResetButton onReset={onReset} />}
      </div>
    );
  }

  // ---------------- REVEAL ----------------
  if (phase === "reveal" && lastResult) {
    const winner = lastResult.winnerId
      ? state.players.find((p) => p.id === lastResult.winnerId)
      : null;
    const isLastRound = state.roundNumber >= state.totalRounds;

    return (
      <div>
        {header}
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-edge bg-panel p-4">
          {lastResult.song.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lastResult.song.artworkUrl}
              alt=""
              className="h-20 w-20 rounded-lg"
            />
          ) : (
            <div className="h-20 w-20 rounded-lg bg-edge" />
          )}
          <div className="min-w-0">
            <div className="text-sm text-neutral-400">The song was</div>
            <div className="truncate text-xl font-bold">
              {lastResult.song.title}
            </div>
            <div className="truncate text-neutral-400">
              {lastResult.song.album}
            </div>
          </div>
        </div>

        <div className="mb-6 text-center text-lg">
          {winner ? (
            <span>
              <span className="font-bold text-accent">{winner.name}</span> got it
              {lastResult.elapsedMs != null && (
                <span className="text-neutral-400">
                  {" "}
                  in {(lastResult.elapsedMs / 1000).toFixed(1)}s
                </span>
              )}{" "}
              🎉
            </span>
          ) : (
            <span className="text-neutral-400">Nobody guessed it 😴</span>
          )}
        </div>

        <Scoreboard
          players={state.players}
          meId={meId}
          winnerId={lastResult.winnerId}
        />

        {isHost && <HostResetButton onReset={onReset} />}

        <div className="mt-7">
          {isHost ? (
            <button
              onClick={onNext}
              className="w-full cursor-pointer rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white"
            >
              {isLastRound ? "See final results" : "Next round →"}
            </button>
          ) : (
            <div className="rounded-xl border border-edge bg-panel px-5 py-4 text-center text-neutral-400">
              Waiting for the host…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- FINISHED ----------------
  if (phase === "finished") {
    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    const topScore = ranked[0]?.score ?? 0;
    const winners = ranked.filter((p) => p.score === topScore && topScore > 0);

    return (
      <div className="text-center">
        <div className="text-6xl">🏆</div>
        <h2 className="mt-3 text-3xl font-black">Game over!</h2>
        <p className="mb-6 mt-1 text-neutral-400">
          {winners.length === 0
            ? "No points scored — rematch?"
            : winners.length === 1
              ? `${winners[0].name} wins!`
              : `Tie between ${winners.map((w) => w.name).join(" & ")}!`}
        </p>

        <div className="text-left">
          <Scoreboard
            players={state.players}
            meId={meId}
            winnerId={winners.length === 1 ? winners[0].id : null}
          />
        </div>

        <div className="mt-7">
          {isHost ? (
            <button
              onClick={onReset}
              className="w-full cursor-pointer rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white"
            >
              Reset game
            </button>
          ) : (
            <div className="rounded-xl border border-edge bg-panel px-5 py-4 text-center text-neutral-400">
              Waiting for the host…
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/** Low-key host-only control to abandon the current game and return everyone to
 *  the lobby. Sits under the leaderboard so it's reachable at any point mid-game
 *  without competing with the primary action. Confirms first — a stray tap here
 *  would wipe out an in-progress game for the whole room. */
function HostResetButton({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-5 flex justify-center">
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Reset the game and send everyone back to the lobby?")) {
            onReset();
          }
        }}
        className="cursor-pointer rounded-lg border border-edge px-4 py-2 text-sm font-semibold text-neutral-400 hover:border-red-500/50 hover:text-red-300"
      >
        Reset game
      </button>
    </div>
  );
}

function GuessFeedbackLine({ feedback }: { feedback: GuessFeedback | null }) {
  if (!feedback) return <div className="h-6" />;
  if (feedback.awarded)
    return <div className="h-6 text-center font-semibold text-accent">✅ +1 point!</div>;
  if (feedback.correct)
    return (
      <div className="h-6 text-center text-neutral-400">
        Correct — but someone beat you to it.
      </div>
    );
  return <div className="h-6 text-center text-red-400">❌ Not quite, keep trying!</div>;
}

function UnlockButton({
  audioRef,
  onUnlocked,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onUnlocked: () => void;
}) {
  return (
    <button
      onClick={() => audioRef.current?.play().then(onUnlocked, () => {})}
      className="mt-4 cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 font-semibold text-neutral-100 hover:bg-neutral-700"
    >
      🔊 Tap to enable sound
    </button>
  );
}
