import { describe, it, expect, vi } from "vitest";
import {
  createInitialState,
  rollDice,
  moveToken,
  startGame,
  removePlayer,
} from "../game/gameEngine.js";
import type { GameState } from "../game/gameTypes.js";

const P1 = "player1";
const P2 = "player2";

function freshState(): GameState {
  const state = createInitialState(
    "room1",
    [
      { id: P1, color: "red" },
      { id: P2, color: "blue" },
    ],
    2
  );
  return startGame(state);
}

function withDice(state: GameState, value: number): GameState {
  return { ...state, diceValue: value, diceRolled: true, consecutiveSixes: value === 6 ? 1 : 0 };
}

function cloneWithTokens(state: GameState): GameState {
  return { ...state, players: state.players.map((p) => ({ ...p, tokens: p.tokens.map((t) => ({ ...t })) })) };
}

describe("Token leaving base", () => {
  it("cannot leave base without rolling 6", () => {
    const state = withDice(freshState(), 3);
    const after = moveToken(state, P1, 0);
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
    const after = rollDice(state, P2); // P2 is not the current player
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

describe("Move authority", () => {
  it("rejects a player trying to move during another player's turn", () => {
    const state = withDice(freshState(), 6); // index 0 → P1's turn
    const after = moveToken(state, P2, 0); // P2 attempts to act out of turn
    expect(after).toStrictEqual(state); // engine ignores it entirely
  });

  it("rejects moving a token id that does not exist", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 99);
    expect(after).toStrictEqual(state);
  });

  it("allows the current player to move their own token", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("active");
  });
});

describe("Six rules", () => {
  it("rolling 6 grants an extra turn (diceRolled resets, turn stays)", () => {
    const state = withDice(freshState(), 6);
    const after = moveToken(state, P1, 0);
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.diceRolled).toBe(false);
  });

  it("three consecutive sixes forfeits the turn", () => {
    vi.spyOn(Math, "random").mockReturnValue((6 - 1) / 6); // force roll = 6
    const state: GameState = { ...freshState(), consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(state, P1);
    expect(after.currentPlayerIndex).toBe(1); // turn advances to P2
    vi.restoreAllMocks();
  });
});

describe("Capture rules", () => {
  it("captures opponent token on a non-safe cell", () => {
    const state = cloneWithTokens(freshState());
    // Red at local step 1; moving +2 lands on absolute 3 (not safe).
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 1 };
    // Blue positioned so its absolute cell is 3: (13 + step) % 52 = 3 → step 42.
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 42 };
    const setup: GameState = { ...state, diceValue: 2, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[1].tokens[0].state).toBe("base");
    expect(after.players[1].tokens[0].position).toBe(-1);
  });

  it("does not capture on a safe cell", () => {
    const state = cloneWithTokens(freshState());
    // Red at local 6; moving +2 lands on absolute 8 (a safe star cell).
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 6 };
    // Blue at absolute 8: (13 + step) % 52 = 8 → step 47.
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 47 };
    const setup: GameState = { ...state, diceValue: 2, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[1].tokens[0].state).toBe("active");
  });
});

describe("Home entry", () => {
  it("requires exact dice to enter home — overshoot is rejected", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 56 };
    const setup: GameState = { ...state, diceValue: 3, diceRolled: true }; // needs 2, rolled 3
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].position).toBe(56);
    expect(after.players[0].tokens[0].state).toBe("active");
  });

  it("token reaches home with exact dice", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 56 };
    const setup: GameState = { ...state, diceValue: 2, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
  });
});

describe("Win condition", () => {
  it("player wins when all 4 tokens reach home", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens = [
      { id: 0, color: "red", state: "active", position: 57 },
      { id: 1, color: "red", state: "home", position: 58 },
      { id: 2, color: "red", state: "home", position: 58 },
      { id: 3, color: "red", state: "home", position: 58 },
    ];
    const setup: GameState = { ...state, diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("red");
  });
});

describe("Player removal / disconnect safety", () => {
  function fourPlayers(): GameState {
    return startGame(
      createInitialState(
        "r",
        [
          { id: "A", color: "red" },
          { id: "B", color: "blue" },
          { id: "C", color: "green" },
          { id: "D", color: "yellow" },
        ],
        4
      )
    );
  }

  it("shifts currentPlayerIndex left when an earlier player leaves", () => {
    const state = { ...fourPlayers(), currentPlayerIndex: 2 }; // C's turn
    const after = removePlayer(state, "A");
    expect(after.players.map((p) => p.id)).toEqual(["B", "C", "D"]);
    expect(after.players[after.currentPlayerIndex].id).toBe("C"); // still C's turn
  });

  it("passes the turn to the next player when the current player leaves", () => {
    const state = { ...fourPlayers(), currentPlayerIndex: 1, diceValue: 6, diceRolled: true };
    const after = removePlayer(state, "B"); // B was current
    expect(after.players[after.currentPlayerIndex].id).toBe("C");
    expect(after.diceRolled).toBe(false); // turn state reset
    expect(after.diceValue).toBeNull();
  });

  it("wraps to the first player when the last player leaves on their turn", () => {
    const state = { ...fourPlayers(), currentPlayerIndex: 3 }; // D's turn
    const after = removePlayer(state, "D");
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.players[after.currentPlayerIndex].id).toBe("A");
  });

  it("never lets currentPlayerIndex point outside the players array", () => {
    const state = { ...fourPlayers(), currentPlayerIndex: 3 };
    const after = removePlayer(state, "A");
    expect(after.currentPlayerIndex).toBeGreaterThanOrEqual(0);
    expect(after.currentPlayerIndex).toBeLessThan(after.players.length);
  });

  it("does not crash rollDice/moveToken after a removal", () => {
    const state = { ...fourPlayers(), currentPlayerIndex: 3 };
    const after = removePlayer(state, "A");
    const currentId = after.players[after.currentPlayerIndex].id;
    expect(() => rollDice(after, currentId)).not.toThrow();
    expect(() => moveToken(after, currentId, 0)).not.toThrow();
  });

  it("ends the game safely (walkover) when fewer than two players remain", () => {
    const state = startGame(
      createInitialState(
        "r",
        [
          { id: "A", color: "red" },
          { id: "B", color: "blue" },
        ],
        2
      )
    );
    const after = removePlayer(state, "B");
    expect(after.players).toHaveLength(1);
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("red");
  });
});
