import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RoomPreview } from "@ludo/shared-types";
import App from "../../App";
import { ProtocolRequestError } from "../../lib/connection";
import { membership, player, roomView, services } from "../../test/fakes";

function preview(over: Partial<RoomPreview> = {}): RoomPreview {
  return {
    code: "ABC234",
    name: "Friday Ludo",
    status: "lobby",
    lifecycle: "waiting",
    maxPlayers: 4,
    joinedCount: 1,
    colours: [
      { colour: "crimson", colourName: "Crimson", seat: 0, taken: true, takenBy: "Aman" },
      { colour: "royal-blue", colourName: "Royal Blue", seat: 1, taken: false, takenBy: null },
      { colour: "emerald", colourName: "Emerald", seat: 2, taken: false, takenBy: null },
      { colour: "golden", colourName: "Golden Yellow", seat: 3, taken: false, takenBy: null },
    ],
    availableColours: ["royal-blue", "emerald", "golden"],
    occupiedSeats: [0],
    hostName: "Aman",
    cityTheme: "classic",
    joinable: true,
    blockedReason: null,
    ...over,
  };
}

describe("join room", () => {
  it("rejects codes with characters the server never uses", () => {
    render(<App services={services()} initialPath="/join" />);
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "ABC0O1" } });
    expect(screen.getByText("Room codes use letters and the numbers 2–9 only.")).toBeTruthy();
  });

  it("says when no room has that code", async () => {
    const s = services();
    s.client.previewResult = new ProtocolRequestError("room-not-found", "x");
    render(<App services={s} initialPath="/join/ZZZZZZ" />);
    expect(await screen.findByText("We couldn't find a room with that code. Check it and try again.")).toBeTruthy();
    expect(s.client.calls[0]).toEqual({ method: "previewRoom", args: ["ZZZZZZ"] });
  });

  it("shows who holds each colour, disables taken colours and defaults to Auto", async () => {
    const s = services();
    s.client.previewResult = preview();
    render(<App services={s} initialPath="/join/ABC234" />);
    const taken = (await screen.findByRole("radio", { name: "Crimson — Aman (Taken)" })) as HTMLButtonElement;
    expect(taken.disabled).toBe(true);
    expect(screen.getByRole("radio", { name: /Auto/ }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("radio", { name: "Royal Blue" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("1 of 4 players")).toBeTruthy();
  });

  it("shows the room's city before joining", async () => {
    const s = services();
    s.client.previewResult = preview({ cityTheme: "chennai" });
    render(<App services={s} initialPath="/join/ABC234" />);
    expect(await screen.findByText("Graceful moves by the shore")).toBeTruthy();
    expect(document.querySelector("[data-room-city]")?.getAttribute("data-room-city")).toBe("chennai");
  });

  it("joins with the chosen name and colour, and refreshes availability if the colour was just taken", async () => {
    const s = services();
    s.client.previewResult = preview();
    s.client.joinResult = new ProtocolRequestError("colour-taken", "taken");
    render(<App services={s} initialPath="/join/ABC234" />);
    fireEvent.click(await screen.findByRole("radio", { name: "Emerald" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ben" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Join game/ })[0]!);
    expect(await screen.findByText("Someone just took that colour. Pick another or choose Auto.")).toBeTruthy();
    expect(s.client.calls.find((c) => c.method === "joinRoom")).toEqual({ method: "joinRoom", args: [{ code: "ABC234", displayName: "Ben", colour: "emerald" }] });
    await waitFor(() => expect(s.client.calls.filter((c) => c.method === "previewRoom")).toHaveLength(2));

    const room = roomView({ players: [player(), player({ playerId: "p-ben", displayName: "Ben", seat: 3, colour: "golden", isHost: false })] });
    s.client.joinResult = membership(room, "p-ben", "ben-secret");
    fireEvent.click(screen.getAllByRole("button", { name: /Join game/ })[0]!);
    await waitFor(() => expect(window.location.pathname).toBe("/room/ABC234"));
    expect(s.seats.get("ABC234", "p-ben")?.secret).toBe("ben-secret");
  });

  it("can't join a game that has started", async () => {
    const s = services();
    s.client.previewResult = preview({ joinable: false, blockedReason: "game-already-started", status: "playing", lifecycle: "playing" });
    render(<App services={s} initialPath="/join/ABC234" />);
    expect(await screen.findByText(/This game has already started/)).toBeTruthy();
    expect((screen.getAllByRole("button", { name: /Join game/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
