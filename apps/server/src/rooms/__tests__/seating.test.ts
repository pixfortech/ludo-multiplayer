import { describe, expect, it } from "vitest";
import type { RoomError } from "../errors.js";
import { assignSeat, autoSeat } from "../seating.js";

describe("seat and colour allocation", () => {
  it("fills the classic board deterministically, opposite seats first", () => {
    const occupied: number[] = [];
    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      const seat = autoSeat(4, occupied)!;
      order.push(seat);
      occupied.push(seat);
    }
    expect(order).toEqual([0, 2, 1, 3]);
    expect(autoSeat(4, occupied)).toBeNull();
  });

  it("seats an automatic player opposite a host who chose their own colour", () => {
    expect(autoSeat(4, [1])).toBe(3); // host Royal Blue → guest Golden Yellow
    expect(autoSeat(4, [3])).toBe(1);
  });

  it("ties colour to seat: choosing a colour chooses the seat", () => {
    expect(assignSeat(4, [], { kind: "colour", colour: "golden" })).toEqual({ seat: 3, colour: "golden" });
    expect(assignSeat(2, [], { kind: "auto" })).toEqual({ seat: 0, colour: "crimson" });
    expect(assignSeat(2, [{ seat: 0, colour: "crimson" }], { kind: "auto" })).toEqual({ seat: 2, colour: "emerald" });
  });

  it("refuses a taken colour, listing the free ones, and colours that are not on the board", () => {
    const error = (() => {
      try {
        assignSeat(4, [{ seat: 2, colour: "emerald" }], { kind: "colour", colour: "emerald" });
      } catch (e) {
        return e as RoomError;
      }
    })();
    expect(error?.code).toBe("colour-taken");
    expect(error?.details.availableColours).toEqual(["crimson", "royal-blue", "golden"]);
    expect(() => assignSeat(4, [], { kind: "colour", colour: "graphite" })).toThrow(expect.objectContaining({ code: "invalid-colour" }));
  });

  it("extends to larger boards: one colour per seat", () => {
    expect(autoSeat(6, [0])).toBe(3);
    expect(assignSeat(6, [], { kind: "colour", colour: "graphite" })).toEqual({ seat: 4, colour: "graphite" });
  });
});
