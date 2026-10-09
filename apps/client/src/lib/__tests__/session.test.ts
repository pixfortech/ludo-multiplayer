import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../test/fakes";
import { SeatStore, TabSeat, type KeyValueStorage } from "../session";

const seat = (roomCode: string, playerId: string, displayName = "Aman") => ({ roomCode, playerId, secret: `secret-${playerId}`, displayName, roomName: null });

describe("saved seats", () => {
  it("keeps one entry per room and player, newest first, so two players can share a browser", () => {
    const store = new SeatStore(new MemoryStorage());
    store.save(seat("ABC234", "p1"), new Date("2026-01-01T10:00:00Z"));
    store.save(seat("ABC234", "p2", "Ben"), new Date("2026-01-01T11:00:00Z"));
    store.save(seat("XYZ789", "p3"), new Date("2026-01-01T09:00:00Z"));
    expect(store.forRoom("ABC234").map((s) => s.displayName)).toEqual(["Ben", "Aman"]);
    expect(store.list().map((s) => s.playerId)).toEqual(["p2", "p1", "p3"]);
    store.save(seat("ABC234", "p1"), new Date("2026-01-01T12:00:00Z")); // resuming refreshes, never duplicates
    expect(store.list().map((s) => s.playerId)).toEqual(["p1", "p2", "p3"]);
    store.remove("ABC234", "p1");
    expect(store.get("ABC234", "p1")).toBeNull();
  });

  it("survives unavailable or corrupted storage", () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    const store = new SeatStore(broken);
    expect(store.list()).toEqual([]);
    expect(() => store.save(seat("ABC234", "p1"))).not.toThrow();
    const garbage = new MemoryStorage();
    garbage.setItem("ludo.seats.v1", "{not json");
    expect(new SeatStore(garbage).list()).toEqual([]);
    garbage.setItem("ludo.seats.v1", JSON.stringify([{ roomCode: "ABC234" }, { ...seat("ABC234", "p1"), savedAt: "2026" }]));
    expect(new SeatStore(garbage).list()).toHaveLength(1);
  });

  it("remembers which seat this tab controls, separately from the saved seats", () => {
    const tab = new TabSeat(new MemoryStorage());
    expect(tab.get()).toBeNull();
    tab.set({ roomCode: "ABC234", playerId: "p1" });
    expect(tab.get()).toEqual({ roomCode: "ABC234", playerId: "p1" });
    tab.clear();
    expect(tab.get()).toBeNull();
  });
});
