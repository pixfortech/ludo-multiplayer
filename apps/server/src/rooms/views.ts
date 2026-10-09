// Public shapes built from store records. These are allow-lists: a field is
// only exposed if it is copied here, so credential digests, versions and
// other internal columns can never leak by accident.

import { colourById, coloursForRoom, type RoomPlayerView, type RoomPreview, type RoomView } from "@ludo/shared-types";
import type { PlayerRecord, RoomRecord } from "../persistence/types.js";
import { canStart, deriveLifecycle, joinBlockReason } from "./lifecycle.js";

const colourName = (id: string) => colourById(id)?.name ?? id;

export function toPlayerView(room: RoomRecord, p: PlayerRecord): RoomPlayerView {
  return {
    playerId: p.id,
    displayName: p.displayName,
    seat: p.seat,
    colour: p.colour,
    colourName: colourName(p.colour),
    isHost: p.id === room.hostPlayerId,
    connectionStatus: p.connectionStatus,
    joinedAt: p.joinedAt.toISOString(),
  };
}

/** Full room state for members. `players` must be the active members. */
export function toRoomView(room: RoomRecord, players: readonly PlayerRecord[]): RoomView {
  return {
    roomId: room.id,
    code: room.code,
    name: room.name,
    status: room.status,
    lifecycle: deriveLifecycle(room.status, players.length),
    hostPlayerId: room.hostPlayerId,
    maxPlayers: room.maxPlayers,
    settings: structuredClone(room.settings),
    roomVersion: room.roomVersion,
    players: [...players].sort((a, b) => a.seat - b.seat).map((p) => toPlayerView(room, p)),
    canStart: canStart(room.status, players.length),
    pause:
      room.status === "paused" && room.pauseReason && room.pausedAt
        ? { reason: room.pauseReason, playerId: room.pausedPlayerId, since: room.pausedAt.toISOString() }
        : null,
    endedReason: room.endedReason,
  };
}

/**
 * What anyone holding the code may see. Display names are shown (people
 * choose them knowing their room-mates will see them); ids, versions and
 * timestamps are not.
 */
export function toRoomPreview(room: RoomRecord, players: readonly PlayerRecord[]): RoomPreview {
  const blocked = joinBlockReason(room.status, players.length, room.maxPlayers);
  const holder = new Map(players.map((p) => [p.colour, p]));
  const colours = coloursForRoom(room.maxPlayers).map((c, seat) => ({
    colour: c.id,
    colourName: c.name,
    seat,
    taken: holder.has(c.id),
    takenBy: holder.get(c.id)?.displayName ?? null,
  }));
  return {
    code: room.code,
    name: room.name,
    status: room.status,
    lifecycle: deriveLifecycle(room.status, players.length),
    maxPlayers: room.maxPlayers,
    joinedCount: players.length,
    colours,
    availableColours: blocked ? [] : colours.filter((c) => !c.taken).map((c) => c.colour),
    occupiedSeats: players.map((p) => p.seat).sort((a, b) => a - b),
    hostName: players.find((p) => p.id === room.hostPlayerId)?.displayName ?? null,
    joinable: blocked === null,
    blockedReason: blocked,
  };
}
