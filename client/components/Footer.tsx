// Site-wide footer: attribution on the left, contact note on the right.
// Pinned to the bottom of the viewport so it sits below the centered AppFrame.

export function Footer() {
	return (
		<footer className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-0.5 px-4 py-2.5 text-center text-[10px] leading-snug text-white/40 sm:flex-row sm:items-center sm:justify-between sm:gap-1 sm:px-5 sm:py-3 sm:text-left sm:text-xs">
			<span className="pointer-events-auto">
				Created by{" "}
				<a
					href="https://pradyun.dev"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-0.5 underline hover:text-white/70"
				>
					pradyun.dev
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="h-3 w-3"
						aria-hidden="true"
					>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
				.
			</span>
		</footer>
	);
}
