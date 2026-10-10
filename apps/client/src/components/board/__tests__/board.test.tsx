import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CITY_THEMES, CLASSIC_BOARD_MATERIAL, boardMaterial2d } from "@ludo/city-themes";
import { BOARD_SURFACES, PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { SEPARATOR, WHITE } from "../surfaceShared";
import { ClassicBoard } from "../ClassicBoard";

const identityOf = (id: string) => PLAYER_IDENTITIES[id === "a" ? 0 : 2]!;
const tokens = [
  { playerId: "a", seat: 0, tokenId: 0, step: 4 },
  { playerId: "a", seat: 0, tokenId: 1, step: null },
  { playerId: "a", seat: 0, tokenId: 2, step: 53 },
  { playerId: "a", seat: 0, tokenId: 3, step: 56 },
  { playerId: "b", seat: 2, tokenId: 0, step: null },
  { playerId: "b", seat: 2, tokenId: 1, step: null },
  { playerId: "b", seat: 2, tokenId: 2, step: null },
  { playerId: "b", seat: 2, tokenId: 3, step: null },
];

function board(props: Partial<Parameters<typeof ClassicBoard>[0]> = {}) {
  return render(<ClassicBoard tokens={tokens} identityOf={identityOf} activeSeats={[0, 2]} currentSeat={0} youSeat={0} title="Board" {...props} />);
}

describe("classic board", () => {
  it("draws the full classic layout: 52 track cells, 4 starts, 4 stars, 4 lanes, bases and the finish", () => {
    const { container } = board();
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(52);
    expect(container.querySelectorAll("[data-start]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-safe]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-lane]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-seat]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-finish]")).toHaveLength(1);
    expect(container.querySelector('[data-cell="r6c1"]')?.getAttribute("data-start")).toBe("0");
  });

  it("draws every token, with the finished one in its finished state", () => {
    board();
    for (const t of tokens) expect(screen.getByTestId(`token-${t.playerId}:${t.tokenId}`)).toBeTruthy();
    expect(screen.getByTestId("token-a:3").getAttribute("data-state")).toBe("finished");
  });

  it("highlights the current player's base and labels yours", () => {
    const { container } = board();
    expect(container.querySelector('[data-seat="0"]')?.getAttribute("data-active")).toBe("true");
    expect(container.querySelector('[data-seat="2"]')?.getAttribute("data-active")).toBeNull();
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("makes only the tokens it is told are movable into buttons, and reports the pick", () => {
    const onActivate = vi.fn();
    board({ states: { "a:0": "movable", "a:1": "unmovable" }, badges: { "a:0": 1 }, labels: { "a:0": "Move token 1" }, onActivate });
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Move token 1");
    expect(screen.getByTestId("token-a:1").getAttribute("data-state")).toBe("unmovable");
    fireEvent.click(buttons[0]!);
    fireEvent.keyDown(buttons[0]!, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenCalledWith("a:0");
  });

  it("is not interactive without a handler, even for movable tokens", () => {
    board({ states: { "a:0": "movable" } });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("previews a server-provided move: its path and destination", () => {
    board({ preview: { seat: 0, from: 4, to: 9, slot: 0 } });
    expect(screen.getByTestId("move-preview")).toBeTruthy();
    expect(screen.getByTestId("move-destination")).toBeTruthy();
  });

  it("keeps the classic table's approved surfaces by default", () => {
    expect(CLASSIC_BOARD_MATERIAL).toMatchObject({ body: WHITE, cell: BOARD_SURFACES.cell, separator: SEPARATOR, safeMark: BOARD_SURFACES.safeMark });
    const { container } = board();
    const cell = container.querySelector('[data-cell="r6c2"] rect')!;
    expect(cell.getAttribute("fill")).toBe(BOARD_SURFACES.cell);
    expect(container.querySelector("[data-safe]")!.getAttribute("fill")).toBe(BOARD_SURFACES.safeMark);
  });

  it("dresses only the neutral surfaces for a city: the same cells, lanes, starts, stars and tokens", () => {
    const classicRoot = board().container;
    const classic = classicRoot.innerHTML;
    const material = boardMaterial2d(CITY_THEMES.kolkata);
    const { container } = render(<ClassicBoard tokens={tokens} identityOf={identityOf} activeSeats={[0, 2]} currentSeat={0} youSeat={0} title="Board" material={material} />);
    // Geometry and seat colours are identical: only the neutral fills differ.
    const neutral = (html: string) => html.replaceAll(/fill="#[0-9A-Fa-f]{6}"|stroke="#[0-9A-Fa-f]{6}"/g, "").replaceAll(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "id");
    expect(neutral(container.innerHTML)).toBe(neutral(classic));
    expect(container.querySelector('[data-cell="r6c2"] rect')!.getAttribute("fill")).toBe(material.cell);
    expect(container.querySelector('[data-cell="r6c1"] rect')!.getAttribute("fill")).toBe(PLAYER_IDENTITIES[0]!.body);
    expect(container.querySelector("[data-safe]")!.getAttribute("fill")).toBe(material.safeMark);
    const laneFills = (root: Element) => [...root.querySelectorAll("[data-lane] rect")].map((r) => r.getAttribute("fill"));
    expect(laneFills(container)).toEqual(laneFills(classicRoot));
  });
});

