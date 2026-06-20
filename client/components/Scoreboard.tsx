import type { Player } from "@ball-knowledge/shared";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
      {children}
    </span>
  );
}

export function Scoreboard({
  players,
  meId,
  winnerId,
}: {
  players: Player[];
  meId: string | null;
  winnerId?: string | null;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((p) => {
        const isWinner = winnerId != null && p.id === winnerId;
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
              isWinner ? "border-accent bg-accent/10" : "border-edge bg-panel"
            }`}
          >
            <span className="flex items-center gap-2">
              {isWinner && <span>🏆</span>}
              <span className="font-semibold">{p.name}</span>
              {p.isHost && <Badge>host</Badge>}
              {p.id === meId && <Badge>you</Badge>}
              {!p.connected && <Badge>offline</Badge>}
            </span>
            <span className="text-lg font-bold tabular-nums">{p.score}</span>
          </li>
        );
      })}
    </ul>
  );
}
