// Which character reacts to which moment, and how (C.3C.1). The moments are
// the playback's presentation cues, which come only from the server's
// committed history: nothing here infers a capture, a home entry or a win from
// where tokens stand, and nothing here changes the game. Reactions are short
// and varied: in a team, each person reacts their own way (a jump, a cheer, a
// wave, a look round at the others), and which way rotates from one event to
// the next.
//
//   six           the roller's team: jump / cheer / wave / look (one each)
//   forfeit       three sixes: one is upset, the others look round
//   no-move       no legal move: one is upset, the others in the base look round
//   capture       the capturer cheers (the caught are already reacting: dismay, back to base)
//   bonus         a capture's or a home's bonus roll: one teammate in the base waves
//   home          a teammate arrived home: the others cheer or wave
//   finished      all four of a player's people are home: they celebrate together
//   win           the winner's people celebrate; everyone else applauds (waves)

import type { PresentationCue } from "../../game/presentation";
import type { ReactionKind } from "./brain";

/** A character on the board, as far as reactions are concerned. */
export interface CastMember {
  /** `playerId:tokenId`. */
  tokenKey: string;
  seat: number;
  tokenId: number;
  /** null in the base, 56 home. */
  step: number | null;
}

export interface ChosenReaction {
  kind: ReactionKind;
  /** When the cue was shown (performance.now()), and how long the reaction lasts (ms). */
  at: number;
  ms: number;
  cue: number;
}

/** How `member` reacts to `cue` (null: it does not concern them). */
export function reactionTo(cue: PresentationCue, member: CastMember): ReactionKind | null {
  const own = member.seat === cue.seat;
  const home = member.step === 56;
  const inBase = member.step === null;
  const rotate = <T>(options: readonly T[]): T => options[(member.tokenId + cue.id) % options.length]!;
  const chosen = member.tokenId === cue.id % 4;
  switch (cue.kind) {
    case "six":
      return own && !home ? rotate(["jump", "cheer", "wave", "look"] as const) : null;
    case "forfeit":
      return own && !home ? (chosen ? "upset" : "look") : null;
    case "no-move":
      return own && inBase ? (chosen ? "upset" : "look") : null;
    case "capture":
      return cue.tokens.includes(member.tokenKey) ? "cheer" : null;
    case "bonus":
      return own && inBase && chosen ? "wave" : null;
    case "home":
      return own && !home && !cue.tokens.includes(member.tokenKey) ? rotate(["cheer", "wave"] as const) : null;
    case "finished":
      return own ? rotate(["jump", "cheer"] as const) : null;
    case "win":
      return own ? rotate(["cheer", "jump"] as const) : "wave";
  }
}

/** The reaction `member` is playing at `now`: the most recent cue still running that concerns them. */
export function reactionFor(member: CastMember, cues: readonly PresentationCue[], now: number): ChosenReaction | null {
  for (let i = cues.length - 1; i >= 0; i--) {
    const cue = cues[i]!;
    if (now - cue.at >= cue.ms) continue;
    const kind = reactionTo(cue, member);
    if (kind) return { kind, at: cue.at, ms: cue.ms, cue: cue.id };
  }
  return null;
}
