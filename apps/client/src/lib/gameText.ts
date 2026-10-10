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

/** What the turn banner says about the action just shown. One banner, one visual language. */
export type TurnEventKind = "win" | "finished" | "forfeit" | "capture" | "home" | "six" | "pass" | "auto";

export interface TurnEvent {
  kind: TurnEventKind;
  /** The banner itself ("Capture: roll again"). */
  title: string;
  /** One quieter line under it, if useful ("You captured Ben's token"). */
  detail: string | null;
  /** A full sentence for screen readers. */
  spoken: string;
  /** Whose event it is (colours a capture banner). */
  playerId: string;
}

const MULTI = ["", "", "Double ", "Triple ", "Quadruple "];

/** The single most important thing about the action just shown, or null when there is nothing to say. */
export function turnEventFor(entries: readonly GameHistoryEntry[], nameOf: NameOf, youId: string | null): TurnEvent | null {
  const you = (id: string) => id === youId;
  const who = (id: string) => (you(id) ? "You" : nameOf(id));
  const autoMoved = entries.some((e) => e.type === "auto-move");
  const autoLine = autoMoved ? "Auto-moved: only one legal move" : null;

  const win = entries.find((e) => e.type === "win");
  if (win && win.type === "win") {
    const title = you(win.playerId) ? "You win!" : `${nameOf(win.playerId)} wins!`;
    const over = entries.some((e) => e.type === "game-over");
    const detail = over ? "All four tokens are home." : "Play continues for the remaining places.";
    return { kind: "win", title, detail, spoken: `${title} ${detail}${over ? " The game is over." : ""}`, playerId: win.playerId };
  }
  const finished = entries.find((e) => e.type === "player-finished");
  if (finished && finished.type === "player-finished") {
    const title = `${who(finished.playerId)} finished ${ordinal(finished.place)}`;
    return { kind: "finished", title, detail: "All four tokens are home.", spoken: `${title}. All four tokens are home.`, playerId: finished.playerId };
  }
  const forfeit = entries.find((e) => e.type === "forfeit");
  if (forfeit && forfeit.type === "forfeit") {
    const title = you(forfeit.playerId) ? "Three sixes: turn forfeited" : `${nameOf(forfeit.playerId)} rolled three sixes: turn forfeited`;
    return { kind: "forfeit", title, detail: null, spoken: `${title}.`, playerId: forfeit.playerId };
  }
  const bonus = entries.find((e) => e.type === "bonus-roll");
  if (bonus && bonus.type === "bonus-roll") {
    const id = bonus.playerId;
    const again = you(id) ? "roll again" : `${nameOf(id)} rolls again`;
    if (bonus.reasons.includes("capture")) {
      const captures = entries.filter((e) => e.type === "capture");
      const victims = [...new Set(captures.map((c) => (c.type === "capture" ? c.victimPlayerId : "")))];
      const whose = victims.map((v) => (you(v) ? "your" : `${nameOf(v)}'s`)).join(" and ");
      const detail = `${who(id)} captured ${whose} ${captures.length > 1 ? `${captures.length} tokens` : "token"}`;
      return { kind: "capture", title: `${MULTI[Math.min(captures.length, 4)]}${captures.length > 1 ? "capture" : "Capture"}: ${again}`, detail, spoken: `${detail}. ${you(id) ? "You roll again." : `${nameOf(id)} rolls again.`}`, playerId: id };
    }
    if (bonus.reasons.includes("home")) {
      return { kind: "home", title: `Home: ${again}`, detail: autoLine, spoken: `${who(id)} brought a token home. ${you(id) ? "You roll again." : `${nameOf(id)} rolls again.`}`, playerId: id };
    }
    return { kind: "six", title: `Six: ${again}`, detail: autoLine, spoken: `${you(id) ? "You" : nameOf(id)} rolled a six. ${you(id) ? "Roll again." : `${nameOf(id)} rolls again.`}`, playerId: id };
  }
  const pass = entries.find((e) => e.type === "auto-pass");
  if (pass && pass.type === "auto-pass") {
    const title = you(pass.playerId) ? "No moves: passing turn" : `${nameOf(pass.playerId)} has no moves: passing turn`;
    return { kind: "pass", title, detail: null, spoken: `${title}.`, playerId: pass.playerId };
  }
  const auto = entries.find((e) => e.type === "auto-move");
  if (auto && auto.type === "auto-move") return { kind: "auto", title: "Auto-moved: only one legal move", detail: null, spoken: "Auto-moved: only one legal move.", playerId: auto.playerId };
  return null;
}

/** Where a legal move goes, in words: "Base → start", "6 squares", "Into home lane", "Finishes". */
export function moveSummary(move: LegalMoveView): string {
  if (move.from === null) return "Base → start";
  if (move.reachesHome) return "Finishes";
  if (move.entersLane) return "Into home lane";
  const squares = move.to - move.from;
  return `${squares} ${squares === 1 ? "square" : "squares"}`;
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
