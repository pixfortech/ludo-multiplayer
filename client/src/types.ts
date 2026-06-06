export type PlayerColor = "red" | "blue" | "green" | "yellow";
export type TokenState = "base" | "active" | "home";
export type GamePhase = "waiting" | "playing" | "finished";

export interface Token {
  id: number;
  color: PlayerColor;
  state: TokenState;
  position: number;
}

export interface Player {
  id: string;
  color: PlayerColor;
  tokens: Token[];
  connected: boolean;
}

export interface GameState {
  roomId: string;
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  diceValue: number | null;
  diceRolled: boolean;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  turnCount: number;
}
