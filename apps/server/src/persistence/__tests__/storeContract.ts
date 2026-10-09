// Behaviour every GameStore must have. Run against PostgreSQL and memory.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGame, getMovableTokens, moveToken, rollDice, type GameState } from "@ludo/game-engine";
import { DEFAULT_RULE_OPTIONS, type RoomSettings } from "@ludo/shared-types";
import { issueCredential, verifyCredential } from "../../auth-lite/credentials.js";
import { generateRoomCode } from "../../rooms/roomCode.js";
import { StoreError, type GameStore, type NewPlayer, type NewRoom } from "../types.js";

export const SETTINGS: RoomSettings = {
  maxPlayers: 4,
  autoMove: true,
  rankingMode: "winner-only",
  visibility: "private",
  turnTimerSeconds: 0,
  rules: DEFAULT_RULE_OPTIONS,
};

export const newRoom = (overrides: Partial<NewRoom> = {}): NewRoom => ({
  id: randomUUID(),
  name: "Friday Ludo",
  maxPlayers: 4,
  visibility: "private",
  settings: SETTINGS,
  ...overrides,
});

export const newPlayer = (seat: number, colour: string, name = `Player ${seat + 1}`): NewPlayer & { secret: string } => {
  const credential = issueCredential();
  return { id: randomUUID(), displayName: name, seat, colour, credentialHash: credential.hash, secret: credential.secret };
};

export async function expectStoreError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected StoreError ${code}`).toBeInstanceOf(StoreError);
  expect((error as StoreError).code).toBe(code);
}

/** A room with host + one guest, ready to start a 2-player engine game. */
export async function seededRoom(store: GameStore) {
  const host = newPlayer(0, "crimson", "Asha");
  const { room } = await store.createRoom(newRoom(), host, generateRoomCode);
  const guest = newPlayer(2, "emerald", "Ben");
  const added = await store.addPlayer(room.id, room.roomVersion, guest);
  const state = createGame({ players: [{ id: host.id, seat: 0 }, { id: guest.id, seat: 2 }] });
  return { room: added.room, host, guest, state };
}

/** Applies a legal engine action from `state` (roll, or the first legal move). */
export function advance(state: GameState, dice = 6): GameState {
  const player = state.players[state.currentPlayerIndex]!.id;
  const result =
    state.turn.phase === "awaiting-roll"
      ? rollDice(state, player, dice)
      : moveToken(state, player, getMovableTokens(state, player, state.turn.dice!)[0]!.tokenId);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

export function runGameStoreContract(name: string, setup: () => Promise<{ store: GameStore; teardown: () => Promise<void> } | null>): void {
  describe(`GameStore contract: ${name}`, () => {
    let store: GameStore;
    let teardown: () => Promise<void> = async () => {};

    beforeAll(async () => {
      const ready = await setup();
      if (!ready) throw new Error("store unavailable");
      ({ store, teardown } = ready);
    });
    afterAll(async () => teardown());

    describe("rooms", () => {
      it("creates a room and its host atomically", async () => {
        const host = newPlayer(0, "crimson");
        const { room, host: hostRecord } = await store.createRoom(newRoom(), host, generateRoomCode);
        expect(room).toMatchObject({ status: "lobby", roomVersion: 0, hostPlayerId: host.id, maxPlayers: 4, visibility: "private", settings: SETTINGS });
        expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        expect(hostRecord).toMatchObject({ id: host.id, roomId: room.id, seat: 0, colour: "crimson", connectionStatus: "disconnected", credentialVersion: 1 });
        expect(await store.getRoomByCode(room.code)).toMatchObject({ id: room.id });
        expect(await store.getRoom(room.id)).toMatchObject({ code: room.code });
      });

      it("returns null for unknown rooms and players", async () => {
        expect(await store.getRoom(randomUUID())).toBeNull();
        expect(await store.getRoomByCode("ZZZZZZ")).toBeNull();
        expect(await store.getPlayer(randomUUID())).toBeNull();
      });

      it("retries on a room-code collision and gives up after repeated collisions", async () => {
        const first = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        let calls = 0;
        const collideOnce = () => (calls++ === 0 ? first.room.code : generateRoomCode());
        const second = await store.createRoom(newRoom(), newPlayer(0, "crimson"), collideOnce);
        expect(second.room.code).not.toBe(first.room.code);
        await expectStoreError(store.createRoom(newRoom(), newPlayer(0, "crimson"), () => first.room.code), "room-code-exhausted");
      });

      it("updates settings and status with optimistic version checks", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        const updated = await store.updateRoom(room.id, 0, { settings: { ...SETTINGS, autoMove: false }, name: "Renamed" });
        expect(updated).toMatchObject({ roomVersion: 1, name: "Renamed", settings: { autoMove: false } });
        await expectStoreError(store.updateRoom(room.id, 0, { status: "paused" }), "version-conflict");
        await expectStoreError(store.updateRoom(randomUUID(), 0, { status: "paused" }), "not-found");
      });
    });

    describe("players", () => {
      it("adds players, bumping the room version", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        const { room: after, player } = await store.addPlayer(room.id, 0, newPlayer(1, "royal-blue"));
        expect(after.roomVersion).toBe(1);
        expect(player).toMatchObject({ seat: 1, colour: "royal-blue", kind: "remote" });
        expect((await store.listPlayers(room.id)).map((p) => p.seat)).toEqual([0, 1]);
      });

      it("rejects stale versions, taken seats, taken colours and full rooms", async () => {
        const { room } = await store.createRoom(newRoom({ maxPlayers: 2, settings: { ...SETTINGS, maxPlayers: 2 } }), newPlayer(0, "crimson"), generateRoomCode);
        await expectStoreError(store.addPlayer(room.id, 5, newPlayer(1, "royal-blue")), "version-conflict");
        await expectStoreError(store.addPlayer(room.id, 0, newPlayer(0, "royal-blue")), "seat-taken");
        await expectStoreError(store.addPlayer(room.id, 0, newPlayer(1, "crimson")), "colour-taken");
        await store.addPlayer(room.id, 0, newPlayer(1, "royal-blue"));
        await expectStoreError(store.addPlayer(room.id, 1, newPlayer(2, "emerald")), "room-full");
        expect(await store.listPlayers(room.id)).toHaveLength(2);
      });

      it("frees a seat and colour when a player leaves, keeping them in the full list", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        const guest = newPlayer(1, "royal-blue");
        await store.addPlayer(room.id, 0, guest);
        const afterLeave = await store.markPlayerLeft(room.id, 1, guest.id);
        expect(afterLeave.roomVersion).toBe(2);
        expect(await store.getPlayer(guest.id)).toMatchObject({ connectionStatus: "left" });
        await store.addPlayer(room.id, 2, newPlayer(1, "royal-blue"));
        expect(await store.listPlayers(room.id)).toHaveLength(2);
        expect(await store.listPlayers(room.id, { includeLeft: true })).toHaveLength(3);
        await expectStoreError(store.markPlayerLeft(room.id, 3, guest.id), "not-found");
      });

      it("reassigns the host only to an active member", async () => {
        const host = newPlayer(0, "crimson");
        const { room } = await store.createRoom(newRoom(), host, generateRoomCode);
        const guest = newPlayer(1, "royal-blue");
        await store.addPlayer(room.id, 0, guest);
        expect((await store.updateRoom(room.id, 1, { hostPlayerId: guest.id })).hostPlayerId).toBe(guest.id);
        await expectStoreError(store.updateRoom(room.id, 2, { hostPlayerId: randomUUID() }), "not-found");
        await store.markPlayerLeft(room.id, 2, host.id);
        await expectStoreError(store.updateRoom(room.id, 3, { hostPlayerId: host.id }), "not-found");
      });

      it("records presence without bumping the room version", async () => {
        const host = newPlayer(0, "crimson");
        const { room } = await store.createRoom(newRoom(), host, generateRoomCode);
        const seen = new Date("2026-01-02T03:04:05Z");
        await store.setConnectionStatus(host.id, "connected", seen);
        expect(await store.getPlayer(host.id)).toMatchObject({ connectionStatus: "connected", lastSeenAt: seen });
        expect((await store.getRoom(room.id))!.roomVersion).toBe(0);
      });
    });

    describe("credentials", () => {
      it("stores only a digest that verifies the secret", async () => {
        const host = newPlayer(0, "crimson");
        await store.createRoom(newRoom(), host, generateRoomCode);
        const credential = await store.getCredential(host.id);
        expect(credential!.hash).toHaveLength(32);
        expect(credential!.hash.toString("base64url")).not.toBe(host.secret);
        expect(verifyCredential(host.secret, credential!.hash)).toBe(true);
        expect(verifyCredential("not-the-secret", credential!.hash)).toBe(false);
      });

      it("rotates and revokes credentials", async () => {
        const host = newPlayer(0, "crimson");
        await store.createRoom(newRoom(), host, generateRoomCode);
        await store.revokeCredential(host.id);
        expect((await store.getCredential(host.id))!.revokedAt).toBeInstanceOf(Date);
        const next = issueCredential();
        expect(await store.rotateCredential(host.id, next.hash)).toBe(2);
        const rotated = await store.getCredential(host.id);
        expect(rotated).toMatchObject({ version: 2, revokedAt: null });
        expect(verifyCredential(next.secret, rotated!.hash)).toBe(true);
        expect(verifyCredential(host.secret, rotated!.hash)).toBe(false);
        await expectStoreError(store.rotateCredential(randomUUID(), next.hash), "not-found");
      });
    });

    describe("game sessions", () => {
      it("starts a game atomically: session, first event, room playing", async () => {
        const { room, host, state } = await seededRoom(store);
        const started = await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: "start-1", payload: {} });
        expect(started.room).toMatchObject({ status: "playing", roomVersion: room.roomVersion + 1 });
        expect(started.event).toMatchObject({ seq: 1, actionType: "game:start", resultStateVersion: 0 });
        const loaded = await store.getGameSession(room.id);
        expect(loaded!.state).toEqual(state);
        expect(loaded!.stateVersion).toBe(0);
        await expectStoreError(
          store.startGame(room.id, started.room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} }),
          "game-already-started",
        );
      });

      it("refuses to store an invalid engine state", async () => {
        const { room, host, state } = await seededRoom(store);
        const broken = { ...state, currentPlayerIndex: 7 };
        await expectStoreError(store.startGame(room.id, room.roomVersion, broken, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} }), "invalid-state");
        expect(await store.getGameSession(room.id)).toBeNull();
      });

      it("commits actions with increasing versions and ordered events", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        let current = state;
        for (let i = 1; i <= 3; i++) {
          const next = advance(current, i === 1 ? 6 : 3);
          const { session, event } = await store.commitGameAction({
            roomId: room.id,
            expectedStateVersion: current.stateVersion,
            state: next,
            event: { playerId: current.players[current.currentPlayerIndex]!.id, actionType: "game:roll", requestId: `r${i}`, payload: { i } },
          });
          expect(session.stateVersion).toBe(next.stateVersion);
          expect(event).toMatchObject({ seq: i + 1, resultStateVersion: next.stateVersion, payload: { i } });
          current = next;
        }
        expect((await store.getGameSession(room.id))!.state).toEqual(current);
        expect((await store.listEvents(room.id)).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
      });

      it("rejects a stale version without writing anything", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        const next = advance(state);
        await store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: next, event: { playerId: host.id, actionType: "game:roll", requestId: "a", payload: {} } });
        const competing = advance(state, 2); // computed from the old state
        await expectStoreError(
          store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: competing, event: { playerId: host.id, actionType: "game:roll", requestId: "b", payload: {} } }),
          "version-conflict",
        );
        expect((await store.getGameSession(room.id))!.state).toEqual(next);
        expect(await store.listEvents(room.id)).toHaveLength(2);
      });

      it("rejects a repeated request id for the same player (idempotency) but not for another player", async () => {
        const { room, host, guest, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        const s1 = advance(state, 3); // host rolls 3: auto-pass to guest
        await store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: s1, event: { playerId: host.id, actionType: "game:roll", requestId: "same", payload: {} } });
        await expectStoreError(
          store.commitGameAction({ roomId: room.id, expectedStateVersion: 1, state: advance(s1, 2), event: { playerId: host.id, actionType: "game:roll", requestId: "same", payload: {} } }),
          "duplicate-request",
        );
        expect((await store.getGameSession(room.id))!.stateVersion).toBe(1);
        const s2 = advance(s1, 2);
        await store.commitGameAction({ roomId: room.id, expectedStateVersion: 1, state: s2, event: { playerId: guest.id, actionType: "game:roll", requestId: "same", payload: {} } });
        expect(await store.findEventByRequest(room.id, host.id, "same")).toMatchObject({ seq: 2 });
        expect(await store.findEventByRequest(room.id, guest.id, "same")).toMatchObject({ seq: 3 });
        expect(await store.findEventByRequest(room.id, guest.id, "missing")).toBeNull();
      });

      it("rejects non-increasing versions and invalid states", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        await expectStoreError(store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state, event: { playerId: host.id, actionType: "x", requestId: null, payload: {} } }), "invalid-state");
        const bad = { ...advance(state), winnerId: "nobody" };
        await expectStoreError(store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: bad, event: { playerId: host.id, actionType: "x", requestId: null, payload: {} } }), "invalid-state");
        await expectStoreError(
          store.commitGameAction({ roomId: randomUUID(), expectedStateVersion: 0, state: advance(state), event: { playerId: null, actionType: "x", requestId: null, payload: {} } }),
          "not-found",
        );
      });

      it("can change the room status in the same commit", async () => {
        const { room, host, state } = await seededRoom(store);
        const { room: started } = await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        await store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: advance(state), event: { playerId: host.id, actionType: "game:roll", requestId: null, payload: {} }, roomStatus: "finished" });
        expect(await store.getRoom(room.id)).toMatchObject({ status: "finished", roomVersion: started.roomVersion + 1 });
      });

      it("pages through events", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        let current = state;
        for (let i = 0; i < 6; i++) {
          const next = advance(current, 3);
          await store.commitGameAction({ roomId: room.id, expectedStateVersion: current.stateVersion, state: next, event: { playerId: null, actionType: "game:roll", requestId: null, payload: { i } } });
          current = next;
        }
        expect((await store.listEvents(room.id, { limit: 3 })).map((e) => e.seq)).toEqual([1, 2, 3]);
        expect((await store.listEvents(room.id, { afterSeq: 3, limit: 3 })).map((e) => e.seq)).toEqual([4, 5, 6]);
        expect((await store.listEvents(room.id, { afterSeq: 6 })).map((e) => e.seq)).toEqual([7]);
        expect(await store.listEvents(room.id, { afterSeq: 7 })).toEqual([]);
      });
    });

    describe("concurrency", () => {
      it("lets exactly one of several simultaneous commits on the same version succeed", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        const attempts = [1, 2, 3, 4, 5].map((dice, i) =>
          store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: advance(state, dice), event: { playerId: host.id, actionType: "game:roll", requestId: `c${i}`, payload: { dice } } }),
        );
        const results = await Promise.allSettled(attempts);
        const succeeded = results.filter((r) => r.status === "fulfilled");
        const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(succeeded).toHaveLength(1);
        expect(failed.map((f) => (f.reason as StoreError).code)).toEqual(Array(4).fill("version-conflict"));
        expect(await store.listEvents(room.id)).toHaveLength(2);
      });

      it("treats simultaneous copies of one request as one action", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        const next = advance(state);
        const copies = await Promise.allSettled(
          [0, 1, 2].map(() =>
            store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: next, event: { playerId: host.id, actionType: "game:roll", requestId: "dup", payload: {} } }),
          ),
        );
        expect(copies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of copies) if (r.status === "rejected") expect((r.reason as StoreError).code).toBe("duplicate-request");
        expect(await store.listEvents(room.id)).toHaveLength(2);
      });

      it("serialises simultaneous joins: no seat or colour is double-booked", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        const joins = await Promise.allSettled([1, 2, 3].map((seat) => store.addPlayer(room.id, 0, newPlayer(seat, "royal-blue"))));
        expect(joins.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await store.listPlayers(room.id)).toHaveLength(2);
      });
    });

    describe("room lifecycle guarantees (2B)", () => {
      it("keeps active display names unique, ignoring ASCII case, and frees a name on leave", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson", "Aman"), generateRoomCode);
        await expectStoreError(store.addPlayer(room.id, 0, newPlayer(1, "royal-blue", "aMAN")), "name-taken");
        const guest = newPlayer(1, "royal-blue", "Ben");
        await store.addPlayer(room.id, 0, guest);
        await store.markPlayerLeft(room.id, 1, guest.id);
        await store.addPlayer(room.id, 2, newPlayer(2, "emerald", "ben"));
      });

      it("only allows status changes along the lifecycle", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        await expectStoreError(store.updateRoom(room.id, 0, { status: "paused" }), "invalid-transition");
        await expectStoreError(store.updateRoom(room.id, 0, { status: "archived" }), "invalid-transition");
        expect(await store.getRoom(room.id)).toMatchObject({ status: "lobby", roomVersion: 0 });
        const abandoned = await store.updateRoom(room.id, 0, { status: "abandoned" });
        expect(abandoned).toMatchObject({ status: "abandoned", archivedAt: null });
        const archived = await store.updateRoom(room.id, 1, { status: "archived" });
        expect(archived.status).toBe("archived");
        expect(archived.archivedAt).toBeInstanceOf(Date);
        await expectStoreError(store.updateRoom(room.id, 2, { status: "lobby" }), "invalid-transition");
      });

      it("rejects an invalid status change in a game commit without committing anything", async () => {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        await expectStoreError(
          store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: advance(state), event: { playerId: host.id, actionType: "game:roll", requestId: "r", payload: {} }, roomStatus: "archived" }),
          "invalid-transition",
        );
        expect((await store.getGameSession(room.id))!.stateVersion).toBe(0);
        expect(await store.listEvents(room.id)).toHaveLength(1);
      });

      it("only adds players in the lobby", async () => {
        const { room, host, state } = await seededRoom(store);
        const { room: started } = await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        await expectStoreError(store.addPlayer(room.id, started.roomVersion, newPlayer(1, "royal-blue")), "game-already-started");
      });

      it("never shrinks capacity below the active members", async () => {
        const { room } = await store.createRoom(newRoom(), newPlayer(0, "crimson"), generateRoomCode);
        await store.addPlayer(room.id, 0, newPlayer(1, "royal-blue"));
        await store.addPlayer(room.id, 1, newPlayer(2, "emerald"));
        await expectStoreError(store.updateRoom(room.id, 2, { maxPlayers: 2, settings: { ...SETTINGS, maxPlayers: 2 } }), "capacity-conflict");
        expect(await store.updateRoom(room.id, 2, { maxPlayers: 3, settings: { ...SETTINGS, maxPlayers: 3 } })).toMatchObject({ maxPlayers: 3, roomVersion: 3 });
      });

      it("hands over the host in the same step as the host leaving, or not at all", async () => {
        const host = newPlayer(0, "crimson");
        const { room } = await store.createRoom(newRoom(), host, generateRoomCode);
        const guest = newPlayer(1, "royal-blue");
        await store.addPlayer(room.id, 0, guest);
        // The leaving player cannot be named the new host: nothing changes.
        await expectStoreError(store.markPlayerLeft(room.id, 1, host.id, { hostPlayerId: host.id }), "not-found");
        expect(await store.getPlayer(host.id)).toMatchObject({ leftAt: null });
        expect((await store.getRoom(room.id))!.roomVersion).toBe(1);
        const after = await store.markPlayerLeft(room.id, 1, host.id, { hostPlayerId: guest.id });
        expect(after).toMatchObject({ hostPlayerId: guest.id, roomVersion: 2 });
        // The last member leaving can abandon the room in the same step.
        expect(await store.markPlayerLeft(room.id, 2, guest.id, { status: "abandoned" })).toMatchObject({ status: "abandoned", roomVersion: 3 });
      });
    });
  });
}
