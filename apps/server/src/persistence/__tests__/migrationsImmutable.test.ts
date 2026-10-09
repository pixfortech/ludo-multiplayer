// Applied migrations must never change: the migrator would refuse to start
// against any database that already ran them. This pins each migration's
// checksum, so an accidental edit fails here instead of in production.
// Adding a migration means adding its line; changing a line is never right.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../migrate.js";

const PINNED: Record<string, string> = {
  "0001_initial": "2fdb8a5030120f4f69ed0404c5f25e85651ec6d76205f851222dfb0b762973d7",
  "0002_room_lifecycle": "1b7f45c4e2a60ad3233e443afad7b92e4a612c13c479b6770a7dd9cf0be890bb",
  "0003_session_resume": "4b322641d2099d2df3a15ccfa3040cc3a0675ad3d80534a49d8272cc17511b75",
};

describe("migration history", () => {
  it("is append-only: every shipped migration matches its pinned checksum", () => {
    const actual = Object.fromEntries(MIGRATIONS.map((m) => [m.id, createHash("sha256").update(m.sql).digest("hex")]));
    expect(actual).toEqual(PINNED);
  });

  it("is numbered in order without gaps", () => {
    expect(MIGRATIONS.map((m) => Number(m.id.slice(0, 4)))).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});
