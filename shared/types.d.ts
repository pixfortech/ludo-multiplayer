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
  id: string;          // stable player id (persisted client-side); survives reconnect
  name: string;        // display name, sanitised server-side (1–16 chars, fallback "Player")
  color: PlayerColor;
  tokens: Token[];
  connected: boolean;
}

export type GamePhase = "waiting" | "playing" | "finished";

export interface GameState {
  roomId: string;
  hostId: string;
  maxPlayers: number;
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  diceValue: number | null;
  diceRolled: boolean;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  turnCount: number;
  lastAction: string | null; // human-readable description of the most recent action
}

// Optional personalisation sent when creating or joining a room. All fields are
// optional for backward compatibility; clients that send a persisted playerId
// gain reconnect/resume support, and name/preferredColor drive personalisation.
export interface JoinOptions {
  playerId?: string;
  name?: string;
  preferredColor?: PlayerColor;
}

// Lightweight, read-only snapshot used to preview a room before joining.
// Exposes only what the join form needs — never tokens or internal ids.
export interface RoomPreviewPlayer {
  name: string;
  color: PlayerColor;
  connected: boolean;
}

export interface RoomPreview {
  roomId: string;
  maxPlayers: number;
  phase: GamePhase;
  players: RoomPreviewPlayer[];
  availableColors: PlayerColor[];
}

// Client → Server events.
export interface ClientToServerEvents {
  createRoom: (maxPlayers: number, opts?: JoinOptions) => void;
  joinRoom: (roomId: string, opts?: JoinOptions) => void;
  getRoomInfo: (roomId: string) => void;
  resume: (roomId: string, playerId: string) => void;
  startGame: () => void;
  rollDice: () => void;
  moveToken: (tokenId: number) => void;
  leaveRoom: () => void;
  requestState: () => void;
}

// Server → Client events
export interface ServerToClientEvents {
  roomCreated: (roomId: string) => void;
  // `reassigned` is true when the preferred colour was taken and the server
  // assigned the next available colour instead.
  roomJoined: (payload: { roomId: string; color: PlayerColor; name: string; reassigned: boolean }) => void;
  // Response to getRoomInfo; preview is null when the room does not exist.
  roomInfo: (payload: { roomId: string; preview: RoomPreview | null }) => void;
  gameStateUpdate: (state: GameState) => void;
  playerJoined: (player: { id: string; color: PlayerColor; name: string }) => void;
  playerLeft: (playerId: string) => void;
  error: (message: string) => void;
  gameOver: (winner: PlayerColor) => void;
}
