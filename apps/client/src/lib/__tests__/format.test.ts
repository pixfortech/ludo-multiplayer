import { describe, expect, it } from "vitest";
import { formatRoomCode, isCompleteCode, normaliseCodeInput } from "../format";
import { matchRoute, paths } from "../router";

describe("room codes", () => {
  it("accepts typed, spaced, dashed or pasted-link input", () => {
    expect(normaliseCodeInput("abc 234")).toBe("ABC234");
    expect(normaliseCodeInput("ABC-234")).toBe("ABC234");
    expect(normaliseCodeInput("ABC·234")).toBe("ABC234");
    expect(normaliseCodeInput("https://ludo.example.com/join/abc234")).toBe("ABC234");
    expect(normaliseCodeInput("ABC2345678")).toBe("ABC234");
  });

  it("validates against the server's alphabet (no 0/O or 1/I)", () => {
    expect(isCompleteCode("ABC234")).toBe(true);
    expect(isCompleteCode("ABC23")).toBe(false);
    expect(isCompleteCode("ABC0O1")).toBe(false);
    expect(formatRoomCode("ABC234")).toBe("ABC·234");
  });
});

describe("routes", () => {
  it("maps paths without ever carrying credentials", () => {
    expect(matchRoute("/")).toEqual({ name: "home" });
    expect(matchRoute("/create")).toEqual({ name: "create" });
    expect(matchRoute("/join")).toEqual({ name: "join", code: null });
    expect(matchRoute("/join/abc234")).toEqual({ name: "join", code: "ABC234" });
    expect(matchRoute("/room/ABC234/")).toEqual({ name: "lobby", code: "ABC234" });
    expect(matchRoute("/room/ABC")).toEqual({ name: "not-found" });
    expect(paths.lobby("ABC234")).toBe("/room/ABC234");
    expect(paths.join("ABC234")).toBe("/join/ABC234");
  });
});
