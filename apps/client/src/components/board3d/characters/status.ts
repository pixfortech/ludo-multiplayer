// Where each human character stands, so the board never silently shows a pawn in a person's place:
//  - waiting: its team's turn to load has not come (teams load one at a time, yours first);
//  - loading: its file is being fetched, decoded and compiled (a pawn stands in meanwhile);
//  - ready: the person is on the board;
//  - failed: it could not load (the error says why); a pawn keeps the game playable until a retry.
// Free of three.js: the game screen (main bundle) reads it.

export type CharacterStatus = "waiting" | "loading" | "ready" | "failed";

export interface CharacterFailure {
  /** The character's key (catalog) and the token it plays. */
  key: string;
  token: string;
  url: string;
  error: string;
}

export interface CharacterSummary {
  total: number;
  ready: number;
  loading: number;
  waiting: number;
  failed: CharacterFailure[];
}

export const NO_CHARACTERS: CharacterSummary = { total: 0, ready: 0, loading: 0, waiting: 0, failed: [] };

export function summarise(statuses: readonly { status: CharacterStatus; failure?: CharacterFailure | undefined }[]): CharacterSummary {
  const s: CharacterSummary = { total: statuses.length, ready: 0, loading: 0, waiting: 0, failed: [] };
  for (const c of statuses) {
    if (c.status === "ready") s.ready++;
    else if (c.status === "loading") s.loading++;
    else if (c.status === "waiting") s.waiting++;
    else if (c.failure) s.failed.push(c.failure);
  }
  return s;
}

export function sameSummary(a: CharacterSummary, b: CharacterSummary): boolean {
  return a.total === b.total && a.ready === b.ready && a.loading === b.loading && a.waiting === b.waiting && a.failed.length === b.failed.length && a.failed.every((f, i) => f.key === b.failed[i]!.key && f.error === b.failed[i]!.error);
}

/** One line for the player: what the board shows and, if a person is missing, why. */
export function describeCharacters(s: CharacterSummary): string | null {
  if (s.total === 0) return null;
  if (s.failed.length > 0) {
    const names = s.failed.map((f) => f.key).join(", ");
    return `${s.failed.length} of ${s.total} characters could not load (${names}): pawns stand in. ${s.failed[0]!.error}`;
  }
  if (s.ready === s.total) return `All ${s.total} characters are on the board.`;
  return `Loading characters: ${s.ready} of ${s.total} ready (pawns stand in until each arrives).`;
}

/** A readable message for anything thrown while loading a character. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
