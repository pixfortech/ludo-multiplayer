// The game screen: board, players, die, turn banner, move tray and log, laid
// out per device (docs/design/ui-desktop.md, ui-tablet.md, ui-mobile.md).
//
// Server-authoritative throughout: the board shows the state the server
// committed (animated toward it by useBoardPlayback); Roll and moves are
// requests (game:roll / game:move with the expected state version); the
// movable tokens are exactly the server's legal moves. Nothing moves on the
// board until the server has confirmed it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { PLAYER_IDENTITIES, type PlayerIdentity } from "@ludo/design-tokens";
import type { GameStateView, RoomView } from "@ludo/shared-types";
import type { ConnectionState, Notice } from "../../lib/connection";
import { friendlyError } from "../../lib/errors";
import { formatRoomCode } from "../../lib/format";
import { calloutsFor, moveOutcomes, moveSummary, ordinal, trayOrder } from "../../lib/gameText";
import { identityFor } from "../../lib/identities";
import { useFinePointer, usePrefersReducedMotion } from "../../lib/media";
import { Link, paths } from "../../lib/router";
import { useGame } from "../../state/gameClient";
import { ClassicBoard } from "../board/ClassicBoard";
import type { BoardTokenState } from "../board/BoardToken";
import { tokenKey } from "../board/placement";
import type { MovePreview } from "../board/TokenOverlay";
import { MobileActionBar } from "../layout/MobileActionBar";
import { useImmersiveShell } from "../layout/AppShell";
import { Button } from "../ui/Button";
import { ConnectionPill } from "../ui/ConnectionPill";
import { useToasts } from "../ui/Toasts";
import { CollapseIcon, CrownIcon, ExpandIcon, LeaveIcon } from "../ui/Icons";
import { DicePanel } from "./DicePanel";
import { GameActionFeed } from "./GameActionFeed";
import { MoveTray } from "./MoveTray";
import { PlayerPanel, PlayerStrip, type GamePlayerRow } from "./PlayerPanel";
import { PlayerToken } from "./PlayerToken";
import { TurnIndicator, type TurnInfo } from "./TurnIndicator";
import { useBoardPlayback } from "./useBoardPlayback";

interface GameScreenProps {
  state: ConnectionState & { room: RoomView; game: GameStateView };
  onLeave: () => void;
  leaving: boolean;
  confirmLeave: boolean;
}

type StatusLine = { tone: "info" | "error"; text: string; key: number };

function noticeText(n: Notice): string | null {
  switch (n.kind) {
    case "player-disconnected":
      return `${n.name} lost connection`;
    case "player-connected":
      return `${n.name} is back`;
    case "player-left":
      return `${n.name} left the room`;
    case "host-changed":
      return n.isYou ? "You are now the host" : `${n.name} is now the host`;
    case "game-paused":
      return n.reason === "host" ? "The host paused the game" : "Game paused: waiting for a player to reconnect";
    case "game-resumed":
      return "Game resumed";
    case "seat-restored":
      return "Reconnected: your seat is back";
    default:
      return null;
  }
}

function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const supported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return { supported, active, toggle };
}

export function GameScreen({ state, onLeave, leaving, confirmLeave }: GameScreenProps) {
  useImmersiveShell();
  const { client } = useGame();
  const toasts = useToasts();
  // The game screen owns the viewport: lobby toasts must not cover the board or controls.
  useEffect(() => toasts.clear(), [toasts]);
  const { room, game } = state;
  const reduced = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const playback = useBoardPlayback(game, reduced);
  const shown = playback.game ?? game;
  const me = state.seat?.playerId ?? null;
  const fullscreen = useFullscreen();

  const [rollPending, setRollPending] = useState(false);
  const [pendingMove, setPendingMove] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusLine | null>(null);

  const roomPlayer = useCallback((id: string) => room.players.find((p) => p.playerId === id), [room.players]);
  const nameOf = useCallback((id: string) => roomPlayer(id)?.displayName ?? "A player", [roomPlayer]);
  const identityOf = useCallback(
    (id: string): PlayerIdentity => {
      const rp = roomPlayer(id);
      if (rp) return identityFor(rp.colour);
      const seat = game.players.find((p) => p.id === id)?.seat ?? 0;
      return PLAYER_IDENTITIES[seat]!;
    },
    [roomPlayer, game.players],
  );

  // A new authoritative state ends any selection made against the old one.
  useEffect(() => {
    setSelected(null);
    setHovered(null);
  }, [game.stateVersion]);

  // In the game, notices appear in the status line (never as floating toasts over the board or controls).
  const say = useCallback((tone: StatusLine["tone"], text: string) => setStatus({ tone, text, key: Date.now() }), []);
  useEffect(() => client.onNotice((n) => {
    const text = noticeText(n);
    if (text) say("info", text);
  }), [client, say]);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus((s) => (s?.key === status.key ? null : s)), 4500);
    return () => clearTimeout(timer);
  }, [status]);

  const paused = room.status === "paused";
  const finished = game.phase === "finished";
  const connected = state.link === "connected";
  const settled = !playback.busy && playback.game?.stateVersion === game.stateVersion;
  const myTurn = me !== null && game.currentPlayerId === me && !paused && !finished;
  const canRoll = myTurn && game.turn.phase === "awaiting-roll" && settled && !rollPending && connected;
  const choosing = myTurn && game.turn.phase === "awaiting-move" && settled && connected;
  const legal = useMemo(() => (choosing ? trayOrder(game.turn.legalMoves) : []), [choosing, game.turn.legalMoves]);
  const mySeat = game.players.find((p) => p.id === me)?.seat ?? null;
  const myIdentity = me ? identityOf(me) : null;

  const roll = useCallback(async () => {
    if (!canRoll) return;
    setRollPending(true);
    try {
      await client.rollDice();
    } catch (error) {
      say("error", friendlyError(error));
    } finally {
      setRollPending(false);
    }
  }, [canRoll, client, say]);

  const move = useCallback(
    async (tokenId: number) => {
      if (!choosing || pendingMove !== null || !legal.some((m) => m.tokenId === tokenId)) return;
      setSelected(tokenId);
      setPendingMove(tokenId);
      try {
        await client.moveToken(tokenId);
      } catch (error) {
        say("error", friendlyError(error));
      } finally {
        setPendingMove(null);
      }
    },
    [choosing, pendingMove, legal, client, say],
  );

  // Keyboard: R rolls; Escape clears a previewed move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey && !event.altKey) void roll();
      if (event.key === "Escape") setSelected(null);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [roll]);

  const onBoardActivate = useCallback(
    (key: string) => {
      if (me === null) return;
      const tokenId = Number(key.slice(me.length + 1));
      if (finePointer || selected === tokenId) void move(tokenId);
      else setSelected(tokenId);
    },
    [me, finePointer, selected, move],
  );
  const onBoardPreview = useCallback((key: string | null) => setHovered(key && me ? Number(key.slice(me.length + 1)) : null), [me]);

  // Token presentation from the server's legal moves (never computed here).
  const { states, badges, labels } = useMemo(() => {
    const states: Record<string, BoardTokenState> = {};
    const badges: Record<string, number> = {};
    const labels: Record<string, string> = {};
    if (choosing && me) {
      for (const t of game.players.find((p) => p.id === me)?.tokens ?? []) if (t.step !== 56) states[tokenKey(me, t.id)] = "unmovable";
      legal.forEach((m, i) => {
        const key = tokenKey(me, m.tokenId);
        states[key] = selected === m.tokenId || pendingMove === m.tokenId ? "selected" : "movable";
        badges[key] = i + 1;
        labels[key] = [`Move token ${m.tokenId + 1}`, moveSummary(m), ...moveOutcomes(m, nameOf)].join(", ");
      });
    }
    return { states, badges, labels };
  }, [choosing, me, game.players, legal, selected, pendingMove, nameOf]);

  const previewId = hovered ?? selected;
  const previewMove = previewId !== null ? legal.find((m) => m.tokenId === previewId) : undefined;
  const preview: MovePreview | null = previewMove && mySeat !== null ? { seat: mySeat, from: previewMove.from, to: previewMove.to, slot: previewMove.tokenId } : null;

  // Players, from the state the board shows.
  const rows: GamePlayerRow[] = shown.players.map((p) => {
    const rp = roomPlayer(p.id);
    const place = shown.ranking.indexOf(p.id);
    return {
      playerId: p.id,
      name: nameOf(p.id),
      identity: identityOf(p.id),
      seat: p.seat,
      isYou: p.id === me,
      isHost: p.id === room.hostPlayerId,
      connected: rp?.connectionStatus === "connected",
      home: p.tokens.filter((t) => t.step === 56).length,
      current: !finished && p.id === shown.currentPlayerId,
      place: place >= 0 ? place + 1 : null,
    };
  });

  const current = shown.currentPlayerId;
  const currentName = current ? nameOf(current) : "";
  const pauseText = room.pause?.reason === "host" ? "The host paused the game" : room.pause?.playerId ? `Waiting for ${nameOf(room.pause.playerId)} to reconnect` : "Waiting for a player to reconnect";
  const nextName = (() => {
    const order = shown.players.filter((p) => !p.finished);
    const i = order.findIndex((p) => p.id === current);
    if (i < 0 || order.length < 2) return null;
    const next = order[(i + 1) % order.length]!;
    return next.id === me ? "You" : nameOf(next.id);
  })();
  const winnerName = game.winnerId ? (game.winnerId === me ? "You" : nameOf(game.winnerId)) : null;
  const turn: TurnInfo = {
    identity: finished ? (game.winnerId ? identityOf(game.winnerId) : null) : current ? identityOf(current) : null,
    title: finished ? (winnerName ? `${winnerName} ${winnerName === "You" ? "win" : "wins"}!` : "Game over") : current === me ? "Your turn" : `${currentName}'s turn`,
    detail: finished
      ? "The game is over."
      : paused
        ? pauseText
        : rollPending || playback.die.rolling
          ? "Rolling…"
          : shown.turn.phase === "awaiting-roll"
            ? current === me
              ? "Roll the dice"
              : `Waiting for ${currentName} to roll`
            : current === me
              ? `Move ${shown.turn.dice ?? ""}: choose a token`
              : `${currentName} is choosing a move`,
    next: finished ? null : nextName,
    callouts: calloutsFor(playback.callouts, nameOf, me),
    calloutKey: playback.calloutKey,
    mine: current === me,
  };

  const trayIdentity = !finished && current ? identityOf(current) : null;
  const waitingLabel = finished ? "Game over" : paused ? "Paused" : !connected ? "Reconnecting…" : current === me ? (shown.turn.phase === "awaiting-move" ? "Choose a token" : "Roll dice") : "Waiting";

  const statusLine = status ? (
    <p key={status.key} role={status.tone === "error" ? "alert" : "status"} className={`animate-fade-up rounded-[var(--radius-control)] px-3 py-2 text-[13px] font-medium ${status.tone === "error" ? "border border-[#f5c6cd] bg-[#fff5f6] text-danger" : "bg-[#f1eee8] text-ink"}`} data-testid="game-status">
      {status.text}
    </p>
  ) : null;

  const trayFor = (layout: "list" | "grid") =>
    choosing && myIdentity && legal.length > 0 ? (
      <MoveTray
        moves={legal}
        identity={myIdentity}
        selected={selected}
        pending={pendingMove}
        nameOf={nameOf}
        dice={game.turn.dice}
        direct={finePointer}
        onSelect={setSelected}
        onConfirm={(id) => void move(id)}
        onPreview={setHovered}
        layout={layout}
      />
    ) : null;
  const railTray = trayFor("list");

  const results = finished ? (
    <div className="flex flex-col gap-3" data-testid="game-results">
      <ol className="flex flex-col gap-1.5">
        {(game.ranking.length ? game.ranking : game.winnerId ? [game.winnerId] : []).map((id, i) => (
          <li key={id} className="flex items-center gap-2.5 rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2">
            <span className="tabular w-8 text-[13px] font-bold text-ink-muted">{ordinal(i + 1)}</span>
            <PlayerToken identity={identityOf(id)} size={26} shadow={false} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{id === me ? "You" : nameOf(id)}</span>
            {i === 0 ? <CrownIcon size={16} className="text-[#a77b0e]" aria-label="Winner" /> : null}
          </li>
        ))}
      </ol>
      <Link to={paths.home()} className="press inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-ink px-4 text-[15px] font-semibold text-white">
        Back to home
      </Link>
    </div>
  ) : null;

  const dice = <DicePanel die={playback.die} identity={trayIdentity} canRoll={canRoll} rolling={rollPending} waitingLabel={waitingLabel} onRoll={() => void roll()} />;

  const roomInfo = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-muted">
          Room <span className="tabular font-semibold text-ink">{formatRoomCode(room.code)}</span>
        </span>
        <ConnectionPill status={state.link} />
      </div>
      <div className="flex gap-2">
        {fullscreen.supported ? (
          <button type="button" onClick={fullscreen.toggle} aria-label={fullscreen.active ? "Exit full screen" : "Full screen"} title={fullscreen.active ? "Exit full screen" : "Full screen"} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-ink shadow-raised hover:bg-[#faf8f4]">
            {fullscreen.active ? <CollapseIcon size={18} /> : <ExpandIcon size={18} />}
          </button>
        ) : null}
        {!finished ? (
          <Button variant={confirmLeave ? "danger" : "ghost"} className="flex-1" loading={leaving} icon={<LeaveIcon size={18} />} onClick={onLeave}>
            {confirmLeave ? "Tap again" : "Leave"}
          </Button>
        ) : null}
      </div>
    </div>
  );

  const pausedOverlay = paused ? (
    <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-[rgba(243,240,234,0.72)] p-6 backdrop-blur-[2px]" data-testid="paused-overlay">
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-[var(--radius-card)] bg-surface p-5 text-center shadow-overlay">
        <p className="font-display text-xl font-semibold text-ink">Game paused</p>
        <p className="text-[14px] text-ink-muted">{pauseText}</p>
        {room.pause?.reason === "host" && room.hostPlayerId === me ? (
          <Button variant="primary" onClick={() => void client.resumeGame().catch((e: unknown) => say("error", friendlyError(e)))}>
            Resume game
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  const board = (
    <div className="relative mx-auto w-[var(--board)] max-w-full">
      <ClassicBoard
        tokens={playback.tokens}
        identityOf={identityOf}
        activeSeats={game.players.map((p) => p.seat)}
        currentSeat={finished ? null : (shown.players.find((p) => p.id === shown.currentPlayerId)?.seat ?? null)}
        youSeat={mySeat}
        states={states}
        badges={badges}
        labels={labels}
        moveMs={playback.moveMs}
        raised={playback.raised}
        preview={preview}
        effects={playback.effects}
        {...(choosing ? { onActivate: onBoardActivate, onPreview: onBoardPreview } : {})}
        title={`Ludo board. ${turn.title}. ${turn.detail}`}
        dimmed={paused}
      />
      {pausedOverlay}
    </div>
  );

  return (
    <div className="game-layout mx-auto w-full max-w-[1800px] px-4 pb-[calc(var(--action-bar-h,0px)+16px)] pt-3 sm:px-6 lg:grid lg:h-[calc(100svh-65px)] lg:grid-cols-[var(--board)_300px] lg:grid-rows-[minmax(0,1fr)] lg:justify-center lg:gap-6 lg:py-5 xl:grid-cols-[240px_var(--board)_280px] 2xl:grid-cols-[280px_var(--board)_320px]" data-testid="game-screen">
      {/* Left column (desktop): players and room. */}
      <aside className="hidden min-h-0 flex-col gap-4 xl:flex" aria-label="Players and room">
        <PlayerPanel players={rows} />
        <div className="rounded-[var(--radius-card)] bg-surface p-3 shadow-raised">{roomInfo}</div>
      </aside>

      {/* Phones and tablet portrait: compact players strip. */}
      <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
        <PlayerStrip players={rows} />
      </div>

      <div className="min-w-0 lg:self-center">{board}</div>

      {/* Right rail (tablet landscape and desktop): turn, die, tray, log. */}
      <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex" aria-label="Game controls">
        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-surface p-4 shadow-raised">
          <TurnIndicator turn={turn} />
          {results ?? dice}
          {statusLine}
        </div>
        {railTray ? <div className="rounded-[var(--radius-card)] bg-surface p-3 shadow-raised">{railTray}</div> : null}
        <div className="xl:hidden">
          <PlayerPanel players={rows} />
        </div>
        <div className="flex min-h-[120px] flex-1 flex-col rounded-[var(--radius-card)] bg-surface p-3 shadow-raised">
          <GameActionFeed entries={game.recentHistory} revealedSeq={playback.revealedSeq} nameOf={nameOf} limit={14} />
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-3 shadow-raised xl:hidden">{roomInfo}</div>
      </aside>

      {/* Below the board on phones and tablet portrait: log and room. */}
      <div className="mt-4 flex flex-col gap-4 lg:hidden">
        <div className="rounded-[var(--radius-card)] bg-surface p-3 shadow-raised">
          <GameActionFeed entries={game.recentHistory} revealedSeq={playback.revealedSeq} nameOf={nameOf} limit={8} />
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-3 shadow-raised">{roomInfo}</div>
      </div>

      {/* Thumb zone (phones and tablet portrait). */}
      <MobileActionBar hideFrom="lg">
        {trayFor("grid")}
        {statusLine}
        {finished ? (
          <>
            <TurnIndicator turn={turn} compact />
            {results}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <TurnIndicator turn={turn} compact />
            </div>
            <DicePanel die={playback.die} identity={trayIdentity} canRoll={canRoll} rolling={rollPending} waitingLabel={waitingLabel} onRoll={() => void roll()} layout="thumb" />
          </div>
        )}
      </MobileActionBar>
    </div>
  );
}
