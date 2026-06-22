// Shared page chrome: the centered column, the title, and the dismissible red
// error banner. Used by both the home route and the `/<CODE>` join route.

import type { ReactNode } from "react";

export function AppFrame({
  error,
  onDismissError,
  children,
}: {
  error?: string | null;
  onDismissError?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-10">
      <h1 className="mb-8 text-center text-2xl font-black">🎵 Ball Knowledge</h1>

      {error && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
          <span>{error}</span>
          {onDismissError && (
            <button
              onClick={onDismissError}
              className="cursor-pointer text-red-300/70 hover:text-red-200"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
