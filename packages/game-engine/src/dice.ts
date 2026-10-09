// Dice sources. The engine never generates dice itself: the server draws a
// value from a DiceSource and passes it into `rollDice`. Tests inject fixed
// sequences. Clients never produce dice values.

export const DIE_FACES = 6;

export interface DiceSource {
  /** Returns an integer 1–6. */
  roll(): number;
}

export function isValidDieValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= DIE_FACES;
}

interface CryptoLike {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

/**
 * Cryptographically secure, unbiased die (rejection sampling on bytes).
 * Uses the Web Crypto API available in Node ≥ 19 and browsers.
 */
export function createCryptoDice(crypto: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto): DiceSource {
  if (!crypto) throw new Error("Secure randomness (Web Crypto) is not available");
  const buffer = new Uint8Array(1);
  const limit = 256 - (256 % DIE_FACES); // 252: values ≥ limit would bias the result
  return {
    roll() {
      for (;;) {
        const byte = crypto.getRandomValues(buffer)[0]!;
        if (byte < limit) return (byte % DIE_FACES) + 1;
      }
    },
  };
}

/** Deterministic die for tests and replays; throws when the sequence is exhausted. */
export function createFixedDice(values: readonly number[]): DiceSource & { remaining(): number } {
  for (const v of values) if (!isValidDieValue(v)) throw new RangeError(`Invalid die value ${v}`);
  let index = 0;
  return {
    roll() {
      if (index >= values.length) throw new Error("Fixed dice sequence exhausted");
      return values[index++]!;
    },
    remaining: () => values.length - index,
  };
}

/** Uniformly random index in [0, count) from secure randomness (used to draw the first player). */
export function drawIndex(count: number, random: { getRandomValues<T extends Uint8Array>(a: T): T } | undefined = (globalThis as { crypto?: CryptoLike }).crypto): number {
  if (!random) throw new Error("Secure randomness (Web Crypto) is not available");
  if (!Number.isInteger(count) || count < 1 || count > 256) throw new RangeError(`Invalid count ${count}`);
  const buffer = new Uint8Array(1);
  const limit = 256 - (256 % count);
  for (;;) {
    const byte = random.getRandomValues(buffer)[0]!;
    if (byte < limit) return byte % count;
  }
}
