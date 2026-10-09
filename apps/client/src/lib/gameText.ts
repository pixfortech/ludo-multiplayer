// Plain-language wording for server game data: the move log, turn banners and
// move-tray entries. Display only: every fact comes from the server's history
// entries and legal-move list; nothing here decides what is possible.

import type { GameHistoryEntry, LegalMoveView } from "@ludo/shared-types";

export type NameOf = (playerId: string) => string;

export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** One log line per history entry; null for entries the log leaves out. */
export function describeEntry(entry: GameHistoryEntry, nameOf: NameOf): string | null {
  const who = "playerId" in entry ? nameOf(entry.playerId) : "";
  switch (entry.type) {
    case "roll":
      return `${who} rolled ${entry.value}`;
    case "move":
    case "auto-move": {
      const auto = entry.type === "auto-move" ? " (auto)" : "";
      if (entry.from === null) return `${who} brought token ${entry.tokenId + 1} out${auto}`;
      if (entry.to === 56) return `${who} moved token ${entry.tokenId + 1} home${auto}`;
      if (entry.from <= 50 && entry.to > 50) return `${who} moved token ${entry.tokenId + 1} into the home lane${auto}`;
      return `${who} moved token ${entry.tokenId + 1} forward ${entry.to - entry.from}${auto}`;
    }
    case "capture":
      return `${who} captured ${nameOf(entry.victimPlayerId)}'s token`;
    case "home":
      return `${who}'s token ${entry.tokenId + 1} reached home`;
    case "bonus-roll":
      return `${who} rolls again (${entry.reasons.join(", ")})`;
    case "auto-pass":
      return `${who} had no move with ${entry.dice}`;
    case "forfeit":
      return `${who} rolled three sixes: turn forfeited`;
    case "turn":
      return null;
    case "player-finished":
      return `${who} finished ${ordinal(entry.place)}`;
    case "win":
      return `${who} wins the game`;
    case "game-over":
      return "Game over";
  }
}

/** Short banners for the action just shown (at most two). */
export function calloutsFor(entries: readonly GameHistoryEntry[], nameOf: NameOf, youId: string | null): string[] {
  const out: string[] = [];
  const you = (playerId: string) => playerId === youId;
  for (const e of entries) {
    if (e.type === "win") out.push(you(e.playerId) ? "You win!" : `${nameOf(e.playerId)} wins!`);
    else if (e.type === "player-finished" && !entries.some((x) => x.type === "win" && x.playerId === e.playerId)) out.push(`${you(e.playerId) ? "You" : nameOf(e.playerId)} finished ${ordinal(e.place)}`);
    else if (e.type === "forfeit") out.push(you(e.playerId) ? "Three sixes: turn forfeited" : `${nameOf(e.playerId)} rolled three sixes: turn forfeited`);
    else if (e.type === "auto-pass") out.push(you(e.playerId) ? "No moves: passing turn" : `${nameOf(e.playerId)} has no moves: passing turn`);
    else if (e.type === "bonus-roll") {
      const reason = e.reasons.includes("capture") ? "Capture" : e.reasons.includes("home") ? "Home" : "Six";
      out.push(you(e.playerId) ? `${reason}: roll again` : `${reason}: ${nameOf(e.playerId)} rolls again`);
    } else if (e.type === "auto-move") out.push("Auto-moved: only one legal move");
  }
  return out.slice(0, 2);
}

/** Where a legal move goes, in words: "Base → start", "6 squares", "Into home lane", "Finishes". */
export function moveSummary(move: LegalMoveView): string {
  if (move.from === null) return "Base → start";
  if (move.reachesHome) return "Finishes";
  if (move.entersLane) return "Into home lane";
  return `${move.to - move.from} squares`;
}

/** Outcome tags for a legal move, from the server's flags. */
export function moveOutcomes(move: LegalMoveView, nameOf: NameOf): string[] {
  const tags: string[] = []; // opening is already said by the summary ("Base → start")
  if (move.captures.length) tags.push(`Captures ${[...new Set(move.captures.map((c) => nameOf(c.playerId)))].join(", ")}`);
  if (move.landsOnSafeCell && !move.opens) tags.push("Lands safe");
  if (move.entersLane && !move.reachesHome) tags.push("Enters lane");
  if (move.reachesHome) tags.push("Home");
  return tags;
}

/** Legal moves ordered for the tray: most advanced token first, tokens in base last. */
export function trayOrder(moves: readonly LegalMoveView[]): LegalMoveView[] {
  return [...moves].sort((a, b) => (b.from ?? -1) - (a.from ?? -1) || a.tokenId - b.tokenId);
}
