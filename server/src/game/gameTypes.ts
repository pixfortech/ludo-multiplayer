export type PlayerColor = "red" | "blue" | "green" | "yellow";

export type TokenState = "base" | "active" | "home";

export interface Token {
  id: number;          // 0-3
  color: PlayerColor;
  state: TokenState;
  position: number;    // -1 = base, 0-55 = main track, 56-61 = home column, 62 = home
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
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  diceValue: number | null;
  diceRolled: boolean;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  turnCount: number;
}

export interface Room {
  id: string;
  hostId: string;
  maxPlayers: number;
  gameState: GameState;
}

// Client → Server events
export interface ClientToServerEvents {
  createRoom: (maxPlayers: number) => void;
  joinRoom: (roomId: string) => void;
  startGame: () => void;
  rollDice: () => void;
  moveToken: (tokenId: number) => void;
  leaveRoom: () => void;
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

export interface MoveResult {
  valid: boolean;
  reason?: string;
  capturedToken?: { color: PlayerColor; tokenId: number };
  reachedHome?: boolean;
}
