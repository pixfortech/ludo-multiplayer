import { describe, it, expect } from "vitest";
import {
  createInitialState,
  rollDice,
  moveToken,
  startGame,
  removePlayer,
} from "../game/gameEngine.js";
import { rollD6, isValidDie } from "../game/dice.js";
import { getMovableTokens, canTokenMove } from "../game/moveValidator.js";
import type { GameState, Token } from "../game/gameTypes.js";

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
    const state = freshState();
    const after = rollDice(state, P1, 6);
    expect(after.diceRolled).toBe(true);
    expect(after.diceValue).toBe(6);
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
    const state: GameState = { ...freshState(), consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(state, P1, 6);
    expect(after.currentPlayerIndex).toBe(1); // turn advances to P2
  });
});

describe("Post-six turn flow (regression: turn must pass after a non-six move)", () => {
  it("six → move → same player rolls again → one → auto-moved → turn passes to Blue", () => {
    let s = freshState();

    // 1. Red rolls a 6 — all 4 base tokens movable, player picks token 0.
    s = rollDice(s, P1, 6);
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.diceValue).toBe(6);
    expect(s.consecutiveSixes).toBe(1);

    // 2. Red moves token 0 out of base; 3. Red retains the turn for the bonus roll.
    s = moveToken(s, P1, 0);
    expect(s.players[0].tokens[0].state).toBe("active");
    expect(s.currentPlayerIndex).toBe(0); // still Red
    expect(s.diceRolled).toBe(false);
    expect(s.diceValue).toBeNull();

    // 4. Red rolls a 1 — only token 0 is active (tokens 1–3 still in base → need 6).
    //    Exactly ONE legal token → auto-move fires immediately, turn passes.
    s = rollDice(s, P1, 1);
    expect(s.currentPlayerIndex).toBe(1);  // Blue
    expect(s.diceRolled).toBe(false);
    expect(s.diceValue).toBeNull();
    expect(s.consecutiveSixes).toBe(0);
    expect(s.lastAction).toMatch(/Blue.*turn/i); // auto-move message names next player
  });

  it("six → move → six again → move keeps the turn with Red (under the three-six cap)", () => {
    let s = freshState();

    s = rollDice(s, P1, 6);
    s = moveToken(s, P1, 0); // token 0 out of base
    expect(s.currentPlayerIndex).toBe(0);

    s = rollDice(s, P1, 6);
    expect(s.consecutiveSixes).toBe(2);
    s = moveToken(s, P1, 1); // bring a second token out on the second six
    expect(s.currentPlayerIndex).toBe(0); // Red still holds the turn
    expect(s.diceRolled).toBe(false);
    expect(s.consecutiveSixes).toBe(2);   // streak preserved until a move-less roll
  });

  it("three consecutive sixes still forfeits even mid-sequence", () => {
    let s = freshState();

    s = rollDice(s, P1, 6);
    s = moveToken(s, P1, 0);
    s = rollDice(s, P1, 6);
    s = moveToken(s, P1, 1);
    expect(s.consecutiveSixes).toBe(2);

    s = rollDice(s, P1, 6); // third six
    expect(s.currentPlayerIndex).toBe(1); // forfeited to Blue
    expect(s.consecutiveSixes).toBe(0);
    expect(s.lastAction).toMatch(/forfeit/i);
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

describe("Legal token list", () => {
  function makeToken(overrides: Partial<Token>): Token {
    return { id: 0, color: "red", state: "active", position: 0, ...overrides };
  }

  it("base token is NOT movable without a 6", () => {
    const t = makeToken({ state: "base", position: -1 });
    expect(canTokenMove(t, 3)).toBe(false);
  });

  it("base token IS movable with a 6", () => {
    const t = makeToken({ state: "base", position: -1 });
    expect(canTokenMove(t, 6)).toBe(true);
  });

  it("active token is not movable if it would overshoot home (pos 56 + dice 3 > 58)", () => {
    const t = makeToken({ position: 56 });
    expect(canTokenMove(t, 3)).toBe(false);
  });

  it("active token IS movable for exact home entry (pos 56 + dice 2 = 58)", () => {
    const t = makeToken({ position: 56 });
    expect(canTokenMove(t, 2)).toBe(true);
  });

  it("home token is never movable", () => {
    const t = makeToken({ state: "home", position: 58 });
    expect(canTokenMove(t, 6)).toBe(false);
  });

  it("getMovableTokens returns only the movable subset", () => {
    const state = cloneWithTokens(freshState());
    // token 0 in base, token 1 active mid-track, token 2 near home, token 3 at home
    state.players[0].tokens[0] = { id: 0, color: "red", state: "base", position: -1 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "active", position: 57 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const movable = getMovableTokens(state.players[0], 1);
    // dice=1: base→not movable, pos10+1=11≤58✓, pos57+1=58✓, home→not movable
    expect(movable.map((t) => t.id)).toEqual([1, 2]);
  });

  it("turn passes automatically when no legal moves exist after roll", () => {
    const state = cloneWithTokens(freshState()); // all tokens in base, dice=1 → no moves
    const after = rollDice(state, P1, 1);
    expect(after.currentPlayerIndex).toBe(1); // auto-advanced to P2
    expect(after.diceRolled).toBe(false);
  });
});

describe("Typed error behaviour", () => {
  it("rollDice returns unchanged state for wrong player", () => {
    const state = freshState();
    expect(rollDice(state, P2)).toStrictEqual(state);
  });

  it("rollDice returns unchanged state when dice already rolled", () => {
    const state = withDice(freshState(), 3);
    expect(rollDice(state, P1)).toStrictEqual(state);
  });

  it("rollDice returns unchanged state when phase is not playing", () => {
    const state: GameState = { ...freshState(), phase: "finished" };
    expect(rollDice(state, P1)).toStrictEqual(state);
  });

  it("moveToken returns unchanged state when dice not rolled", () => {
    const state: GameState = { ...freshState(), diceRolled: false, diceValue: null };
    expect(moveToken(state, P1, 0)).toStrictEqual(state);
  });

  it("moveToken returns unchanged state for a non-existent tokenId", () => {
    const state = withDice(freshState(), 6);
    expect(moveToken(state, P1, 99)).toStrictEqual(state);
  });

  it("moveToken returns unchanged state when wrong player acts", () => {
    const state = withDice(freshState(), 6);
    expect(moveToken(state, P2, 0)).toStrictEqual(state);
  });
});

describe("Capture — extra turn", () => {
  it("capture on a non-6 roll keeps the current player's turn", () => {
    // Red at local 1, dice 3 → lands on local 4, abs (0+4)%52=4 (not safe).
    // Blue at local 43: abs (13+43)%52=56%52=4 → same cell → capture.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 1 };
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 43 };
    const setup: GameState = { ...state, diceValue: 3, diceRolled: true };
    const after = moveToken(setup, P1, 0);

    expect(after.players[1].tokens[0].state).toBe("base");  // Blue returned to base
    expect(after.players[1].tokens[0].position).toBe(-1);
    expect(after.currentPlayerIndex).toBe(0);               // Red keeps the turn
    expect(after.diceRolled).toBe(false);                    // ready to roll again
    expect(after.diceValue).toBeNull();
    expect(after.lastAction).toMatch(/captured/i);
    expect(after.lastAction).toMatch(/roll again/i);
  });

  it("capture on a 6 also keeps the turn (both conditions true)", () => {
    // Red at local 0, dice 6 → local 6, abs 6 (not safe).
    // Blue at local 45: abs (13+45)%52=58%52=6 → capture.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 0 };
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 45 };
    const setup: GameState = { ...state, diceValue: 6, diceRolled: true, consecutiveSixes: 1 };
    const after = moveToken(setup, P1, 0);

    expect(after.players[1].tokens[0].state).toBe("base");
    expect(after.currentPlayerIndex).toBe(0);   // Red keeps turn
    expect(after.diceRolled).toBe(false);
  });

  it("non-capture non-6 move passes the turn", () => {
    // Red at local 0, dice 3 → abs 3, no Blue active tokens nearby.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 0 };
    const setup: GameState = { ...state, diceValue: 3, diceRolled: true };
    const after = moveToken(setup, P1, 0);

    expect(after.currentPlayerIndex).toBe(1);  // turn passes to Blue
    expect(after.diceRolled).toBe(false);
  });
});

describe("Home lane traversal and home counter", () => {
  function atPos(state: GameState, playerIdx: number, pos: number): GameState {
    const s = cloneWithTokens(state);
    s.players[playerIdx].tokens[0] = { ...s.players[playerIdx].tokens[0], state: "active", position: pos };
    return s;
  }

  it("token at position 51 with dice 1 enters the home lane (position 52, still active)", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 51), diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].position).toBe(52);
    expect(after.players[0].tokens[0].state).toBe("active");
  });

  it("token at position 57 with dice 1 reaches final home (position 58, state home)", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 57), diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
  });

  it("token at position 52 with dice 6 reaches final home (52+6=58, exact)", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 52), diceValue: 6, diceRolled: true, consecutiveSixes: 1 };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
  });

  it("token at position 53 with dice 6 is blocked — overshoot rejected (53+6=59>58)", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 53), diceValue: 6, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].position).toBe(53); // unchanged
  });

  it("home counter is 1 after one token reaches position 58", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 57), diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    const homeCount = after.players[0].tokens.filter((t) => t.state === "home").length;
    expect(homeCount).toBe(1);
  });

  it("home counter is 0 while token is still in the home lane (position 56)", () => {
    const setup: GameState = { ...atPos(freshState(), 0, 55), diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].position).toBe(56);
    const homeCount = after.players[0].tokens.filter((t) => t.state === "home").length;
    expect(homeCount).toBe(0);
  });

  it("non-6 home entry keeps the turn (home bonus) — manual", () => {
    // Two legal tokens: one enters home on this roll, others still on track.
    // Verifies that reaching home grants an extra turn even with a non-6 dice.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 57 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 5 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "base", position: -1 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "base", position: -1 };
    const setup: GameState = { ...state, diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0); // token 0: 57+1=58 → home
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
    expect(after.currentPlayerIndex).toBe(0); // same player keeps turn
    expect(after.diceRolled).toBe(false);     // ready to roll again
    expect(after.diceValue).toBeNull();
    expect(after.lastAction).toMatch(/sent a token home.*roll again/i);
  });

  it("mid-lane token (home lane, not final) does NOT give home bonus", () => {
    // Token at 55, dice 1 → pos 56 (home lane, not pos 58) → no home bonus.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 55 };
    const setup: GameState = { ...state, diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P1, 0);
    expect(after.players[0].tokens[0].position).toBe(56);
    expect(after.players[0].tokens[0].state).toBe("active"); // still active in home lane
    expect(after.currentPlayerIndex).toBe(1); // turn passes (no home bonus for mid-lane)
  });

  it("home bonus does not fire on the winning move (game-over overrides)", () => {
    // All 4 tokens home → game ends, phase=finished, no extra turn.
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
    expect(after.lastAction).toMatch(/wins/i);
  });

  // Colour-specific home lane entry: each colour uses the same position arithmetic
  // (backend is colour-agnostic for lane traversal), but we test all four explicitly.
  it("blue token enters home lane at position 52", () => {
    const s = startGame(createInitialState("r", [{ id: P1, color: "red" }, { id: P2, color: "blue" }], 2));
    const setup: GameState = {
      ...atPos(s, 1, 51),
      currentPlayerIndex: 1,
      diceValue: 1,
      diceRolled: true,
    };
    const after = moveToken(setup, P2, 0);
    expect(after.players[1].tokens[0].position).toBe(52);
    expect(after.players[1].tokens[0].state).toBe("active");
  });

  it("green token enters home lane at position 52", () => {
    const P3 = "player3";
    const s = startGame(createInitialState("r", [
      { id: P1, color: "red" }, { id: P2, color: "blue" }, { id: P3, color: "green" },
    ], 3));
    const setup: GameState = {
      ...atPos(s, 2, 51),
      currentPlayerIndex: 2,
      diceValue: 1,
      diceRolled: true,
    };
    const after = moveToken(setup, P3, 0);
    expect(after.players[2].tokens[0].position).toBe(52);
    expect(after.players[2].tokens[0].state).toBe("active");
  });

  it("yellow token enters home lane at position 52", () => {
    const P3 = "player3";
    const P4 = "player4";
    const s = startGame(createInitialState("r", [
      { id: P1, color: "red" }, { id: P2, color: "blue" },
      { id: P3, color: "green" }, { id: P4, color: "yellow" },
    ], 4));
    const setup: GameState = {
      ...atPos(s, 3, 51),
      currentPlayerIndex: 3,
      diceValue: 1,
      diceRolled: true,
    };
    const after = moveToken(setup, P4, 0);
    expect(after.players[3].tokens[0].position).toBe(52);
    expect(after.players[3].tokens[0].state).toBe("active");
  });

  it("no capture is possible inside the home lane (position 52–57 is off shared track)", () => {
    // Blue has a token at absolute position matching green's home lane step — but
    // green is past HOME_COLUMN_START so checkCapture returns undefined.
    const P3 = "player3";
    const s = startGame(createInitialState("r", [
      { id: P1, color: "red" }, { id: P2, color: "blue" }, { id: P3, color: "green" },
    ], 3));
    const state = cloneWithTokens(s);
    state.players[2].tokens[0] = { id: 0, color: "green", state: "active", position: 53 };
    // Blue nearby on shared track — must not be captured by green's home lane move.
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 5 };
    const setup: GameState = { ...state, currentPlayerIndex: 2, diceValue: 1, diceRolled: true };
    const after = moveToken(setup, P3, 0);
    expect(after.players[1].tokens[0].state).toBe("active"); // Blue not captured
    expect(after.players[2].tokens[0].position).toBe(54);
  });
});

describe("Last roll display state (lastRollValue / lastRollBy)", () => {
  it("a fresh game has no roll recorded (blank die)", () => {
    const s = freshState();
    expect(s.lastRollValue).toBeNull();
    expect(s.lastRollBy).toBeNull();
  });

  it("sets lastRollValue and lastRollBy after a normal roll", () => {
    // Two active tokens → multiple legal moves → no auto-move → diceValue is retained.
    const s = cloneWithTokens(freshState());
    s.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    s.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    const after = rollDice(s, P1, 3);
    expect(after.diceValue).toBe(3);
    expect(after.lastRollValue).toBe(3);
    expect(after.lastRollBy).toBe("red");
  });

  it("keeps lastRollValue but clears diceValue after a no-legal-move auto-pass", () => {
    // All tokens in base + roll 1 → no legal move → auto-pass.
    const after = rollDice(freshState(), P1, 1);
    expect(after.diceValue).toBeNull();       // actionable dice cleared
    expect(after.lastRollValue).toBe(1);      // rolled number preserved for display
    expect(after.lastRollBy).toBe("red");
    expect(after.currentPlayerIndex).toBe(1); // turn advanced to Blue
    expect(after.diceRolled).toBe(false);     // next player can roll
  });

  it("lets the next player roll after an auto-pass, overwriting lastRollValue", () => {
    const passed = rollDice(freshState(), P1, 2); // Red auto-passes
    expect(passed.currentPlayerIndex).toBe(1);
    expect(passed.lastRollValue).toBe(2);
    const blueRolls = rollDice(passed, P2, 6);    // Blue can roll
    expect(blueRolls.diceValue).toBe(6);
    expect(blueRolls.lastRollValue).toBe(6);
    expect(blueRolls.lastRollBy).toBe("blue");
  });

  it("rolling a 6 sets both diceValue and lastRollValue to 6", () => {
    const after = rollDice(freshState(), P1, 6); // base tokens movable with a 6
    expect(after.diceValue).toBe(6);
    expect(after.lastRollValue).toBe(6);
    expect(after.lastRollBy).toBe("red");
  });

  it("after moving on a 6, diceValue resets but lastRollValue stays 6 and the turn is kept", () => {
    const rolled = rollDice(freshState(), P1, 6);
    const moved = moveToken(rolled, P1, 0); // bring a token out of base
    expect(moved.currentPlayerIndex).toBe(0); // Red keeps the turn
    expect(moved.diceRolled).toBe(false);     // can roll again
    expect(moved.diceValue).toBeNull();       // no actionable dice until re-roll
    expect(moved.lastRollValue).toBe(6);      // last roll still visible
    expect(moved.lastRollBy).toBe("red");
  });

  it("lastRollValue persists into the next player's turn after a non-6 move", () => {
    const s = cloneWithTokens(freshState());
    s.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    const rolled = rollDice(s, P1, 3);
    const moved = moveToken(rolled, P1, 0); // non-6, no capture → turn passes
    expect(moved.currentPlayerIndex).toBe(1);
    expect(moved.diceValue).toBeNull();
    expect(moved.lastRollValue).toBe(3); // Blue sees Red's last roll until Blue rolls
    expect(moved.lastRollBy).toBe("red");
  });

  it("a three-six forfeit still records the rolled value for display", () => {
    const s: GameState = { ...freshState(), consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(s, P1, 6); // third 6 → forfeit
    expect(after.currentPlayerIndex).toBe(1);
    expect(after.diceValue).toBeNull();
    expect(after.lastRollValue).toBe(6);
    expect(after.lastRollBy).toBe("red");
  });
});

describe("Auto-move: single legal token", () => {
  it("auto-opens a base token when a 6 is rolled and only base tokens exist", () => {
    // All tokens in base; rolling 6 → exactly one legal move per token (any of 4 base tokens).
    // With 4 base tokens movable on a 6, this is NOT a single-legal-move case.
    // Instead set up 3 tokens at home, 1 in base → only 1 token is movable.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "base", position: -1 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const after = rollDice(state, P1, 6);
    // Token 0 should have been auto-moved out of base.
    expect(after.players[0].tokens[0].state).toBe("active");
    expect(after.players[0].tokens[0].position).toBe(0);
    // Rolling a 6 → extra turn (diceRolled reset, same player).
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.diceRolled).toBe(false);
    expect(after.diceValue).toBeNull();
    expect(after.lastAction).toMatch(/auto-opened/i);
  });

  it("auto-moves a track token when only one can move (non-6)", () => {
    // One active token at pos 5, others in base (need 6) or home. Dice=3 → only token 0 moves.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "base", position: -1 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const after = rollDice(state, P1, 3);
    expect(after.players[0].tokens[0].position).toBe(8); // 5 + 3
    expect(after.currentPlayerIndex).toBe(1); // non-6, no capture → turn passes
    expect(after.diceRolled).toBe(false);
    expect(after.lastAction).toMatch(/auto-moved/i);
    expect(after.lastAction).toMatch(/3/);
  });

  it("auto-move capture on a non-6 keeps the turn", () => {
    // Red token 0 at pos 1, token 1..3 at home. Dice 3 → token 0 moves to pos 4 (abs 4).
    // Blue at local 43: abs (13+43)%52=4 → capture.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 1 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 43 };
    const after = rollDice(state, P1, 3);
    expect(after.players[1].tokens[0].state).toBe("base"); // Blue captured
    expect(after.currentPlayerIndex).toBe(0);              // Red keeps turn
    expect(after.diceRolled).toBe(false);
    expect(after.lastAction).toMatch(/auto-captured/i);
    expect(after.lastAction).toMatch(/roll again/i);
  });

  it("auto-move into home grants home bonus turn (same player rolls again)", () => {
    // Token 3 stays in base so NOT all 4 tokens reach home → no win, home bonus applies.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 57 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "base", position: -1 };
    const after = rollDice(state, P1, 1);
    expect(after.players[0].tokens[0].state).toBe("home");
    expect(after.players[0].tokens[0].position).toBe(58);
    expect(after.currentPlayerIndex).toBe(0); // home bonus: same player rolls again
    expect(after.diceRolled).toBe(false);
    expect(after.diceValue).toBeNull();
    expect(after.lastAction).toMatch(/auto-moved.*home.*roll again/i);
  });

  it("does NOT auto-move when multiple tokens are legal (player must choose)", () => {
    // Two active tokens both movable with dice 3.
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const after = rollDice(state, P1, 3);
    // diceValue stays set (player must pick), tokens unchanged.
    expect(after.diceValue).toBe(3);
    expect(after.diceRolled).toBe(true);
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.players[0].tokens[0].position).toBe(5); // unchanged
    expect(after.players[0].tokens[1].position).toBe(10); // unchanged
  });

  it("no legal moves (auto-pass) is unchanged by the auto-move feature", () => {
    // All tokens in base, dice 1 → no moves → auto-pass as before.
    const after = rollDice(freshState(), P1, 1);
    expect(after.currentPlayerIndex).toBe(1);
    expect(after.diceValue).toBeNull();
    expect(after.diceRolled).toBe(false);
    expect(after.lastAction).toMatch(/no legal moves/i);
  });

  it("three-six forfeit overrides auto-move even if one token is legal", () => {
    const state = cloneWithTokens(freshState());
    // One active token movable on a 6.
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const s: GameState = { ...state, consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(s, P1, 6);
    expect(after.currentPlayerIndex).toBe(1); // forfeited to Blue
    expect(after.consecutiveSixes).toBe(0);
    expect(after.lastAction).toMatch(/forfeit/i);
    // Token must NOT have moved.
    expect(after.players[0].tokens[0].position).toBe(5);
  });
});

describe("Auto-move metadata fields", () => {
  it("auto-move sets lastMoveWasAuto and lastAutoMoveType correctly for a track move", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "base", position: -1 };
    const after = rollDice(state, P1, 3);
    expect(after.lastMoveWasAuto).toBe(true);
    expect(after.lastAutoMoveType).toBe("move");
    expect(after.lastAutoMovedTokenId).toBe(0);
    expect(after.lastAutoMoveFrom).toBe(5);
    expect(after.lastAutoMoveTo).toBe(8); // 5 + 3
  });

  it("auto-open sets lastAutoMoveType to 'open'", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "base", position: -1 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "home", position: 58 };
    state.players[0].tokens[2] = { id: 2, color: "red", state: "home", position: 58 };
    state.players[0].tokens[3] = { id: 3, color: "red", state: "home", position: 58 };
    const after = rollDice(state, P1, 6);
    expect(after.lastMoveWasAuto).toBe(true);
    expect(after.lastAutoMoveType).toBe("open");
    expect(after.lastAutoMoveFrom).toBe(-1); // was in base
    expect(after.lastAutoMoveTo).toBe(0);    // entered track
  });

  it("manual move clears lastMoveWasAuto", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    state.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    const rolled = rollDice(state, P1, 3); // >1 legal tokens, no auto-move
    const after = moveToken(rolled, P1, 0);
    expect(after.lastMoveWasAuto).toBe(false);
    expect(after.lastAutoMoveType).toBeNull();
    expect(after.lastAutoMovedTokenId).toBeNull();
  });

  it("forfeit clears auto-move metadata", () => {
    const state = cloneWithTokens(freshState());
    state.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    const s: GameState = { ...state, consecutiveSixes: 2, diceRolled: false };
    const after = rollDice(s, P1, 6);
    expect(after.lastMoveWasAuto).toBe(false);
    expect(after.lastAutoMoveType).toBeNull();
  });
});

describe("dice module", () => {
  it("rollD6 always returns an integer in [1, 6]", () => {
    for (let i = 0; i < 200; i++) {
      const v = rollD6();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("rollD6 is not stuck on a single value (regression: 'always 1')", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(rollD6());
    // 300 fair rolls hitting only one face is astronomically unlikely; this
    // specifically guards against the RNG collapsing to a constant.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("isValidDie accepts integers 1–6 and rejects everything else", () => {
    for (const v of [1, 2, 3, 4, 5, 6]) expect(isValidDie(v)).toBe(true);
    for (const v of [0, 7, -1, 1.5, NaN, Infinity]) expect(isValidDie(v)).toBe(false);
  });
});

describe("rollDice forced value (test-only override)", () => {
  it("forced value 6 is used exactly", () => {
    const after = rollDice(freshState(), P1, 6);
    expect(after.diceValue).toBe(6);
  });

  it("forced value 1 is used exactly", () => {
    // Two tokens on the track → multiple legal moves, no auto-move → diceValue is retained.
    const s = cloneWithTokens(freshState());
    s.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    s.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    const after = rollDice(s, P1, 1);
    expect(after.diceValue).toBe(1);
    expect(after.lastRollValue).toBe(1);
  });

  it("invalid forced values are ignored and fall back to a real 1–6 roll", () => {
    // Two active tokens → multiple legal moves → diceValue stays set (no auto-move).
    const base = cloneWithTokens(freshState());
    base.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
    base.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
    for (const bad of [0, 7, -3, 2.5, NaN]) {
      const after = rollDice(base, P1, bad as number);
      expect(after.diceValue).not.toBeNull();
      expect(after.diceValue!).toBeGreaterThanOrEqual(1);
      expect(after.diceValue!).toBeLessThanOrEqual(6);
    }
  });

  it("default runtime path (no forced value) yields mixed 1–6, never stuck on one", () => {
    // Two active tokens → multiple legal moves → diceValue always set (no auto-move consumed).
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const s = cloneWithTokens(freshState());
      s.players[0].tokens[0] = { id: 0, color: "red", state: "active", position: 5 };
      s.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 10 };
      const after = rollDice(s, P1); // no forced value → crypto die
      // lastRollValue is always set regardless of auto-move or not.
      expect(after.lastRollValue).not.toBeNull();
      expect(after.lastRollValue!).toBeGreaterThanOrEqual(1);
      expect(after.lastRollValue!).toBeLessThanOrEqual(6);
      seen.add(after.lastRollValue!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
