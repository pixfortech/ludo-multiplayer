// Single source of truth for types shared between the client and the server.
// Authored as a .d.ts (declaration-only, no runtime code) so both packages can
// import it from outside their own rootDir without build issues. The client
// re-exports it via client/src/types.ts; the server via server/src/game/gameTypes.ts,
// so the two can never drift out of sync.

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export type TokenState = "base" | "active" | "home";

export interface Token {
  id: number;          // 0-3
  color: PlayerColor;
  state: TokenState;
  position: number;    // -1 = base, 0-57 = track + home column, 58 = home
}

export interface Player {
  id: string;          // socket id
  color: PlayerColor;
  tokens: Token[];
  connected: boolean;
}

export type GamePhase = "waiting" | "playing" | "finished";

export interface GameState {
  roomId: string;
  maxPlayers: number;
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  diceValue: number | null;
  diceRolled: boolean;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  turnCount: number;
}

// Client → Server events
export interface ClientToServerEvents {
  createRoom: (maxPlayers: number) => void;
  joinRoom: (roomId: string) => void;
  startGame: () => void;
  rollDice: () => void;
  moveToken: (tokenId: number) => void;
  leaveRoom: () => void;
  requestState: () => void;
}

// Server → Client events
export interface ServerToClientEvents {
  roomCreated: (roomId: string) => void;
  roomJoined: (payload: { roomId: string; color: PlayerColor }) => void;
  gameStateUpdate: (state: GameState) => void;
  playerJoined: (player: { id: string; color: PlayerColor }) => void;
  playerLeft: (playerId: string) => void;
  error: (message: string) => void;
  gameOver: (winner: PlayerColor) => void;
}
