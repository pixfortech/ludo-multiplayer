import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../App";
import { ProtocolRequestError } from "../../lib/connection";
import { membership, roomView, services } from "../../test/fakes";
import { previewSeats } from "../CreateRoomPage";

const submit = () => fireEvent.click(screen.getAllByRole("button", { name: /Create room/ })[0]!);

describe("create room", () => {
  it("requires a name before asking the server", () => {
    const s = services();
    render(<App services={s} initialPath="/create" />);
    submit();
    expect(screen.getByText("Choose a name of 1–24 characters.")).toBeTruthy();
    expect(s.client.calls).toHaveLength(0);
  });

  it("sends the chosen table to the server, saves the seat for this tab and opens the lobby", async () => {
    const s = services();
    const room = roomView({ maxPlayers: 2, roomVersion: 0 });
    s.client.createResult = membership(room, "p-host", "the-secret");
    render(<App services={s} initialPath="/create" />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Aman  " } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Players" })).getByRole("radio", { name: "2" }));
    fireEvent.click(screen.getByRole("radio", { name: "Royal Blue" }));
    fireEvent.click(screen.getByRole("switch", { name: "Auto-move" }));
    fireEvent.click(screen.getByRole("radio", { name: "Full ranking" }));
    submit();
    await waitFor(() => expect(window.location.pathname).toBe("/room/ABC234"));
    expect(s.client.calls[0]).toEqual({ method: "createRoom", args: [{ hostName: "Aman", maxPlayers: 2, roomName: null, colour: "royal-blue", autoMove: false, rankingMode: "full-ranking" }] });
    expect(s.seats.get("ABC234", "p-host")).toMatchObject({ secret: "the-secret", displayName: "Aman" });
    expect(s.tab.get()).toEqual({ roomCode: "ABC234", playerId: "p-host" });
    expect(window.location.href).not.toContain("the-secret");
  });

  it("explains a server refusal in plain words", async () => {
    const s = services();
    s.client.createResult = new ProtocolRequestError("rate-limited", "Too many requests");
    render(<App services={s} initialPath="/create" />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Aman" } });
    submit();
    expect(await screen.findByText("Too many attempts. Please wait a moment and try again.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Create a game" })).toBeTruthy();
  });

  it("previews the seats a table will use, like the server's automatic seating", () => {
    expect(previewSeats(0, 2)).toEqual([0, 2]);
    expect(previewSeats(1, 2)).toEqual([1, 3]);
    expect(previewSeats(0, 3)).toEqual([0, 1, 2]);
    expect(previewSeats(2, 4)).toEqual([0, 1, 2, 3]);
  });
});
