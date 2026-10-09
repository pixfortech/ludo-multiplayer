import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPlayerView, RoomView } from "@ludo/shared-types";
import { ClassicBoardArt } from "../components/brand/ClassicBoardArt";
import { GameScreen } from "../components/game/GameScreen";
import { PlayerToken } from "../components/game/PlayerToken";
import { RoomCodeCard } from "../components/game/RoomCodeCard";
import { MobileActionBar } from "../components/layout/MobileActionBar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConnectionPill } from "../components/ui/ConnectionPill";
import { CrownIcon, EnterIcon, LeaveIcon, ResumeIcon, SparkIcon } from "../components/ui/Icons";
import { Spinner } from "../components/ui/Spinner";
import { useToasts } from "../components/ui/Toasts";
import type { Notice } from "../lib/connection";
import { errorCode, friendlyError } from "../lib/errors";
import { SEAT_CORNERS, formatRoomCode } from "../lib/format";
import { identityFor } from "../lib/identities";
import { Link, paths, useRouter } from "../lib/router";
import type { StoredSeat } from "../lib/session";
import { useConnectionState, useGame } from "../state/gameClient";

type Phase =
  | { kind: "resolving"; seat: StoredSeat | null }
  | { kind: "no-seat" }
  | { kind: "choose"; seats: StoredSeat[] }
  | { kind: "in-use"; seat: StoredSeat }
  | { kind: "unavailable"; message: string; forget: boolean }
  | { kind: "ready" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LIFECYCLE: Record<RoomView["lifecycle"], { label: string; tone: "available" | "development" | "upcoming" | "neutral" | "accent" }> = {
  waiting: { label: "Waiting for players", tone: "upcoming" },
  ready: { label: "Ready to start", tone: "available" },
  playing: { label: "Game in progress", tone: "accent" },
  paused: { label: "Paused", tone: "development" },
  finished: { label: "Finished", tone: "neutral" },
  abandoned: { label: "Closed", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

function noticeToast(notice: Notice): { tone: "info" | "success" | "error"; title: string; body?: string } | null {
  switch (notice.kind) {
    case "player-joined":
      return { tone: "success", title: `${notice.name} joined` };
    case "player-left":
      return { tone: "info", title: `${notice.name} left the room` };
    case "player-disconnected":
      return { tone: "info", title: `${notice.name} lost connection`, body: "Their seat is kept for them." };
    case "player-connected":
      return { tone: "success", title: `${notice.name} is back` };
    case "host-changed":
      return { tone: "info", title: notice.isYou ? "You're the host now" : `${notice.name} is now the host` };
    case "game-started":
      return { tone: "success", title: "The game has started" };
    case "room-closed":
      return { tone: "info", title: "The host closed this room" };
    case "game-paused":
      return { tone: "info", title: "Game paused", body: notice.reason === "host" ? "The host paused the game." : "Waiting for a player to reconnect." };
    case "game-resumed":
      return { tone: "success", title: "Game resumed" };
    case "seat-restored":
      return { tone: "success", title: "Reconnected", body: "Your seat is back." };
    case "session-ended":
      return notice.reason === "replaced" ? { tone: "info", title: "Continued in another tab", body: "This tab no longer controls your seat." } : null;
  }
}

function PlayerSlot({ player, you, host, index }: { player: RoomPlayerView; you: boolean; host: boolean; index: number }) {
  const identity = identityFor(player.colour);
  const away = player.connectionStatus !== "connected";
  return (
    <li className="animate-slot-in" style={{ animationDelay: `${index * 40}ms` }}>
      <div className={`flex min-h-[76px] items-center gap-3.5 rounded-[var(--radius-card)] border bg-surface px-3.5 py-3 ${you ? "border-[#c9d9f6] shadow-[0_0_0_3px_rgba(31,95,214,0.08)]" : "border-border"}`}>
        <div className="relative">
          <PlayerToken identity={identity} size={48} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-white ${away ? "bg-[#b9b2a5]" : "animate-pulse-dot bg-success"}`}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <span className="truncate">{player.displayName}</span>
            {you ? <Badge tone="accent">You</Badge> : null}
            {host ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#a06a0a]" title="Host">
                <CrownIcon size={14} /> Host
              </span>
            ) : null}
          </p>
          <p className="text-[13px] text-ink-muted">
            {identity.name} · {SEAT_CORNERS[player.seat] ?? `Seat ${player.seat + 1}`}
          </p>
        </div>
        <span className={`shrink-0 text-[12px] font-semibold ${away ? "text-ink-muted" : "text-success"}`}>{away ? "Away" : "Online"}</span>
      </div>
    </li>
  );
}

function EmptySlot() {
  return (
    <li>
      <div className="flex min-h-[76px] items-center gap-3.5 rounded-[var(--radius-card)] border border-dashed border-[#d6cfc2] bg-[#faf8f5] px-3.5 py-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-[#d6cfc2]" aria-hidden="true">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#cbc3b5]" />
        </span>
        <p className="text-[15px] font-medium text-ink-muted">Waiting for a player…</p>
      </div>
    </li>
  );
}

function SettingsList({ room }: { room: RoomView }) {
  const rows: [string, string][] = [
    ["Game", "Classic"],
    ["Players", `${room.maxPlayers}`],
    ["Auto-move", room.settings.autoMove ? "On" : "Off"],
    ["Game ends", room.settings.rankingMode === "winner-only" ? "First player home" : "Full ranking"],
    ["Rules", "Traditional"],
  ];
  return (
    <dl className="flex flex-col divide-y divide-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-[14px] text-ink-muted">{k}</dt>
          <dd className="text-right text-[14px] font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LobbyPage({ code }: { code: string }) {
  const { client, seats, tab } = useGame();
  const state = useConnectionState();
  const { navigate } = useRouter();
  const toasts = useToasts();
  const [phase, setPhase] = useState<Phase>(() => (client.getState().seat?.roomCode === code ? { kind: "ready" } : { kind: "resolving", seat: null }));
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const attemptRef = useRef(0);

  const attempt = useCallback(
    async (seat: StoredSeat, options: { takeover?: boolean; quietRetries?: number } = {}) => {
      const run = ++attemptRef.current;
      setPhase({ kind: "resolving", seat });
      for (let i = 0; ; i++) {
        try {
          await client.resume({ playerId: seat.playerId, secret: seat.secret }, { takeover: options.takeover ?? false });
          if (run !== attemptRef.current) return;
          tab.set({ roomCode: seat.roomCode, playerId: seat.playerId });
          seats.save({ roomCode: seat.roomCode, playerId: seat.playerId, secret: seat.secret, displayName: seat.displayName, roomName: seat.roomName });
          setPhase({ kind: "ready" });
          if (options.takeover) toasts.push({ tone: "success", title: "Playing in this tab", body: "Your other tab was disconnected from the seat." });
          return;
        } catch (error) {
          if (run !== attemptRef.current) return;
          const code = errorCode(error);
          // Right after a refresh the old connection may not be closed yet: give it a moment.
          if (code === "session-in-use" && i < (options.quietRetries ?? 0)) {
            await sleep(400);
            continue;
          }
          if (code === "session-in-use") setPhase({ kind: "in-use", seat });
          else if (code === "session-expired" || code === "unauthenticated") {
            seats.remove(seat.roomCode, seat.playerId);
            if (tab.get()?.playerId === seat.playerId) tab.clear();
            setPhase({ kind: "unavailable", message: friendlyError(error), forget: true });
          } else setPhase({ kind: "unavailable", message: friendlyError(error), forget: false });
          return;
        }
      }
    },
    [client, seats, tab, toasts],
  );

  // Work out which saved seat this tab should resume.
  useEffect(() => {
    if (client.getState().seat?.roomCode === code) {
      setPhase({ kind: "ready" });
      return;
    }
    const candidates = seats.forRoom(code);
    const marker = tab.get();
    const mine = marker?.roomCode === code ? candidates.find((s) => s.playerId === marker.playerId) : undefined;
    if (mine) void attempt(mine, { quietRetries: 5 });
    else if (candidates.length === 1) void attempt(candidates[0]!);
    else if (candidates.length > 1) setPhase({ kind: "choose", seats: candidates });
    else setPhase({ kind: "no-seat" });
    return () => {
      // A counter, not a DOM ref: moving it on invalidates any resume attempt still in flight.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      attemptRef.current++;
    };
  }, [code, client, seats, tab, attempt]);

  // Lobby notifications. During a game the game screen shows them in its own status line.
  useEffect(() => client.onNotice((notice) => {
    const inGame = Boolean(client.getState().game) && client.getState().room?.status !== "lobby";
    const toast = inGame && notice.kind !== "room-closed" && notice.kind !== "session-ended" ? null : noticeToast(notice);
    if (toast) toasts.push(toast);
  }), [client, toasts]);

  // Another tab or device took this seat over.
  useEffect(() => {
    if (phase.kind === "ready" && state.ended === "replaced") {
      const seat = seats.forRoom(code).find((s) => s.playerId === tab.get()?.playerId) ?? seats.forRoom(code)[0];
      if (seat) setPhase({ kind: "in-use", seat });
    }
  }, [state.ended, phase.kind, seats, tab, code]);

  // Removed from the room, or the room was archived: the stored credential is no longer any use.
  useEffect(() => {
    if (phase.kind !== "ready" || leaving || (state.ended !== "left" && state.ended !== "expired")) return;
    const marker = tab.get();
    if (marker?.roomCode === code) {
      seats.remove(marker.roomCode, marker.playerId);
      tab.clear();
    }
    setPhase({ kind: "unavailable", message: state.ended === "expired" ? "This room has closed after a long time without play." : "You're no longer in this room.", forget: false });
  }, [state.ended, phase.kind, leaving, seats, tab, code]);

  if (phase.kind !== "ready" || !state.room || state.room.code !== code) {
    return <LobbyGate phase={phase} code={code} onResume={attempt} />;
  }

  const room = state.room;
  const me = room.players.find((p) => p.playerId === state.seat?.playerId);
  const isHost = room.hostPlayerId === state.seat?.playerId;
  const host = room.players.find((p) => p.playerId === room.hostPlayerId);
  const lifecycle = LIFECYCLE[room.lifecycle];
  const inLobby = room.status === "lobby";
  const openSlots = Math.max(0, room.maxPlayers - room.players.length);
  const occupiedSeats = room.players.map((p) => p.seat);

  const start = async () => {
    setStarting(true);
    try {
      await client.startGame();
    } catch (error) {
      toasts.push({ tone: "error", title: "Couldn't start the game", body: friendlyError(error) });
    } finally {
      setStarting(false);
    }
  };

  const leave = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      setTimeout(() => setConfirmLeave(false), 4000);
      return;
    }
    setLeaving(true);
    try {
      const seat = state.seat;
      await client.leaveRoom();
      if (seat) seats.remove(seat.roomCode, seat.playerId);
      tab.clear();
      toasts.push({ tone: "info", title: "You left the room" });
      navigate(paths.home());
    } catch (error) {
      toasts.push({ tone: "error", title: "Couldn't leave the room", body: friendlyError(error) });
      setLeaving(false);
      setConfirmLeave(false);
    }
  };

  if (!inLobby && state.game) {
    return <GameScreen state={{ ...state, room, game: state.game }} onLeave={leave} leaving={leaving} confirmLeave={confirmLeave} />;
  }

  const currentTurn = state.game?.currentPlayerId ? room.players.find((p) => p.playerId === state.game!.currentPlayerId) : null;

  const primaryAction = inLobby ? (
    isHost ? (
      <Button variant="primary" size="lg" block loading={starting} disabled={!room.canStart} icon={<SparkIcon />} onClick={start}>
        {room.canStart ? `Start game · ${room.players.length} players` : "Start game"}
      </Button>
    ) : (
      <div className="flex min-h-14 items-center justify-center gap-3 rounded-[var(--radius-control)] bg-[#f6f3ee] px-4 text-[15px] font-semibold text-ink-muted" role="status">
        <Spinner size={18} /> Waiting for {host?.displayName ?? "the host"} to start
      </div>
    )
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-[calc(var(--action-bar-h,0px)+24px)] pt-6 sm:px-6 md:pb-16 lg:px-10 lg:pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lifecycle.tone} dot>
              {lifecycle.label}
            </Badge>
            <ConnectionPill status={state.link} />
          </div>
          <h1 className="truncate font-display text-[30px] font-semibold tracking-[-0.02em] text-ink sm:text-[38px]">{room.name ?? `Room ${formatRoomCode(room.code)}`}</h1>
          <p className="text-[15px] text-ink-muted">
            {host ? (
              <span className="inline-flex items-center gap-1.5">
                <CrownIcon size={15} /> Hosted by {isHost ? "you" : host.displayName}
              </span>
            ) : null}
            {me ? ` · You're ${identityFor(me.colour).name}, ${SEAT_CORNERS[me.seat]!.toLowerCase()}` : null}
          </p>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)] lg:gap-8 xl:grid-cols-[minmax(0,1.3fr)_400px_minmax(0,0.8fr)]">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">Players</h2>
            <span className="tabular text-[15px] font-semibold text-ink-muted">
              {room.players.length}/{room.maxPlayers}
            </span>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Seats">
            {[...room.players]
              .sort((a, b) => a.seat - b.seat)
              .map((p, i) => (
                <PlayerSlot key={p.playerId} player={p} you={p.playerId === state.seat?.playerId} host={p.playerId === room.hostPlayerId} index={i} />
              ))}
            {inLobby ? Array.from({ length: openSlots }, (_, i) => <EmptySlot key={`empty-${i}`} />) : null}
          </ul>
          {inLobby && openSlots > 0 ? <p className="text-[13px] text-ink-muted">{isHost ? "You can start once at least two players are here, or wait for a full table." : "The host starts the game when everyone is ready."}</p> : null}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5 sm:p-6">
            <RoomCodeCard code={room.code} />
            <p className="mt-3 text-[13px] text-ink-muted">Friends can join with this code, or open the invite link on any device.</p>
          </Card>
          {inLobby ? (
            <Card className="hidden flex-col gap-3 p-5 sm:p-6 md:flex">
              {primaryAction}
              <Button variant={confirmLeave ? "danger" : "ghost"} block loading={leaving} icon={<LeaveIcon size={18} />} onClick={leave}>
                {confirmLeave ? "Tap again to leave" : "Leave room"}
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col gap-3 p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">{room.status === "playing" || room.status === "paused" ? "Game in progress" : lifecycle.label}</h2>
              {currentTurn ? (
                <p className="flex items-center gap-2.5 text-[15px] text-ink">
                  <PlayerToken identity={identityFor(currentTurn.colour)} size={28} shadow={false} />
                  {currentTurn.playerId === state.seat?.playerId ? "It's your turn" : `It's ${currentTurn.displayName}'s turn`}
                </p>
              ) : null}
              <p className="text-[14px] leading-relaxed text-ink-muted">The game board arrives in the next update. Your seat and the game are saved; you can return here at any time.</p>
              <Link to={paths.home()} className="press inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[15px] font-semibold text-ink shadow-raised">
                Back to home
              </Link>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1">
          <Card className="grid gap-5 p-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:p-6 xl:grid-cols-1">
            <div className="mx-auto w-full max-w-[240px]">
              <ClassicBoardArt
                activeSeats={occupiedSeats.length ? occupiedSeats : [0]}
                pieces={room.players.flatMap((p) => [0, 1, 2, 3].map((slot) => ({ key: `${p.playerId}-${slot}`, seat: p.seat, step: null, slot })))}
                liftedSeat={me?.seat ?? null}
                title="Your table: each player's tokens wait in their corner"
              />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-semibold text-ink">Table settings</h2>
              <SettingsList room={room} />
              <p className="text-[13px] leading-relaxed text-ink-muted">A six to enter, captures send tokens home, starred squares are safe, and tokens need an exact roll to reach home.</p>
            </div>
          </Card>
        </div>
      </div>

      {inLobby ? (
        <MobileActionBar>
          {primaryAction}
          <Button variant={confirmLeave ? "danger" : "ghost"} block loading={leaving} icon={<LeaveIcon size={18} />} onClick={leave}>
            {confirmLeave ? "Tap again to leave" : "Leave room"}
          </Button>
        </MobileActionBar>
      ) : null}
    </div>
  );
}

function LobbyGate({ phase, code, onResume }: { phase: Phase; code: string; onResume: (seat: StoredSeat, options?: { takeover?: boolean }) => void }) {
  const { navigate } = useRouter();
  const wrap = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-4 py-12 sm:py-20">
      <Card className="flex flex-col gap-5 p-6 text-center sm:p-8">{children}</Card>
    </div>
  );
  switch (phase.kind) {
    case "resolving":
    case "ready":
      return wrap(
        <div className="flex flex-col items-center gap-3 py-6" role="status">
          <Spinner size={28} />
          <p className="text-[16px] font-semibold text-ink">Opening room {formatRoomCode(code)}…</p>
          <p className="text-[14px] text-ink-muted">Restoring your seat from the server.</p>
        </div>,
      );
    case "no-seat":
      return wrap(
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">You're not in this room yet</h1>
          <p className="text-[15px] text-ink-muted">This browser has no saved seat for room {formatRoomCode(code)}.</p>
          <Button variant="primary" size="lg" icon={<EnterIcon />} onClick={() => navigate(paths.join(code))}>
            Join room {formatRoomCode(code)}
          </Button>
        </>,
      );
    case "choose":
      return wrap(
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Which seat is this tab?</h1>
          <p className="text-[15px] text-ink-muted">This browser holds more than one seat in room {formatRoomCode(code)}.</p>
          <div className="flex flex-col gap-2">
            {phase.seats.map((seat) => (
              <Button key={seat.playerId} variant="secondary" size="lg" icon={<ResumeIcon size={18} />} onClick={() => onResume(seat)}>
                Continue as {seat.displayName}
              </Button>
            ))}
          </div>
        </>,
      );
    case "in-use":
      return wrap(
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">This seat is open elsewhere</h1>
          <p className="text-[15px] text-ink-muted">
            {phase.seat.displayName}'s seat in room {formatRoomCode(code)} is active in another tab or device. Continue here, and that one will be disconnected from the seat.
          </p>
          <Button variant="primary" size="lg" icon={<ResumeIcon size={18} />} onClick={() => onResume(phase.seat, { takeover: true })}>
            Continue here as {phase.seat.displayName}
          </Button>
          <Button variant="ghost" onClick={() => navigate(paths.home())}>
            Not now
          </Button>
        </>,
      );
    case "unavailable":
      return wrap(
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Can't open this room</h1>
          <p className="text-[15px] text-ink-muted">{phase.message}</p>
          <Button variant="primary" onClick={() => navigate(paths.home())}>
            Back to home
          </Button>
        </>,
      );
  }
}
