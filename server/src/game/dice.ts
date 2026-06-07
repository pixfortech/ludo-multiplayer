import { randomInt } from "crypto";

export type RngFn = () => number;

const cryptoRng: RngFn = () => randomInt(1, 7);

export function rollD6(rng: RngFn = cryptoRng): number {
  return rng();
}
