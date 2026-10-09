import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "../../App";
import { services } from "../../test/fakes";

describe("home page", () => {
  it("leads with one primary action and offers join, resume and a code box", () => {
    render(<App services={services()} initialPath="/" />);
    expect(screen.getByRole("heading", { level: 1, name: /Ludo, beautifully played together/ })).toBeTruthy();
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(within(hero).getByRole("button", { name: /Create game/ })).toBeTruthy();
    expect(within(hero).getByRole("button", { name: /Join game/ })).toBeTruthy();
    expect(within(hero).getByLabelText("Have a code?")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Resume/ }).length).toBeGreaterThan(0);
  });

  it("previews 2–15 players but only offers 2–4 as playable", () => {
    render(<App services={services()} initialPath="/" />);
    const group = screen.getByRole("radiogroup", { name: "Players" });
    expect(within(group).getAllByRole("radio")).toHaveLength(14);
    fireEvent.click(within(group).getByRole("radio", { name: "7 players, in development" }));
    expect(screen.getAllByText("In development").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Coming later" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: "3 players" }));
    expect(screen.getByRole("button", { name: "Create a 3-player game" })).toBeTruthy();
  });

  it("labels 3D as a preview of a view in development, and other modes honestly", () => {
    render(<App services={services()} initialPath="/" />);
    fireEvent.click(screen.getByRole("radio", { name: "3D view preview, in development" }));
    expect(screen.getByText("Preview only: the 3D tabletop view is in development.")).toBeTruthy();
    const modes = screen.getByRole("heading", { name: /Start classic/ }).closest("section")!;
    expect(within(modes).getByText("Available")).toBeTruthy();
    expect(within(modes).getAllByText("In development")).toHaveLength(2);
    expect(within(modes).getByText("Planned")).toBeTruthy();
  });

  it("checks a typed room code before going to the join page", () => {
    render(<App services={services()} initialPath="/" />);
    const input = screen.getByLabelText("Have a code?") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Find room" }));
    expect(screen.getByRole("alert").textContent).toMatch(/6-character room code/);
    fireEvent.change(input, { target: { value: "abc-234" } });
    expect(input.value).toBe("ABC·234");
    fireEvent.click(screen.getByRole("button", { name: "Find room" }));
    expect(window.location.pathname).toBe("/join/ABC234");
  });
});
