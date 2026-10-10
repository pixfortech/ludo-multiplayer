// React access to the game connection and the browser's saved seats.

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { ActionData, GameActionView, MembershipData, PlayerSessionCredential, ResumeData, RoomPreview, RoomStateData } from "@ludo/shared-types";
import type { ConnectionState, CreateRoomInput, JoinRoomInput, Notice } from "../lib/connection";
import type { SeatStore, TabSeat } from "../lib/session";

/** What the UI needs from a connection (GameConnection implements it; tests provide fakes). */
export interface GameClient {
  getState(): ConnectionState;
  subscribe(listener: () => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
  createRoom(input: CreateRoomInput): Promise<MembershipData>;
  previewRoom(code: string): Promise<RoomPreview>;
  joinRoom(input: JoinRoomInput): Promise<MembershipData>;
  resume(credential: PlayerSessionCredential, options?: { takeover?: boolean }): Promise<ResumeData>;
  startGame(): Promise<RoomStateData>;
  rollDice(): Promise<ActionData>;
  moveToken(tokenId: number): Promise<ActionData>;
  resumeGame(): Promise<void>;
  fullHistory(): Promise<GameActionView[]>;
  leaveRoom(): Promise<void>;
}

export interface GameServices {
  client: GameClient;
  seats: SeatStore;
  tab: TabSeat;
}

const GameContext = createContext<GameServices | null>(null);

export function GameProvider({ services, children }: { services: GameServices; children: ReactNode }) {
  return <GameContext.Provider value={services}>{children}</GameContext.Provider>;
}

export function useGame(): GameServices {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGame outside GameProvider");
  return value;
}

export function useConnectionState(): ConnectionState {
  const { client } = useGame();
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}
