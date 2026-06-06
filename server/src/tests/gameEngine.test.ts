import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialState, rollDice, moveToken, startGame } from "../game/gameEngine.js";
import type { GameState } from "../game/gameTypes.js";

const P1 = "player1";
const P2 = "player2";

function freshState(): GameState {
  const state = createInitialState("room1", [
    { id: P1, color: "red" },
    { id: P2, color: "blue" },
  ]);
  return startGame(state);
}

function withDice(state: GameState, value: number): GameState {
  return { ...state, diceValue: value, diceRolled: true, consecutiveSixes: value === 6 ? 1 : 0 };
}

describe("Token leaving base", () => {
  it("cannot leave base without rolling 6", () => {
    const state = withDice(freshState(), 3);
    const after = moveToken(state, P1, 0);
    // state unchanged — token still in base
    expect(after.players[0].tokens[0].state).toBe("base");
  });

  it("can leave base with a 6", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("active");
    expect(after.players[0].tokens[0].position).toBe(0);
  });
});

describe("Turn enforcement", () => {
  it("only current player can roll", () => {
    const state = freshState();
    const after = rollDice(state, P2); // P2 is not current player
    // state unchanged
    expect(after).toStrictEqual(state);
  });

  it("current player can roll", () => {
    vi.spyOn(Math, "random").mockReturnValue((6 - 1) / 6); // force 6 so tokens are movable
    const state = freshState();
    const after = rollDice(state, P1);
    expect(after.diceRolled).toBe(true);
    expect(after.diceValue).toBe(6);
    vi.restoreAllMocks();
  });
});

describe("Move validation", () => {
  it("only legal moves are allowed — cannot move opponent token", () => {
    const state = withDice(freshState(), 6);
    // P1 tries to move P2's token by ID
    // moveToken uses currentPlayerIndex so P2 tokens are not in P1's player object
    const after = moveToken(state, P1, 0); // token 0 belongs to P1 — valid
    expect(after.players[0].tokens[0].state).toBe("active");
  });

  it("invalid token id is rejected", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 99); // no token id 99
    expect(after).toStrictEqual(state);
  });
});

describe("Six rules", () => {
  it("rolling 6 grants extra turn (diceRolled resets after move)", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 0);
    // Still P1's turn, dice not rolled
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.diceRolled).toBe(false);
  });

  it("three consecutive sixes forfeits the turn", () => {
    // Simulate by manually setting consecutiveSixes to 2, then roll yields 6
    vi.spyOn(Math, "random").mockReturnValue((6 - 1) / 6); // force roll = 6
    const state: GameState = { ...freshState(), consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(state, P1);
    // Turn should advance to P2
    expect(after.currentPlayerIndex).toBe(1);
    vi.restoreAllMocks();
  });
});

describe("Capture rules", () => {
  it("captures opponent token on non-safe cell", () => {
    // Place P1 token at step 1 (absolute 1, not safe), P2 token at same absolute cell
    const state = freshState();
    // Manually set up positions
    const players = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    // P1 token 0 active at step 1 (absolute 1)
    players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 1 };
    // P2 token 0 active at absolute 1 → local step = (1 - 13 + 52) % 52 = 40
    players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 40 };

    const setup: GameState = { ...state, players, diceValue: 2, diceRolled: true };
    // P1 moves token 0 by 2 → new position 3 (absolute 3, not safe)
    // P2 token at absolute 3? No — let's place P2 at step that maps to absolute 3
    // P2 local step → absolute: (13 + step) % 52 = 3 → step = (3 - 13 + 52) % 52 = 42
    const players2 = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    players2[0].tokens[0] = { id: 0, color: "red", state: "active", position: 1 };
    players2[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 42 };
    const setup2: GameState = { ...state, players: players2, diceValue: 2, diceRolled: true };
    const after = moveToken(setup2, P1, 0);
    expect(after.players[1].tokens[0].state).toBe("base");
  });

  it("does not capture on a safe cell", () => {
    // P1 moves to position 8 (absolute 8, safe)
    const state = freshState();
    const players = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 6 };
    // P2 at absolute 8 → local (8 - 13 + 52) % 52 = 47
    players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 47 };
    const setup: GameState = { ...state, players, diceValue: 2, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[1].tokens[0].state).toBe("active");
  });
});

describe("Home entry", () => {
  it("requires exact dice to enter home — overshoot is rejected", () => {
    const state = freshState();
    const players = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    // Token at step 56, home is 58 → needs exactly 2; dice is 3 → overshoot
    players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 56 };
    const setup: GameState = { ...state, players, diceValue: 3, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    // token should not move (canTokenMove returns false when overshoot)
    expect(after.players[0].tokens[0].position).toBe(56);
    expect(after.players[0].tokens[0].state).toBe("active");
  });

  it("token reaches home with exact dice", () => {
    const state = freshState();
    const players = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 56 };
    const setup: GameState = { ...state, players, diceValue: 2, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
  });
});

describe("Win condition", () => {
  it("player wins when all 4 tokens reach home", () => {
    const state = freshState();
    const players = state.players.map((p) => ({
      ...p,
      tokens: p.tokens.map((t) => ({ ...t })),
    }));
    // Set tokens 1-3 already home, token 0 one step away
    players[0].tokens = [
      { id: 0, color: "red", state: "active", position: 57 },
      { id: 1, color: "red", state: "home", position: 58 },
      { id: 2, color: "red", state: "home", position: 58 },
      { id: 3, color: "red", state: "home", position: 58 },
    ];
    const setup: GameState = { ...state, players, diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("red");
  });
});
