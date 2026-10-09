// Authoritative gameplay: start, roll, move, snapshots and history.
//
// Transport-independent. For every action:
//   1. resolve the caller from their verified identity (never from input);
//   2. if this (player, requestId) was already committed, return that result;
//   3. load the committed game, check the room is playing and the caller's
//      expected state version is current;
//   4. let the Phase 1 engine decide (dice are drawn here, by the server);
//   5. commit state + event atomically, conditional on the state version;
//   6. only then publish the committed action and state.
// Steps 1–6 run in the room's coordinator slot, so in-process actions on one
// room are strictly ordered. Across processes, the conditional commit in
// PostgreSQL is what guarantees at most one action per state version.

import { createCryptoDice, moveToken, rollDice, type ActionResult, type DiceSource } from "@ludo/game-engine";
import type { GameActionType, GameActionView, GameStateView, RoomView } from "@ludo/shared-types";
import { StoreError, type GameSessionRecord, type GameStore, type RoomRecord } from "../persistence/types.js";
import { RoomError } from "../rooms/errors.js";
import { translate, type AuthenticatedPlayer, type RoomService } from "../rooms/roomService.js";
import { toRoomView } from "../rooms/views.js";
import { ActionCoordinator } from "./actionCoordinator.js";
import { SILENT_PUBLISHER, type GamePublisher } from "./gameEvents.js";
import { GameplayError, fromEngineError } from "./gameplayErrors.js";
import { projectGameState, toActionView, type ActionPayload } from "./stateProjection.js";

export interface GameplayServiceOptions {
  store: GameStore;
  rooms: RoomService;
  /** Server dice. Production uses secure randomness; tests inject a fixed sequence here, never through a client. */
  dice?: DiceSource;
  publisher?: GamePublisher;
  coordinator?: ActionCoordinator;
  /** Where unexpected publish failures are reported (after a successful commit). */
  onPublishError?: (error: unknown) => void;
}

export interface RoomSnapshot {
  room: RoomView;
  game: GameStateView | null;
}

export interface ActionOutcome {
  roomId: string;
  roomVersion: number;
  action: GameActionView;
  replayed: boolean;
  game: GameStateView;
}

export interface StartOutcome extends RoomSnapshot {
  game: GameStateView;
  action: GameActionView;
  replayed: boolean;
}

export interface ActionRequest {
  requestId: string;
  expectedStateVersion: number;
}

export interface MoveRequestInput extends ActionRequest {
  tokenId: number;
}

export interface HistoryPage {
  actions: GameActionView[];
  nextAfterSeq: number;
  hasMore: boolean;
}

const MAX_HISTORY_PAGE = 100;

export class GameplayService {
  private readonly store: GameStore;
  private readonly rooms: RoomService;
  private readonly dice: DiceSource;
  private readonly coordinator: ActionCoordinator;
  private readonly onPublishError: (error: unknown) => void;
  private publisher: GamePublisher;

  constructor(options: GameplayServiceOptions) {
    this.store = options.store;
    this.rooms = options.rooms;
    this.dice = options.dice ?? createCryptoDice();
    this.publisher = options.publisher ?? SILENT_PUBLISHER;
    this.coordinator = options.coordinator ?? new ActionCoordinator();
    this.onPublishError = options.onPublishError ?? (() => undefined);
  }

  /** Connects the transport's broadcaster (set once the Socket.IO server exists). */
  attachPublisher(publisher: GamePublisher): void {
    this.publisher = publisher;
  }

  /** The room and, once started, the latest committed game: for joining, reconnecting or after a missed update. */
  async snapshot(actor: AuthenticatedPlayer): Promise<RoomSnapshot> {
    return this.guard(async () => {
      const { room, players } = await this.rooms.resolveMember(actor);
      const session = await this.store.getGameSession(room.id);
      return { room: toRoomView(room, players), game: session ? projectGameState(session.state) : null };
    });
  }

  /** Host only. Idempotent per requestId: a retried start returns the original start. */
  async start(actor: AuthenticatedPlayer, request: { requestId: string; expectedRoomVersion?: number }): Promise<StartOutcome> {
    return this.coordinator.run(actor.roomId, () =>
      this.guard(async () => {
        const { room } = await this.rooms.resolveMember(actor);
        const earlier = await this.replayStart(room, actor, request.requestId);
        if (earlier) return earlier;
        let started;
        try {
          started = await this.rooms.startGame(actor, request);
        } catch (error) {
          // Another server process may have committed this very request a moment ago.
          if (error instanceof RoomError && error.code === "game-already-started") {
            const replay = await this.replayStart(room, actor, request.requestId);
            if (replay) return replay;
          }
          throw error;
        }
        const [first] = await this.store.listEvents(room.id, { limit: 1 });
        const action = toActionView(first!);
        const game = projectGameState(started.state);
        this.publish(() => {
          this.publisher.roomUpdated(started.room);
          this.publisher.gameAction(room.id, action);
          this.publisher.gameState(room.id, game);
        });
        return { room: started.room, game, action, replayed: false };
      }),
    );
  }

  /** The current player rolls; the server draws the die. */
  async roll(actor: AuthenticatedPlayer, request: ActionRequest): Promise<ActionOutcome> {
    return this.act(actor, request, "game:roll", (session) => {
      // The engine checks game, player, turn and phase before the die value; probing with an
      // invalid value lets it refuse a roll without a die being drawn (no rules duplicated here).
      const probe = rollDice(session.state, actor.playerId, 0);
      if (!probe.ok && probe.error !== "invalid-dice") return { result: probe, payload: {} };
      const dice = this.dice.roll();
      return { result: rollDice(session.state, actor.playerId, dice), payload: { dice } };
    });
  }

  /** The current player moves one of their own tokens; the engine decides whether it is legal. */
  async move(actor: AuthenticatedPlayer, request: MoveRequestInput): Promise<ActionOutcome> {
    return this.act(actor, request, "game:move", (session) => ({
      result: moveToken(session.state, actor.playerId, request.tokenId),
      payload: { tokenId: request.tokenId },
    }));
  }

  /** Committed actions after `afterSeq`, oldest first. */
  async history(actor: AuthenticatedPlayer, request: { afterSeq?: number; limit?: number }): Promise<HistoryPage> {
    return this.guard(async () => {
      const { room } = await this.rooms.resolveMember(actor);
      const afterSeq = request.afterSeq ?? 0;
      const limit = Math.min(Math.max(request.limit ?? 50, 1), MAX_HISTORY_PAGE);
      const events = await this.store.listEvents(room.id, { afterSeq, limit: limit + 1 });
      const page = events.slice(0, limit).map(toActionView);
      return { actions: page, nextAfterSeq: page.at(-1)?.seq ?? afterSeq, hasMore: events.length > limit };
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private act(
    actor: AuthenticatedPlayer,
    request: ActionRequest & { tokenId?: number },
    type: "game:roll" | "game:move",
    decide: (session: GameSessionRecord) => { result: ActionResult; payload: ActionPayload },
  ): Promise<ActionOutcome> {
    return this.coordinator.run(actor.roomId, () =>
      this.guard(async () => {
        const { room } = await this.rooms.resolveMember(actor);
        const earlier = await this.replayAction(room, actor, request, type);
        if (earlier) return earlier;

        const session = await this.playableSession(room);
        if (request.expectedStateVersion !== session.stateVersion) {
          throw new GameplayError("stale-state", "The game has moved on; refresh and try again", { stateVersion: session.stateVersion });
        }
        const { result, payload } = decide(session);
        if (!result.ok) throw fromEngineError(result.error, session.stateVersion);

        const finished = result.state.phase === "finished";
        let committed;
        try {
          committed = await this.store.commitGameAction({
            roomId: room.id,
            expectedStateVersion: session.stateVersion,
            state: result.state,
            event: { playerId: actor.playerId, actionType: type, requestId: request.requestId, payload: { ...payload, entries: result.events } },
            ...(finished ? { roomStatus: "finished" as const } : {}),
          });
        } catch (error) {
          if (error instanceof StoreError && error.code === "duplicate-request") {
            const replay = await this.replayAction(room, actor, request, type);
            if (replay) return replay;
          }
          if (error instanceof StoreError && error.code === "version-conflict") {
            const current = await this.store.getGameSession(room.id);
            throw new GameplayError("stale-state", "Another action was committed first; refresh and try again", {
              stateVersion: current?.stateVersion ?? null,
            });
          }
          throw error;
        }

        const action = toActionView(committed.event);
        const game = projectGameState(committed.session.state);
        let roomView: RoomView | null = null;
        if (finished) {
          await this.recordFinishPlaces(committed.session.state.ranking);
          const { room: after, players } = await this.rooms.resolveMember(actor);
          roomView = toRoomView(after, players);
        }
        this.publish(() => {
          this.publisher.gameAction(room.id, action);
          this.publisher.gameState(room.id, game);
          if (roomView) {
            this.publisher.gameFinished(room.id, { stateVersion: game.stateVersion, winnerId: game.winnerId, ranking: game.ranking });
            this.publisher.roomUpdated(roomView);
          }
        });
        return { roomId: room.id, roomVersion: roomView?.roomVersion ?? room.roomVersion, action, replayed: false, game };
      }),
    );
  }

  private async playableSession(room: RoomRecord): Promise<GameSessionRecord> {
    switch (room.status) {
      case "lobby":
        throw new GameplayError("game-not-started", "The game has not started yet");
      case "paused":
        throw new GameplayError("game-paused", "The game is paused");
      case "finished":
        throw new GameplayError("game-finished", "The game is over");
      case "abandoned":
      case "archived":
        throw new RoomError("room-closed", "This room has closed");
      case "playing":
        break;
    }
    const session = await this.store.getGameSession(room.id);
    if (!session) throw new GameplayError("game-not-started", "The game has not started yet");
    return session;
  }

  /** The committed result of an earlier identical request, or null if there is none. */
  private async replayAction(
    room: RoomRecord,
    actor: AuthenticatedPlayer,
    request: { requestId: string; tokenId?: number },
    type: GameActionType,
  ): Promise<ActionOutcome | null> {
    const event = await this.store.findEventByRequest(room.id, actor.playerId, request.requestId);
    if (!event) return null;
    const action = toActionView(event);
    if (action.type !== type || (type === "game:move" && action.tokenId !== request.tokenId)) {
      throw new GameplayError("request-id-reused", "This requestId was already used for a different action");
    }
    const session = await this.store.getGameSession(room.id);
    return { roomId: room.id, roomVersion: room.roomVersion, action, replayed: true, game: projectGameState(session!.state) };
  }

  private async replayStart(room: RoomRecord, actor: AuthenticatedPlayer, requestId: string): Promise<StartOutcome | null> {
    const event = await this.store.findEventByRequest(room.id, actor.playerId, requestId);
    if (!event) return null;
    if (event.actionType !== "game:start") throw new GameplayError("request-id-reused", "This requestId was already used for a different action");
    const snapshot = await this.snapshot(actor);
    return { room: snapshot.room, game: snapshot.game!, action: toActionView(event), replayed: true };
  }

  /** Denormalised finishing places on the player rows; the ranking in the committed state is authoritative. */
  private async recordFinishPlaces(ranking: readonly string[]): Promise<void> {
    await Promise.all(ranking.map((playerId, i) => this.store.setFinishPlace(playerId, i + 1)));
  }

  /** Publishing happens after the commit; a broadcast failure must not turn a committed action into an error. */
  private publish(send: () => void): void {
    try {
      send();
    } catch (error) {
      this.onPublishError(error);
    }
  }

  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw error instanceof GameplayError ? error : translate(error);
    }
  }
}
