"use client";

import { useState } from "react";
import {
  MAX_ROUND_DURATION_MS,
  MAX_TOTAL_ROUNDS,
  MIN_ROUND_DURATION_MS,
  MIN_TOTAL_ROUNDS,
  type Player,
  type RoomConfig,
  type RoomState,
} from "@ball-knowledge/shared";
import { ArtistSearch } from "./ArtistSearch";
import { SettingSlider, Toggle } from "./ui";

export function Lobby({
  state,
  meId,
  isHost,
  onStart,
  onSelectArtist,
  onUpdateConfig,
}: {
  state: RoomState;
  meId: string | null;
  isHost: boolean;
  onStart: () => void;
  onSelectArtist: (artistId: number, artistName: string) => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
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
        <CopyLinkButton code={state.code} />
      </div>

      <ArtistSection
        state={state}
        isHost={isHost}
        onSelectArtist={onSelectArtist}
      />

      <Settings
        config={state.config}
        isHost={isHost}
        onUpdateConfig={onUpdateConfig}
      />

      <div className="mb-2 text-sm uppercase tracking-wide text-neutral-400">
        Players ({state.players.length})
      </div>
      <PlayerChips players={state.players} meId={meId} />

      <div className="mt-7">
        {isHost ? (
          <button
            onClick={onStart}
            disabled={!hasArtist}
            className="w-full cursor-pointer rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white disabled:cursor-default disabled:opacity-40"
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

/** Box-outlined link icon that copies the joinable room URL (<origin>/<code>)
 *  to the clipboard, briefly flashing a "Copied!" popup on success. */
function CopyLinkButton({ code }: { code: string }) {
  // Increments on each copy so the popup re-mounts and replays its animation.
  const [copyCount, setCopyCount] = useState(0);

  const copy = async () => {
    const url = `${window.location.origin}/${code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopyCount((n) => n + 1);
  };

  return (
    <div className="relative">
      <button
        onClick={copy}
        aria-label="Copy invite link"
        title="Copy invite link"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-edge bg-panel text-neutral-300 hover:border-accent hover:text-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>
      {copyCount > 0 && (
        <span
          key={copyCount}
          className="animate-copied-pop pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white shadow-lg"
        >
          Copied!
        </span>
      )}
    </div>
  );
}

/** The artist box. For the host it doubles as the artist picker: an inline
 *  search when no artist is set (or when re-picking), collapsing to the chosen
 *  artist with a "Change" button at the foot. Non-hosts just see the choice. */
function ArtistSection({
  state,
  isHost,
  onSelectArtist,
}: {
  state: RoomState;
  isHost: boolean;
  onSelectArtist: (artistId: number, artistName: string) => void;
}) {
  const hasArtist = Boolean(state.artistName);
  const loading = state.phase === "loading";
  const [editing, setEditing] = useState(false);
  const showSearch = isHost && !loading && (editing || !hasArtist);

  return (
    <div className="mb-6 rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="text-sm text-neutral-400">Artist</div>

      {showSearch ? (
        <div className="mt-2">
          <ArtistSearch
            onSelect={(id, name) => {
              setEditing(false);
              onSelectArtist(id, name);
            }}
          />
          {hasArtist && (
            <button
              onClick={() => setEditing(false)}
              className="mt-3 cursor-pointer text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← Keep {state.artistName}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            {hasArtist ? (
              <span className="truncate">{state.artistName}</span>
            ) : (
              <span className="text-neutral-500">Not chosen yet</span>
            )}
            {loading && (
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-normal text-neutral-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-edge border-t-accent" />
                loading songs…
              </span>
            )}
          </span>
          {isHost && hasArtist && !loading && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 cursor-pointer text-sm font-semibold text-accent hover:underline"
            >
              Change artist
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact player list: each player is a content-sized chip (name + tags),
 *  wrapping to fill the row. No scores — those only matter once playing. */
function PlayerChips({
  players,
  meId,
}: {
  players: Player[];
  meId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-3 py-1.5"
        >
          <span className="font-semibold">{p.name}</span>
          {p.isHost && <Tag>host</Tag>}
          {p.id === meId && <Tag>you</Tag>}
          {!p.connected && <Tag>offline</Tag>}
        </span>
      ))}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
      {children}
    </span>
  );
}

function Settings({
  config,
  isHost,
  onUpdateConfig,
}: {
  config: RoomConfig;
  isHost: boolean;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
}) {
  const durationSecs = Math.round(config.roundDurationMs / 1000);

  // Non-hosts see the settings read-only.
  if (!isHost) {
    return (
      <div className="mb-6 rounded-xl border border-edge bg-panel px-4 py-3 text-sm text-neutral-400">
        <div className="mb-1 font-semibold uppercase tracking-wide">Settings</div>
        <div>
          {config.totalRounds} rounds · {durationSecs}s each
          {config.includeNonPrimaryArtist && " · features included"}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-5 rounded-xl border border-edge bg-panel px-4 py-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Settings
      </div>

      <SettingSlider
        label="Number of rounds"
        value={config.totalRounds}
        min={MIN_TOTAL_ROUNDS}
        max={MAX_TOTAL_ROUNDS}
        onChange={(rounds) => onUpdateConfig({ totalRounds: rounds })}
      />

      <SettingSlider
        label="Seconds per round"
        value={durationSecs}
        min={MIN_ROUND_DURATION_MS / 1000}
        max={MAX_ROUND_DURATION_MS / 1000}
        onChange={(secs) => onUpdateConfig({ roundDurationMs: secs * 1000 })}
        format={(secs) => `${secs}s`}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Include features</span>
        <Toggle
          label="Include features"
          checked={config.includeNonPrimaryArtist}
          onChange={(on) => onUpdateConfig({ includeNonPrimaryArtist: on })}
        />
      </div>
    </div>
  );
}
