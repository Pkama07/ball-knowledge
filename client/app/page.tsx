"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useGameClient } from "@/lib/useGameClient";
import { AppFrame } from "@/components/AppFrame";
import { ArtistFlipper } from "@/components/ArtistFlipper";
import { GameScreens } from "@/components/GameScreens";
import { MiniSpinner } from "@/components/ui";
import { getStoredName, storeName } from "@/lib/playerName";

const NOT_FOUND_MESSAGE =
	"We couldn't find that game. Check the code and try again.";

export default function Home() {
	const game = useGameClient();

	// A `/<CODE>` visit for a missing room redirects here with `?error=notfound`.
	// Read it once on mount, surface it, then scrub it from the URL so a refresh
	// doesn't keep showing it.
	const [redirectError, setRedirectError] = useState<string | null>(null);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("error") === "notfound") {
			setRedirectError(NOT_FOUND_MESSAGE);
			window.history.replaceState(null, "", window.location.pathname);
		}
	}, []);

	const error = game.error ?? redirectError;
	const dismiss = () => {
		setRedirectError(null);
		game.dismissError();
	};

	return (
		<AppFrame error={error} onDismissError={dismiss}>
			{game.roomState ? (
				<GameScreens game={game} />
			) : (
				<HomeScreen game={game} />
			)}
		</AppFrame>
	);
}

type GameClient = ReturnType<typeof useGameClient>;

function HomeScreen({ game }: { game: GameClient }) {
	const { isReady, error: authError } = useAuth();
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	// Tracks an in-flight "create" so the button can show a loading state. On
	// success the room appears and this whole screen unmounts; on failure
	// game.error is set, so reset there.
	const [creating, setCreating] = useState(false);

	// Prefill the name from the last-used value stored in the cookie.
	useEffect(() => setName(getStoredName()), []);
	useEffect(() => {
		if (game.error) setCreating(false);
	}, [game.error]);

	// Block connecting until we have an anonymous session (and thus a token).
	const busy = game.status === "connecting" || !isReady;

	const createLabel = !isReady
		? authError
			? "Sign-in failed"
			: "Signing in…"
		: creating
			? "Creating room…"
			: "Create a room";

	const resolvedName = () => {
		const finalName = name.trim() || "Player";
		storeName(finalName);
		return finalName;
	};

	return (
		<div>
			<p className="mb-4 text-center text-neutral-400">
				Are you the biggest <ArtistFlipper /> fan out of your friends?
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
				className="mb-3 w-full rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent"
			/>

			<button
				onClick={() => {
					setCreating(true);
					game.create(resolvedName());
				}}
				disabled={busy || creating}
				className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 py-4 text-lg font-bold text-white disabled:cursor-default disabled:opacity-50"
			>
				{creating && <MiniSpinner />}
				{createLabel}
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
					onChange={(e) =>
						setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
					}
					maxLength={6}
					className="w-36 rounded-xl border border-edge bg-panel px-4 py-3 text-center font-mono text-base uppercase tracking-[0.2em] text-neutral-100 outline-none focus:border-accent"
				/>
				<button
					onClick={() => game.join(code.trim(), resolvedName())}
					disabled={busy || code.trim().length < 6}
					className="flex-1 cursor-pointer rounded-xl bg-neutral-800 px-5 py-3 font-semibold text-neutral-100 hover:bg-neutral-700 disabled:cursor-default disabled:opacity-50"
				>
					Join room
				</button>
			</div>
		</div>
	);
}
