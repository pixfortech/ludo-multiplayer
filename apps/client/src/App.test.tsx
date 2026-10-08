import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "./App";

afterEach(cleanup);

describe("App shell", () => {
  it("renders the title and one entry per supported player count", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Ludo" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.getByText("pentadecagon")).toBeTruthy();
  });
});
