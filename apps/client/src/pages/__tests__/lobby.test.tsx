import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../App";
import { ProtocolRequestError } from "../../lib/connection";
import { player, roomView, services } from "../../test/fakes";

const ben = player({ playerId: "p-ben", displayName: "Ben", seat: 2, colour: "emerald", isHost: false });

function inRoom(playerId: string, room = roomView()) {
  const s = services();
  s.client.set({ seat: { roomId: room.roomId, roomCode: room.code, playerId }, room });
  return s;
}

describe("lobby", () => {
  it("shows the code, seats, presence, settings and waiting slots", () => {
    const s = inRoom("p-host", roomView({ players: [player(), { ...ben, connectionStatus: "disconnected" }] }));
    render(<App services={s} initialPath="/room/ABC234" />);
    expect(screen.getByLabelText("Room code A B C 2 3 4")).toBeTruthy();
    expect(screen.getByText("Ready to start")).toBeTruthy();
    expect(screen.getByText("Aman")).toBeTruthy();
    expect(screen.getByText("Emerald · Bottom right")).toBeTruthy();
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getAllByText("Waiting for a player…")).toHaveLength(2);
    expect(screen.getByText("First player home")).toBeTruthy();
  });

  it("shows the room's city, and nothing extra for the classic table", () => {
    const { unmount } = render(<App services={inRoom("p-host")} initialPath="/room/ABC234" />);
    expect(screen.getByText("City").nextElementSibling?.textContent).toBe("Classic");
    expect(document.querySelector("[data-room-city]")).toBeNull();
    unmount();
    render(<App services={inRoom("p-host", roomView({ settings: { ...roomView().settings, cityTheme: "kolkata" } }))} initialPath="/room/ABC234" />);
    expect(screen.getByText("City").nextElementSibling?.textContent).toBe("Kolkata");
    expect(document.querySelector("[data-room-city]")?.getAttribute("data-room-city")).toBe("kolkata");
    expect(screen.getByText("Every move tells a story")).toBeTruthy();
  });

  it("gives only the host a Start button, enabled once two players are in", async () => {
    const s = inRoom("p-host", roomView({ players: [player()] }));
    render(<App services={s} initialPath="/room/ABC234" />);
    const start = screen.getAllByRole("button", { name: "Start game" })[0] as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    act(() => s.client.set({ room: roomView({ roomVersion: 1, players: [player(), ben] }) }));
    const ready = screen.getAllByRole("button", { name: "Start game · 2 players" })[0] as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    s.client.startResult = { room: roomView({ roomVersion: 2, status: "playing", lifecycle: "playing", players: [player(), ben] }), game: null };
    fireEvent.click(ready);
    await waitFor(() => expect(s.client.calls.some((c) => c.method === "startGame")).toBe(true));
  });

  it("tells guests they are waiting for the host, without a Start button", () => {
    const s = inRoom("p-ben", roomView({ players: [player(), ben] }));
    render(<App services={s} initialPath="/room/ABC234" />);
    expect(screen.getAllByText("Waiting for Aman to start").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Start game/ })).toBeNull();
  });

  it("updates live: new players appear and changes are announced", async () => {
    const s = inRoom("p-host", roomView({ players: [player()] }));
    render(<App services={s} initialPath="/room/ABC234" />);
    act(() => {
      s.client.set({ room: roomView({ roomVersion: 1, players: [player(), ben] }) });
      s.client.notify({ kind: "player-joined", name: "Ben" });
    });
    expect(screen.getByText("Ben")).toBeTruthy();
    expect(await screen.findByText("Ben joined")).toBeTruthy();
  });

  it("restores a refreshed tab's seat from storage", async () => {
    const s = services();
    s.seats.save({ roomCode: "ABC234", playerId: "p-ben", secret: "ben-secret", displayName: "Ben", roomName: null });
    s.tab.set({ roomCode: "ABC234", playerId: "p-ben" });
    const room = roomView({ players: [player(), ben] });
    s.client.resumeResults = [{ room, game: null, player: ben, missedActions: null, controlEpoch: 1 }];
    render(<App services={s} initialPath="/room/ABC234" />);
    expect(await screen.findByText("Emerald · Bottom right")).toBeTruthy();
    expect(s.client.calls[0]).toEqual({ method: "resume", args: [{ playerId: "p-ben", secret: "ben-secret" }, { takeover: false }] });
  });

  it("never takes over a seat open in another tab without asking", async () => {
    const s = services();
    s.seats.save({ roomCode: "ABC234", playerId: "p-ben", secret: "ben-secret", displayName: "Ben", roomName: null });
    const room = roomView({ players: [player(), ben] });
    s.client.resumeResults = [new ProtocolRequestError("session-in-use", "in use"), { room, game: null, player: ben, missedActions: null, controlEpoch: 1 }];
    render(<App services={s} initialPath="/room/ABC234" />);
    const takeover = await screen.findByRole("button", { name: "Continue here as Ben" });
    expect(s.client.calls).toHaveLength(1);
    fireEvent.click(takeover);
    await waitFor(() => expect(s.client.calls[1]).toEqual({ method: "resume", args: [{ playerId: "p-ben", secret: "ben-secret" }, { takeover: true }] }));
    expect(await screen.findByText("Emerald · Bottom right")).toBeTruthy();
  });

  it("forgets a seat the server says has expired, and offers a way out", async () => {
    const s = services();
    s.seats.save({ roomCode: "ABC234", playerId: "p-ben", secret: "old", displayName: "Ben", roomName: null });
    s.client.resumeResults = [new ProtocolRequestError("session-expired", "gone")];
    render(<App services={s} initialPath="/room/ABC234" />);
    expect(await screen.findByText(/This seat is no longer available/)).toBeTruthy();
    expect(s.seats.list()).toEqual([]);
  });

  it("drops the stored seat when the server says the player is no longer in the room", async () => {
    const s = inRoom("p-ben", roomView({ players: [player(), ben] }));
    s.seats.save({ roomCode: "ABC234", playerId: "p-ben", secret: "ben-secret", displayName: "Ben", roomName: null });
    s.tab.set({ roomCode: "ABC234", playerId: "p-ben" });
    render(<App services={s} initialPath="/room/ABC234" />);
    expect(await screen.findByText("Emerald · Bottom right")).toBeTruthy();
    act(() => s.client.set({ seat: null, ended: "left" }));
    expect(await screen.findByText("You're no longer in this room.")).toBeTruthy();
    expect(s.seats.list()).toEqual([]);
    expect(s.tab.get()).toBeNull();
  });

  it("sends people without a seat to the join page", () => {
    render(<App services={services()} initialPath="/room/ABC234" />);
    expect(screen.getByRole("button", { name: "Join room ABC·234" })).toBeTruthy();
  });
});
