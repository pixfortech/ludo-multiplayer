import { randomInt } from "crypto";

/**
 * Cryptographically strong, fair six-sided die.
 *
 * Takes NO arguments: the runtime always uses this real random source. There is
 * deliberately no injectable RNG — an earlier design accepted a `() => number`
 * function whose meaning was ambiguous (random float vs. fixed value), which is
 * exactly the kind of mix-up that can silently bias rolls. Tests that need a
 * deterministic roll pass an explicit dice value to `rollDice` instead.
 *
 * @returns an integer in the inclusive range [1, 6].
 */
export function rollD6(): number {
  return randomInt(1, 7); // randomInt's upper bound is exclusive → 1..6
}

/** True only for an integer in the inclusive 1–6 range (validates test overrides). */
export function isValidDie(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}
