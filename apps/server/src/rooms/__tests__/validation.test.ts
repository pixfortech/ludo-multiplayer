import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_OPTIONS } from "@ludo/shared-types";
import { RoomError } from "../errors.js";
import {
  applySettingsPatch,
  displayNameKey,
  normaliseDisplayName,
  normaliseRoomName,
  parseColourChoice,
  parseMaxPlayers,
  parseNewRoomSettings,
} from "../validation.js";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    return (error as RoomError).code;
  }
  return "no error";
};

describe("room input validation", () => {
  it("accepts 2–4 players and refuses 5–15 as not yet playable", () => {
    for (const n of [2, 3, 4]) expect(parseMaxPlayers(n)).toBe(n);
    for (let n = 5; n <= 15; n++) expect(code(() => parseMaxPlayers(n))).toBe("unsupported-player-count");
    for (const bad of [0, 1, 16, 2.5, "4", null, undefined, Number.NaN]) expect(code(() => parseMaxPlayers(bad))).toBe("invalid-player-count");
  });

  it("fills defaults for a new room", () => {
    expect(parseNewRoomSettings({ maxPlayers: 3 })).toEqual({
      maxPlayers: 3,
      autoMove: true,
      rankingMode: "winner-only",
      visibility: "private",
      turnTimerSeconds: 0,
      rules: DEFAULT_RULE_OPTIONS,
    });
    expect(parseNewRoomSettings({ maxPlayers: 4, autoMove: false, rankingMode: "full-ranking", rules: { blocksEnabled: false } })).toMatchObject({
      autoMove: false,
      rankingMode: "full-ranking",
    });
  });

  it("names exactly what is wrong with a setting", () => {
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, autoMove: "yes" }))).toBe("invalid-settings");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, rankingMode: "points" }))).toBe("invalid-settings");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, visibility: "public" }))).toBe("unsupported-setting");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, visibility: "secret" }))).toBe("invalid-settings");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, turnTimerSeconds: 30 }))).toBe("unsupported-setting");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, turnTimerSeconds: 7 }))).toBe("invalid-settings");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, rules: { blocksEnabled: true } }))).toBe("unsupported-rule");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, rules: { sixWithoutMoveGrantsRoll: false } }))).toBe("unsupported-rule");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, rules: { powerUps: true } }))).toBe("invalid-settings");
    expect(code(() => parseNewRoomSettings({ maxPlayers: 4, rules: [] }))).toBe("invalid-settings");
  });

  it("patches settings, keeping unchanged fields", () => {
    const current = parseNewRoomSettings({ maxPlayers: 4 });
    expect(applySettingsPatch(current, { autoMove: false })).toEqual({ ...current, autoMove: false });
    expect(applySettingsPatch(current, { maxPlayers: 2 }).maxPlayers).toBe(2);
    expect(applySettingsPatch(current, { rules: { captureStackedOpponents: true } }).rules).toEqual(DEFAULT_RULE_OPTIONS);
    expect(code(() => applySettingsPatch(current, { maxPlayers: 6 }))).toBe("unsupported-player-count");
  });

  it("normalises display names and rejects empty, long or invisible-trick names", () => {
    expect(normaliseDisplayName("  Aman   Kumar ")).toBe("Aman Kumar");
    expect(normaliseDisplayName("Zoë 🎲")).toBe("Zoë 🎲");
    expect(normaliseDisplayName("x".repeat(24))).toHaveLength(24);
    for (const bad of ["", "   ", "x".repeat(25), "Ama\u0000n", "evil‮eman", "zero​width", 42, null, undefined]) {
      expect(code(() => normaliseDisplayName(bad))).toBe("invalid-display-name");
    }
  });

  it("treats names that only differ by case or width as the same", () => {
    expect(displayNameKey("Aman")).toBe(displayNameKey("aMAN"));
    expect(displayNameKey("Aman")).toBe(displayNameKey("Ａｍａｎ"));
    expect(displayNameKey("Aman")).not.toBe(displayNameKey("Amana"));
  });

  it("makes the room name optional", () => {
    expect(normaliseRoomName(undefined)).toBeNull();
    expect(normaliseRoomName("  ")).toBeNull();
    expect(normaliseRoomName(" Friday  Ludo ")).toBe("Friday Ludo");
    expect(code(() => normaliseRoomName("x".repeat(41)))).toBe("invalid-room-name");
    expect(code(() => normaliseRoomName(7))).toBe("invalid-room-name");
  });

  it("parses colour choices", () => {
    expect(parseColourChoice(undefined)).toEqual({ kind: "auto" });
    expect(parseColourChoice("auto")).toEqual({ kind: "auto" });
    expect(parseColourChoice("emerald")).toEqual({ kind: "colour", colour: "emerald" });
    for (const bad of ["pink", "Crimson", 3, {}]) expect(code(() => parseColourChoice(bad))).toBe("invalid-colour");
  });
});
