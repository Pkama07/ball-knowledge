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
	// When true, the "Join room" button is swapped for the ROOM CODE input.
	const [joining, setJoining] = useState(false);

	// Prefill the name from the last-used value stored in the cookie.
	useEffect(() => setName(getStoredName()), []);
	// Clear the "creating" loading state if the attempt fails — either an
	// explicit server error, or the socket erroring/closing before a room
	// ever arrives (otherwise the button hangs on "Creating room…" forever).
	useEffect(() => {
		if (game.error || game.status === "error" || game.status === "closed") {
			setCreating(false);
		}
	}, [game.error, game.status]);

	// Block connecting until we have an anonymous session (and thus a token).
	const busy = game.status === "connecting" || !isReady;
	// Gate the create/join actions until the player has typed a name.
	const hasName = name.trim().length > 0;

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

	const canJoin = !busy && code.trim().length >= 6;
	const submitJoin = () => {
		if (canJoin) game.join(code.trim(), resolvedName());
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
				disabled={creating}
				className="mb-3 w-full rounded-xl border border-edge bg-panel px-4 py-3 text-base text-neutral-100 outline-none focus:border-accent disabled:cursor-default disabled:opacity-50"
			/>

			<div className="flex flex-col gap-2 sm:flex-row">
				{/* Both slots are identical flex-1 wrappers so the row layout never
				    shifts when the right side swaps between button and input. */}
				<div className="min-w-0 flex-1">
					<button
						onClick={() => {
							setCreating(true);
							game.create(resolvedName());
						}}
						disabled={busy || creating || !hasName}
						className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent bg-accent px-5 py-4 text-lg font-bold text-white disabled:cursor-default disabled:opacity-50"
					>
						{creating && <MiniSpinner />}
						{createLabel}
					</button>
				</div>

				<div className="relative min-w-0 flex-1">
					{joining ? (
						<>
							<input
								type="text"
								autoFocus
								placeholder="ROOM CODE"
								value={code}
								onChange={(e) =>
									setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
								}
								onKeyDown={(e) => {
									if (e.key === "Enter") submitJoin();
								}}
								onBlur={() => setJoining(false)}
								maxLength={6}
								className="w-full rounded-xl border border-edge bg-panel py-4 pl-12 pr-12 text-center font-mono text-lg uppercase tracking-[0.2em] text-neutral-100 outline-none focus:border-accent"
							/>
							<button
								type="button"
								aria-label="Join room"
								// Keep the input focused so its onBlur doesn't swap this
								// button away before the click lands.
								onMouseDown={(e) => e.preventDefault()}
								onClick={submitJoin}
								disabled={!canJoin}
								className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:cursor-default disabled:opacity-40"
							>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<line x1="5" y1="12" x2="19" y2="12" />
									<polyline points="12 5 19 12 12 19" />
								</svg>
							</button>
						</>
					) : (
						<button
							onClick={() => setJoining(true)}
							disabled={busy || creating || !hasName}
							className="w-full cursor-pointer rounded-xl border border-transparent bg-neutral-800 px-5 py-4 text-lg font-bold text-neutral-100 hover:bg-neutral-700 disabled:cursor-default disabled:opacity-50"
						>
							Join room
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
