// Persists the player's chosen display name in a cookie so it survives across
// visits and is readable on any entry path (the home screen prefills it; a
// `/<CODE>` URL prompts with it preselected).

const COOKIE = "bk_player_name";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function getStoredName(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bk_player_name=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function storeName(name: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(name);
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
