import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from "../roomCode.js";

describe("room codes", () => {
  it("uses 32 unambiguous symbols (no 0, O, 1 or I)", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("generates valid, well-spread codes", () => {
    const codes = Array.from({ length: 2000 }, generateRoomCode);
    for (const code of codes) expect(normalizeRoomCode(code)).toBe(code);
    expect(new Set(codes).size).toBeGreaterThan(1990); // collisions are astronomically rare
    const used = new Set(codes.join(""));
    expect(used.size).toBe(32); // every symbol appears
  });

  it("normalises user input and rejects anything else", () => {
    expect(normalizeRoomCode(" abc-def ")).toBe("ABCDEF");
    expect(normalizeRoomCode("ab cd ef")).toBe("ABCDEF");
    for (const bad of ["ABCDE", "ABCDEFG", "ABCDE0", "ABCDEI", "", 123456, null, "A".repeat(40)]) {
      expect(normalizeRoomCode(bad)).toBeNull();
    }
  });
});
