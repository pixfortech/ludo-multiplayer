// A board view is one player's own choice: kept per tab and per seat, never shared between players in
// the same browser, never followed from another tab.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStorage } from "../../../lib/session";
import { SEAT_VIEWS_KEY, TAB_VIEW_KEY, readViewPreference, seatViewKey, useViewPreference, writeViewPreference } from "../capabilities";

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("a player's board view", () => {
  it("is kept per tab: two players in two tabs of one browser (one localStorage) keep their own", () => {
    const local = memory();
    const tabA = { tab: memory(), local };
    const tabB = { tab: memory(), local };
    const red = seatViewKey("ABC123", "p-red");
    const blue = seatViewKey("ABC123", "p-blue");
    writeViewPreference({ mode: "3d", quality: "high" }, red, tabA);
    writeViewPreference({ mode: "2d", quality: null }, blue, tabB);
    expect(readViewPreference(red, tabA)).toEqual({ mode: "3d", quality: "high" });
    expect(readViewPreference(blue, tabB)).toEqual({ mode: "2d", quality: null });
    // Red changes again: Blue's tab is untouched.
    writeViewPreference({ mode: "2.5d", quality: "low" }, red, tabA);
    expect(readViewPreference(blue, tabB)).toEqual({ mode: "2d", quality: null });
  });

  it("comes back for the same seat in a new tab (after closing the browser), and only for that seat", () => {
    const local = memory();
    const red = seatViewKey("ABC123", "p-red");
    writeViewPreference({ mode: "3d", quality: "medium" }, red, { tab: memory(), local });
    const fresh = { tab: memory(), local };
    expect(readViewPreference(red, fresh)).toEqual({ mode: "3d", quality: "medium" });
    expect(readViewPreference(seatViewKey("ABC123", "p-green"), fresh), "another player's seat starts on the defaults").toEqual({ mode: null, quality: null });
    expect(readViewPreference(null, fresh)).toEqual({ mode: null, quality: null });
  });

  it("this tab's choice wins over the seat's memory, and nothing else is read (the old shared key is ignored)", () => {
    const local = memory();
    local.setItem("ludo.board-view.v1", JSON.stringify({ mode: "2d", quality: "low" }));
    const tab = memory();
    expect(readViewPreference(seatViewKey("ABC123", "p-red"), { tab, local })).toEqual({ mode: null, quality: null });
    writeViewPreference({ mode: "2.5d", quality: null }, seatViewKey("ABC123", "p-red"), { tab: memory(), local });
    tab.setItem(TAB_VIEW_KEY, JSON.stringify({ mode: "3d", quality: "high" }));
    expect(readViewPreference(seatViewKey("ABC123", "p-red"), { tab, local })).toEqual({ mode: "3d", quality: "high" });
  });

  it("keeps the twenty most recent seats, and survives broken or blocked storage", () => {
    const local = memory();
    for (let i = 0; i < 25; i++) writeViewPreference({ mode: "3d", quality: null }, seatViewKey("ROOM01", `p-${i}`), { tab: memory(), local }, 1000 + i);
    const kept = JSON.parse(local.getItem(SEAT_VIEWS_KEY)!) as Record<string, unknown>;
    expect(Object.keys(kept)).toHaveLength(20);
    expect(kept["ROOM01:p-24"]).toBeDefined();
    expect(kept["ROOM01:p-0"]).toBeUndefined();
    const broken = memory();
    broken.setItem(TAB_VIEW_KEY, "{not json");
    expect(readViewPreference(null, { tab: broken, local: null })).toEqual({ mode: null, quality: null });
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(() => writeViewPreference({ mode: "2d", quality: null }, "X:Y", { tab: throwing, local: throwing })).not.toThrow();
    expect(readViewPreference("X:Y", { tab: throwing, local: throwing })).toEqual({ mode: null, quality: null });
  });

  it("the hook never follows another tab's change (no storage events are listened to)", () => {
    const listen = vi.spyOn(window, "addEventListener");
    const { result } = renderHook(() => useViewPreference(seatViewKey("ABC123", "p-red")));
    expect(listen.mock.calls.some(([type]) => type === "storage")).toBe(false);
    act(() => result.current[1]({ mode: "3d" }));
    expect(result.current[0]).toEqual({ mode: "3d", quality: null });
    // Another tab writes its own choice: this hook keeps its own.
    window.dispatchEvent(new StorageEvent("storage", { key: TAB_VIEW_KEY, newValue: JSON.stringify({ mode: "2d", quality: null }) }));
    expect(result.current[0]).toEqual({ mode: "3d", quality: null });
    listen.mockRestore();
  });

  it("applies the seat's own memory once the seat is known, unless this tab has already chosen", () => {
    writeViewPreference({ mode: "3d", quality: "low" }, seatViewKey("ABC123", "p-red"), { tab: memory(), local: localStorage });
    const { result, rerender } = renderHook(({ seat }) => useViewPreference(seat), { initialProps: { seat: null as string | null } });
    expect(result.current[0]).toEqual({ mode: null, quality: null });
    rerender({ seat: seatViewKey("ABC123", "p-red") });
    expect(result.current[0]).toEqual({ mode: "3d", quality: "low" });
  });
});
