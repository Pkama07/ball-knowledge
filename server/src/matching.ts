// Fuzzy matching for song-title guesses.
//
// Titles in the wild are noisy: "Get Lucky (feat. Pharrell Williams)",
// "Paranoid Android - 2017 Remaster", "Lose Yourself (From '8 Mile')". We
// normalize both the guess and the answer down to a comparable core, then
// allow a small edit distance to forgive typos.

/** Reduce a title to a comparable core: lowercase, strip parenthetical and
 *  trailing qualifiers, drop punctuation, collapse whitespace. */
export function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // (feat. ...), (Remastered)
    .replace(/\[.*?\]/g, " ") // [Live], [Explicit]
    .replace(/\s-\s.*$/, " ") // " - 2017 Remaster", " - Live"
    .replace(/\bfeat\.?.*$/, " ") // trailing "feat ..."
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ") // strip remaining punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Whether a player's guess should count as correct for the given title.
 *  Tolerance scales with title length so short titles must be exact. */
export function isCorrectGuess(guess: string, title: string): boolean {
  const g = normalizeTitle(guess);
  const t = normalizeTitle(title);
  if (!g || !t) return false;
  if (g === t) return true;

  const tolerance = t.length <= 4 ? 0 : t.length <= 8 ? 1 : 2;
  return levenshtein(g, t) <= tolerance;
}
