// Room service behaviour, run against PostgreSQL (the real guarantee) and the
// memory store (parity). Every test creates its own rooms.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomView } from "@ludo/shared-types";
import { hashCredential } from "../../auth-lite/credentials.js";
import type { GameStore } from "../../persistence/types.js";
import { RoomError, type RoomErrorCode } from "../errors.js";
import { CodeLookupGuard, SlidingWindowLimiter } from "../rateLimiter.js";
import { generateRoomCode } from "../roomCode.js";
import { RoomService, type AuthenticatedPlayer, type MembershipResult, type RoomServiceOptions } from "../roomService.js";

export const ctx = { clientKey: "test-client" };

/** Limits high enough that only the dedicated tests hit them. */
export function serviceFor(store: GameStore, options: Partial<RoomServiceOptions> = {}): RoomService {
  return new RoomService({
    store,
    lookupGuard: new CodeLookupGuard({ lookups: { limit: 1e6, windowMs: 1000 }, misses: { limit: 1e6, windowMs: 1000 } }),
    creationLimiter: new SlidingWindowLimiter({ limit: 1e6, windowMs: 1000 }),
    ...options,
  });
}

export async function expectRoomError(promise: Promise<unknown>, code: RoomErrorCode): Promise<RoomError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected RoomError ${code}`).toBeInstanceOf(RoomError);
  expect((error as RoomError).code).toBe(code);
  return error as RoomError;
}

export const outcomes = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) => (r.status === "fulfilled" ? "ok" : r.reason instanceof RoomError ? r.reason.code : `unexpected: ${String(r.reason)}`)).sort();

export function runRoomServiceSuite(name: string, setup: () => Promise<{ store: GameStore; teardown: () => Promise<void> }>): void {
  describe(`RoomService on ${name}`, () => {
    let store: GameStore;
    let teardown: () => Promise<void> = async () => {};
    let rooms: RoomService;

    beforeAll(async () => {
      ({ store, teardown } = await setup());
      rooms = serviceFor(store);
    });
    afterAll(async () => teardown());

    const create = (input: Record<string, unknown> = {}) => rooms.createRoom({ hostName: "Aman", maxPlayers: 4, ...input }, ctx);
    const join = (code: string, displayName: string, input: Record<string, unknown> = {}) => rooms.joinRoom({ code, displayName, ...input }, ctx);
    const signIn = (m: MembershipResult) => rooms.authenticate(m.credential);

    /** Host plus `guests` auto-seated guests. */
    async function roomWith(guests: string[], input: Record<string, unknown> = {}) {
      const host = await create(input);
      const members = [host];
      for (const g of guests) members.push(await join(host.room.code, g));
      const actors = await Promise.all(members.map(signIn));
      return { code: host.room.code, roomId: host.room.roomId, members, actors };
    }

    describe("create", () => {
      it("creates a private lobby with the host seated, persisted, and a one-time credential", async () => {
        const result = await create({ roomName: "Friday Ludo" });
        expect(result.room).toMatchObject({
          name: "Friday Ludo",
          status: "lobby",
          lifecycle: "waiting",
          maxPlayers: 4,
          roomVersion: 0,
          canStart: false,
          hostPlayerId: result.player.playerId,
          settings: { maxPlayers: 4, autoMove: true, rankingMode: "winner-only", visibility: "private", turnTimerSeconds: 0 },
        });
        expect(result.room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        expect(result.player).toMatchObject({ displayName: "Aman", seat: 0, colour: "crimson", colourName: "Crimson", isHost: true });
        expect(result.credential.playerId).toBe(result.player.playerId);
        expect(result.credential.secret).toMatch(/^[\w-]{43}$/);

        const stored = await store.getRoom(result.room.roomId);
        expect(stored).toMatchObject({ code: result.room.code, status: "lobby", hostPlayerId: result.player.playerId, maxPlayers: 4 });
        const credential = await store.getCredential(result.player.playerId);
        expect(credential!.hash.equals(hashCredential(result.credential.secret))).toBe(true);
        expect(credential!.hash.toString("utf8")).not.toContain(result.credential.secret);
      });

      it("supports 2, 3 and 4 players and the approved options", async () => {
        for (const maxPlayers of [2, 3, 4]) expect((await create({ maxPlayers })).room.maxPlayers).toBe(maxPlayers);
        const custom = await create({ autoMove: false, rankingMode: "full-ranking", rules: { blocksEnabled: false } });
        expect(custom.room.settings).toMatchObject({ autoMove: false, rankingMode: "full-ranking" });
      });

      it("honours the host's preferred colour", async () => {
        const result = await create({ colour: "emerald" });
        expect(result.player).toMatchObject({ seat: 2, colour: "emerald" });
      });

      it("refuses 5–15 players (not playable yet) and invalid counts", async () => {
        for (let maxPlayers = 5; maxPlayers <= 15; maxPlayers++) await expectRoomError(create({ maxPlayers }), "unsupported-player-count");
        for (const maxPlayers of [1, 16, 3.5, "4"]) await expectRoomError(create({ maxPlayers }), "invalid-player-count");
      });

      it("refuses invalid settings and names before touching storage", async () => {
        let codesDrawn = 0;
        const counting = serviceFor(store, { generateCode: () => (codesDrawn++, generateRoomCode()) });
        const attempt = (input: Record<string, unknown>) => counting.createRoom({ hostName: "Aman", maxPlayers: 4, ...input }, ctx);
        await expectRoomError(attempt({ autoMove: "yes" }), "invalid-settings");
        await expectRoomError(attempt({ visibility: "public" }), "unsupported-setting");
        await expectRoomError(attempt({ turnTimerSeconds: 30 }), "unsupported-setting");
        await expectRoomError(attempt({ rules: { blocksEnabled: true } }), "unsupported-rule");
        await expectRoomError(attempt({ hostName: "  " }), "invalid-display-name");
        await expectRoomError(attempt({ hostName: "x".repeat(25) }), "invalid-display-name");
        await expectRoomError(attempt({ roomName: "x".repeat(41) }), "invalid-room-name");
        await expectRoomError(attempt({ colour: "graphite" }), "invalid-colour");
        await expectRoomError(attempt({ colour: "pink" }), "invalid-colour");
        await expectRoomError(attempt({ isAdmin: true }), "invalid-request");
        await expectRoomError(counting.createRoom("not an object", ctx), "invalid-request");
        expect(codesDrawn).toBe(0);
      });

      it("gives every room a unique code and survives code collisions", async () => {
        const codes = new Set<string>();
        for (let i = 0; i < 25; i++) codes.add((await create()).room.code);
        expect(codes.size).toBe(25);

        const taken = [...codes][0]!;
        let calls = 0;
        const colliding = serviceFor(store, { generateCode: () => (calls++ === 0 ? taken : generateRoomCode()) });
        const result = await colliding.createRoom({ hostName: "Aman", maxPlayers: 2 }, ctx);
        expect(result.room.code).not.toBe(taken);
        expect(calls).toBe(2);

        const stuck = serviceFor(store, { generateCode: () => taken });
        await expectRoomError(stuck.createRoom({ hostName: "Aman", maxPlayers: 2 }, ctx), "room-code-exhausted");
      });

      it("rate-limits room creation per client", async () => {
        const limited = serviceFor(store, { creationLimiter: new SlidingWindowLimiter({ limit: 2, windowMs: 60_000 }) });
        await limited.createRoom({ hostName: "A", maxPlayers: 2 }, { clientKey: "flood" });
        await limited.createRoom({ hostName: "A", maxPlayers: 2 }, { clientKey: "flood" });
        const error = await expectRoomError(limited.createRoom({ hostName: "A", maxPlayers: 2 }, { clientKey: "flood" }), "rate-limited");
        expect(error.details.retryAfterSeconds).toBeGreaterThan(0);
        await limited.createRoom({ hostName: "A", maxPlayers: 2 }, { clientKey: "someone-else" });
      });
    });

    describe("preview", () => {
      it("shows occupancy with names but no ids, versions or credentials", async () => {
        const { code, members } = await roomWith(["Ben"], { roomName: "Friday Ludo" });
        const preview = await rooms.previewRoom(code, ctx);
        expect(Object.keys(preview).sort()).toEqual(
          ["availableColours", "blockedReason", "code", "colours", "hostName", "joinable", "joinedCount", "lifecycle", "maxPlayers", "name", "occupiedSeats", "status"].sort(),
        );
        expect(preview).toMatchObject({
          code,
          name: "Friday Ludo",
          status: "lobby",
          lifecycle: "ready",
          maxPlayers: 4,
          joinedCount: 2,
          occupiedSeats: [0, 2],
          availableColours: ["royal-blue", "golden"],
          hostName: "Aman",
          joinable: true,
          blockedReason: null,
        });
        expect(preview.colours).toEqual([
          { colour: "crimson", colourName: "Crimson", seat: 0, taken: true, takenBy: "Aman" },
          { colour: "royal-blue", colourName: "Royal Blue", seat: 1, taken: false, takenBy: null },
          { colour: "emerald", colourName: "Emerald", seat: 2, taken: true, takenBy: "Ben" },
          { colour: "golden", colourName: "Golden Yellow", seat: 3, taken: false, takenBy: null },
        ]);
        const json = JSON.stringify(preview);
        for (const m of members) {
          expect(json).not.toContain(m.player.playerId);
          expect(json).not.toContain(m.credential.secret);
        }
        expect(json).not.toContain(members[0]!.room.roomId);
        expect(json).not.toMatch(/hash|version|secret|credential/i);
      });

      it("is read-only", async () => {
        const { code, roomId } = await roomWith([]);
        const before = await store.getRoom(roomId);
        await rooms.previewRoom(code, ctx);
        await rooms.previewRoom(code.toLowerCase(), ctx);
        expect(await store.getRoom(roomId)).toEqual(before);
      });

      it("accepts lowercase and spaced codes; distinguishes malformed from unknown codes", async () => {
        const { code } = await roomWith([]);
        expect((await rooms.previewRoom(` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `, ctx)).code).toBe(code);
        await expectRoomError(rooms.previewRoom("ABC", ctx), "invalid-room-code");
        await expectRoomError(rooms.previewRoom("O0O0O0", ctx), "invalid-room-code");
        await expectRoomError(rooms.previewRoom(12345, ctx), "invalid-room-code");
        let unknown = generateRoomCode();
        while (await store.getRoomByCode(unknown)) unknown = generateRoomCode();
        await expectRoomError(rooms.previewRoom(unknown, ctx), "room-not-found");
      });

      it("reports why a room cannot be joined", async () => {
        const full = await roomWith(["Ben"], { maxPlayers: 2 });
        expect(await rooms.previewRoom(full.code, ctx)).toMatchObject({ joinable: false, blockedReason: "room-full", availableColours: [] });

        const started = await roomWith(["Ben"]);
        await rooms.startGame(started.actors[0]!);
        expect(await rooms.previewRoom(started.code, ctx)).toMatchObject({ joinable: false, blockedReason: "game-already-started", lifecycle: "playing" });

        const closed = await roomWith([]);
        await rooms.closeRoom(closed.actors[0]!);
        expect(await rooms.previewRoom(closed.code, ctx)).toMatchObject({ joinable: false, blockedReason: "room-closed", lifecycle: "abandoned" });

        await rooms.archiveRoom(closed.actors[0]!);
        await expectRoomError(rooms.previewRoom(closed.code, ctx), "room-not-found");
      });

      it("slows down code guessing: repeated misses lock the client out, real codes included", async () => {
        let now = 0;
        const guarded = serviceFor(store, {
          lookupGuard: new CodeLookupGuard({ lookups: { limit: 1000, windowMs: 60_000 }, misses: { limit: 3, windowMs: 60_000 } }, () => now),
        });
        const { code } = await roomWith([]);
        const guesser = { clientKey: "guesser" };
        for (let i = 0; i < 3; i++) {
          let guess = generateRoomCode();
          while (await store.getRoomByCode(guess)) guess = generateRoomCode();
          await expectRoomError(guarded.previewRoom(guess, guesser), "room-not-found");
        }
        await expectRoomError(guarded.previewRoom(code, guesser), "rate-limited");
        await expectRoomError(guarded.joinRoom({ code, displayName: "Eve" }, guesser), "rate-limited");
        expect((await guarded.previewRoom(code, { clientKey: "friend" })).code).toBe(code);
        now = 60_001;
        expect((await guarded.previewRoom(code, guesser)).code).toBe(code);
      });
    });

    describe("join", () => {
      it("seats players automatically and deterministically: opposite first, then the gaps", async () => {
        const { members } = await roomWith(["Ben", "Chen", "Dev"]);
        expect(members.map((m) => [m.player.seat, m.player.colour])).toEqual([
          [0, "crimson"],
          [2, "emerald"],
          [1, "royal-blue"],
          [3, "golden"],
        ]);
        const last = members[3]!.room;
        expect(last).toMatchObject({ roomVersion: 3, lifecycle: "ready", canStart: true });
        expect(last.players.map((p) => p.displayName)).toEqual(["Aman", "Chen", "Ben", "Dev"]); // seat order
      });

      it("honours a preferred colour, and refuses a taken or unknown one", async () => {
        const { code } = await roomWith([]);
        const ben = await join(code, "Ben", { colour: "golden" });
        expect(ben.player).toMatchObject({ seat: 3, colour: "golden", colourName: "Golden Yellow", isHost: false });
        const taken = await expectRoomError(join(code, "Chen", { colour: "golden" }), "colour-taken");
        expect(taken.details.availableColours).toEqual(["royal-blue", "emerald"]);
        await expectRoomError(join(code, "Chen", { colour: "lime" }), "invalid-colour");
        expect((await join(code, "Chen", { colour: "auto" })).player.colour).toBe("royal-blue"); // seats 1 and 2 tie; lowest wins
      });

      it("gives every joiner a distinct identity and credential", async () => {
        const { members } = await roomWith(["Ben", "Chen"]);
        expect(new Set(members.map((m) => m.player.playerId)).size).toBe(3);
        expect(new Set(members.map((m) => m.credential.secret)).size).toBe(3);
      });

      it("refuses a full room, a started game and a closed or archived room", async () => {
        const full = await roomWith(["Ben"], { maxPlayers: 2 });
        await expectRoomError(join(full.code, "Chen"), "room-full");

        const started = await roomWith(["Ben"]);
        await rooms.startGame(started.actors[0]!);
        await expectRoomError(join(started.code, "Chen"), "game-already-started");

        const closed = await roomWith([]);
        await rooms.closeRoom(closed.actors[0]!);
        await expectRoomError(join(closed.code, "Chen"), "room-closed");
        await rooms.archiveRoom(closed.actors[0]!);
        await expectRoomError(join(closed.code, "Chen"), "room-not-found");
      });

      it("prevents duplicate membership and duplicate names", async () => {
        const { code, members } = await roomWith(["Ben"]);
        await expectRoomError(join(code, "Ben again", { credential: members[1]!.credential }), "already-member");
        await expectRoomError(join(code, "bEN"), "name-taken");
        await expectRoomError(join(code, "Ｂｅｎ"), "name-taken");
        // Another tab without this player's credential is a different player.
        const tab = await join(code, "Ben (tab 2)", { credential: { playerId: members[1]!.player.playerId, secret: "wrong" } });
        expect(tab.player.playerId).not.toBe(members[1]!.player.playerId);
      });

      it("validates the request", async () => {
        const { code } = await roomWith([]);
        await expectRoomError(join(code, ""), "invalid-display-name");
        await expectRoomError(join("nope", "Ben"), "invalid-room-code");
        await expectRoomError(rooms.joinRoom({ code, displayName: "Ben", seat: 3 }, ctx), "invalid-request");
      });
    });

    describe("identity", () => {
      it("authenticates only a current member presenting the right secret", async () => {
        const { members } = await roomWith(["Ben"]);
        const actor = await rooms.authenticate(members[1]!.credential);
        expect(actor).toMatchObject({ playerId: members[1]!.player.playerId, roomId: members[1]!.room.roomId });
        await expectRoomError(rooms.authenticate({ ...members[1]!.credential, secret: members[0]!.credential.secret }), "unauthenticated");
        await expectRoomError(rooms.authenticate({ playerId: "00000000-0000-4000-8000-000000000000", secret: "x" }), "unauthenticated");
        await expectRoomError(rooms.authenticate({ playerId: "not-a-uuid", secret: "x" }), "unauthenticated");
        await expectRoomError(rooms.authenticate(null), "unauthenticated");
      });

      it("refuses identities it did not issue", async () => {
        const { members } = await roomWith(["Ben"]);
        const forged = { playerId: members[0]!.player.playerId, roomId: members[0]!.room.roomId } as AuthenticatedPlayer;
        await expectRoomError(rooms.getRoomView(forged), "unauthenticated");
        await expectRoomError(rooms.startGame(forged), "unauthenticated");
      });
    });

    describe("host controls", () => {
      it("lets only the host change settings, in the lobby", async () => {
        const { roomId, actors } = await roomWith(["Ben"]);
        const [host, guest] = actors as [AuthenticatedPlayer, AuthenticatedPlayer];
        await expectRoomError(rooms.updateSettings(guest, { autoMove: false }), "not-host");
        const updated = await rooms.updateSettings(host, { autoMove: false, rankingMode: "full-ranking", maxPlayers: 3, name: "Renamed" });
        expect(updated).toMatchObject({ name: "Renamed", maxPlayers: 3, settings: { autoMove: false, rankingMode: "full-ranking", maxPlayers: 3 } });
        expect(await store.getRoom(roomId)).toMatchObject({ maxPlayers: 3, settings: { maxPlayers: 3 }, name: "Renamed" });
        await expectRoomError(rooms.updateSettings(host, { maxPlayers: 6 }), "unsupported-player-count");
        await expectRoomError(rooms.updateSettings(host, { rules: { blocksEnabled: true } }), "unsupported-rule");
        await expectRoomError(rooms.updateSettings(host, { visibility: "public" }), "unsupported-setting");
        expect((await rooms.updateSettings(host, { name: null })).name).toBeNull();
      });

      it("never shrinks the room below its members", async () => {
        const { actors } = await roomWith(["Ben", "Chen"]);
        await expectRoomError(rooms.updateSettings(actors[0]!, { maxPlayers: 2 }), "capacity-below-members");
      });

      it("reports a stale room version instead of overwriting", async () => {
        const { code, actors } = await roomWith([]);
        const host = actors[0]!;
        const view = await rooms.getRoomView(host);
        await join(code, "Ben"); // the room moves on
        await expectRoomError(rooms.updateSettings(host, { autoMove: false, expectedRoomVersion: view.roomVersion }), "version-conflict");
        const fresh = await rooms.getRoomView(host);
        expect((await rooms.updateSettings(host, { autoMove: false, expectedRoomVersion: fresh.roomVersion })).roomVersion).toBe(fresh.roomVersion + 1);
      });

      it("transfers the host role only to another member", async () => {
        const { members, actors } = await roomWith(["Ben"]);
        const [host, guest] = actors as [AuthenticatedPlayer, AuthenticatedPlayer];
        await expectRoomError(rooms.transferHost(guest, { playerId: guest.playerId }), "not-host");
        await expectRoomError(rooms.transferHost(host, { playerId: host.playerId }), "invalid-target");
        await expectRoomError(rooms.transferHost(host, { playerId: "00000000-0000-4000-8000-000000000000" }), "invalid-target");
        const view = await rooms.transferHost(host, { playerId: members[1]!.player.playerId });
        expect(view.hostPlayerId).toBe(guest.playerId);
        expect(view.players.find((p) => p.isHost)?.displayName).toBe("Ben");
        await expectRoomError(rooms.updateSettings(host, { autoMove: false }), "not-host");
        await rooms.updateSettings(guest, { autoMove: false });
      });

      it("lets the host remove a player, freeing their seat and signing them out", async () => {
        const { code, members, actors } = await roomWith(["Ben", "Chen"]);
        const [host, ben] = actors as [AuthenticatedPlayer, AuthenticatedPlayer];
        await expectRoomError(rooms.removePlayer(ben, { playerId: host.playerId }), "not-host");
        await expectRoomError(rooms.removePlayer(host, { playerId: host.playerId }), "invalid-target");
        const view = await rooms.removePlayer(host, { playerId: ben.playerId });
        expect(view.players.map((p) => p.displayName)).toEqual(["Aman", "Chen"]);
        expect((await rooms.previewRoom(code, ctx)).availableColours).toContain("emerald");
        await expectRoomError(rooms.authenticate(members[1]!.credential), "unauthenticated");
        await expectRoomError(rooms.getRoomView(ben), "not-a-member");
      });

      it("authorises the game start: host only, two or more players, once", async () => {
        const solo = await roomWith([]);
        await expectRoomError(rooms.startGame(solo.actors[0]!), "not-enough-players");

        const draws: number[] = [];
        const service = serviceFor(store, { drawFirstPlayer: (n) => (draws.push(n), n - 1) });
        const { code, roomId, members, actors } = await roomWith(["Ben", "Chen"]);
        const actorsHere = await Promise.all(members.map((m) => service.authenticate(m.credential)));
        await expectRoomError(service.startGame(actorsHere[1]!), "not-host");
        const { room, state } = await service.startGame(actorsHere[0]!, { requestId: "start-1" });
        expect(draws).toEqual([3]);
        expect(room).toMatchObject({ status: "playing", lifecycle: "playing", canStart: false });
        expect(state.players.map((p) => [p.seat, p.id])).toEqual([
          [0, members[0]!.player.playerId],
          [1, members[2]!.player.playerId],
          [2, members[1]!.player.playerId],
        ]);
        expect(state.currentPlayerIndex).toBe(2);
        expect(state.settings).toEqual({ autoMove: true, rankingMode: "winner-only" });
        const session = await store.getGameSession(roomId);
        expect(session!.state).toEqual(state);
        expect(await store.listEvents(roomId)).toMatchObject([{ seq: 1, actionType: "game:start", playerId: actors[0]!.playerId, requestId: "start-1" }]);
        await expectRoomError(service.startGame(actorsHere[0]!), "game-already-started");
        await expectRoomError(rooms.updateSettings(actors[0]!, { autoMove: false }), "settings-locked");
        await expectRoomError(join(code, "Late"), "game-already-started");
      });
    });

    describe("leaving and host departure", () => {
      it("frees the seat when a guest leaves and moves the room back to waiting", async () => {
        const { code, actors } = await roomWith(["Ben"]);
        const view = await rooms.leaveRoom(actors[1]!);
        expect(view).toMatchObject({ lifecycle: "waiting", canStart: false });
        expect((await rooms.previewRoom(code, ctx)).occupiedSeats).toEqual([0]);
        await expectRoomError(rooms.getRoomView(actors[1]!), "not-a-member");
      });

      it("hands the host role to the longest-standing member when the host leaves", async () => {
        const { members, actors } = await roomWith(["Ben", "Chen"]);
        const view = await rooms.leaveRoom(actors[0]!);
        expect(view.hostPlayerId).toBe(members[1]!.player.playerId);
        expect(view.players.map((p) => [p.displayName, p.isHost])).toEqual([
          ["Chen", false],
          ["Ben", true],
        ]);
        await rooms.updateSettings(actors[1]!, { autoMove: false }); // the new host has host rights
      });

      it("abandons the lobby when the last member leaves", async () => {
        const { code, roomId, actors } = await roomWith([]);
        expect(await rooms.leaveRoom(actors[0]!)).toMatchObject({ status: "abandoned", lifecycle: "abandoned", players: [] });
        expect((await store.getRoom(roomId))!.status).toBe("abandoned");
        await expectRoomError(join(code, "Ben"), "room-closed");
      });

      it("does not treat leaving a running game as a lobby action", async () => {
        const { actors } = await roomWith(["Ben"]);
        await rooms.startGame(actors[0]!);
        await expectRoomError(rooms.leaveRoom(actors[1]!), "game-in-progress");
        await expectRoomError(rooms.removePlayer(actors[0]!, { playerId: actors[1]!.playerId }), "game-in-progress");
      });
    });

    describe("lifecycle", () => {
      it("walks waiting → ready → playing → finished → archived and refuses shortcuts", async () => {
        const host = await create();
        const actor = await signIn(host);
        expect((await rooms.getRoomView(actor)).lifecycle).toBe("waiting");
        await expectRoomError(rooms.archiveRoom(actor), "invalid-transition");
        await join(host.room.code, "Ben");
        expect((await rooms.getRoomView(actor)).lifecycle).toBe("ready");
        const { room } = await rooms.startGame(actor);
        // The game ending is recorded by gameplay (2C); simulate it at the store level.
        await store.updateRoom(room.roomId, room.roomVersion, { status: "finished" });
        await expectRoomError(rooms.closeRoom(actor), "invalid-transition");
        const archived = await rooms.archiveRoom(actor);
        expect(archived).toMatchObject({ status: "archived", lifecycle: "archived" });
        expect((await store.getRoom(room.roomId))!.archivedAt).toBeInstanceOf(Date);
        await expectRoomError(rooms.archiveRoom(actor), "invalid-transition");
      });

      it("lets the host close a running game", async () => {
        const { actors } = await roomWith(["Ben"]);
        await rooms.startGame(actors[0]!);
        await expectRoomError(rooms.closeRoom(actors[1]!), "not-host");
        expect((await rooms.closeRoom(actors[0]!)).status).toBe("abandoned");
      });
    });

    describe("concurrency", () => {
      it("never over-fills a room: of 6 simultaneous joiners for 3 places, exactly 3 get in", async () => {
        const { code, roomId } = await roomWith([]);
        const results = await Promise.allSettled(["B", "C", "D", "E", "F", "G"].map((n) => join(code, `Player ${n}`)));
        expect(outcomes(results)).toEqual(["ok", "ok", "ok", "room-full", "room-full", "room-full"]);
        const players = await store.listPlayers(roomId);
        expect(players).toHaveLength(4);
        expect(new Set(players.map((p) => p.seat)).size).toBe(4);
        expect(new Set(players.map((p) => p.colour)).size).toBe(4);
      });

      it("gives a contested colour to exactly one player", async () => {
        const { code, roomId } = await roomWith([]);
        const results = await Promise.allSettled(["Ben", "Chen", "Dev"].map((n) => join(code, n, { colour: "golden" })));
        expect(outcomes(results)).toEqual(["colour-taken", "colour-taken", "ok"]);
        expect((await store.listPlayers(roomId)).filter((p) => p.colour === "golden")).toHaveLength(1);
      });

      it("gives the last place to exactly one player", async () => {
        const { code } = await roomWith(["Ben"], { maxPlayers: 3 });
        const results = await Promise.allSettled([join(code, "Chen", { colour: "royal-blue" }), join(code, "Dev", { colour: "golden" })]);
        expect(outcomes(results)).toEqual(["ok", "room-full"]);
      });

      it("lets one of two simultaneous joins with the same name in", async () => {
        const { code } = await roomWith([]);
        const results = await Promise.allSettled([join(code, "Sam"), join(code, "SAM")]);
        expect(outcomes(results)).toEqual(["name-taken", "ok"]);
      });

      it("rejects the second of two edits made from the same room version", async () => {
        const { actors } = await roomWith([]);
        const view: RoomView = await rooms.getRoomView(actors[0]!);
        const results = await Promise.allSettled([
          rooms.updateSettings(actors[0]!, { autoMove: false, expectedRoomVersion: view.roomVersion }),
          rooms.updateSettings(actors[0]!, { rankingMode: "full-ranking", expectedRoomVersion: view.roomVersion }),
        ]);
        expect(outcomes(results)).toEqual(["ok", "version-conflict"]);
      });

      it("starts the game exactly once when the host double-clicks", async () => {
        const { roomId, actors } = await roomWith(["Ben"]);
        const results = await Promise.allSettled([rooms.startGame(actors[0]!), rooms.startGame(actors[0]!)]);
        expect(outcomes(results)).toEqual(["game-already-started", "ok"]);
        expect(await store.listEvents(roomId)).toHaveLength(1);
      });
    });
  });
}
