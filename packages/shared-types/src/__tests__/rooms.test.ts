import { describe, expect, it } from "vitest";
import {
  CLASSIC_BOARD_SEATS,
  PLAYER_COLOURS,
  ROOM_STATUS_TRANSITIONS,
  boardSeatCount,
  canTransitionRoom,
  colourById,
  coloursForRoom,
  type RoomStatus,
} from "../index.js";

describe("player colours", () => {
  it("has 15 unique ids that fit the database colour format", () => {
    expect(PLAYER_COLOURS).toHaveLength(15);
    expect(new Set(PLAYER_COLOURS.map((c) => c.id)).size).toBe(15);
    for (const c of PLAYER_COLOURS) expect(c.id).toMatch(/^[a-z][a-z-]{1,23}$/);
  });

  it("offers the four traditional colours on every classic board", () => {
    for (const n of [2, 3, 4]) {
      expect(boardSeatCount(n)).toBe(CLASSIC_BOARD_SEATS);
      expect(coloursForRoom(n).map((c) => c.id)).toEqual(["crimson", "royal-blue", "emerald", "golden"]);
    }
  });

  it("expands to one colour per seat on larger boards", () => {
    expect(coloursForRoom(7)).toHaveLength(7);
    expect(coloursForRoom(15)).toEqual(PLAYER_COLOURS);
    expect(colourById("golden")?.name).toBe("Golden Yellow");
    expect(colourById("nope")).toBeUndefined();
  });
});

describe("room status transitions", () => {
  const all = Object.keys(ROOM_STATUS_TRANSITIONS) as RoomStatus[];

  it("follows lobby → playing ⇄ paused → finished → archived, with abandon from any live state", () => {
    expect(canTransitionRoom("lobby", "playing")).toBe(true);
    expect(canTransitionRoom("playing", "paused")).toBe(true);
    expect(canTransitionRoom("paused", "playing")).toBe(true);
    expect(canTransitionRoom("playing", "finished")).toBe(true);
    expect(canTransitionRoom("finished", "archived")).toBe(true);
    for (const live of ["lobby", "playing", "paused"] as const) expect(canTransitionRoom(live, "abandoned")).toBe(true);
  });

  it("never goes backwards, skips the game, or leaves archived", () => {
    expect(canTransitionRoom("playing", "lobby")).toBe(false);
    expect(canTransitionRoom("lobby", "finished")).toBe(false);
    expect(canTransitionRoom("lobby", "archived")).toBe(false);
    expect(canTransitionRoom("finished", "playing")).toBe(false);
    for (const to of all) expect(canTransitionRoom("archived", to)).toBe(false);
    for (const s of all) expect(canTransitionRoom(s, s)).toBe(false);
  });
});
