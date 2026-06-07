import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { socket, connect } from "../socket";
import { Button, Card, Toast, FullscreenToggle } from "../components/ui";
import { PLAYER_PALETTE, PLAYABLE_COUNTS, MAX_VISUAL_PLAYERS, COLOR_LABEL, colorTokens } from "../theme";
import type { PlayerColor, RoomPreview } from "../types";
import PolygonBoardPreview from "../components/board/PolygonBoardPreview";
import { POLYGON_NAMES } from "../components/board/polygonLayout";
import { getPlayerId, loadName, saveName } from "../identity";

interface Props {
  onRoomJoined: (roomId: string, color: PlayerColor, notice?: string) => void;
}

const PLAYABLE = new Set<number>(PLAYABLE_COUNTS);
// The four colours the server can actually run today, in seat order.
const PLAYABLE_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];
const CODE_LENGTH = 6;

type PreviewStatus = "idle" | "loading" | "found" | "notfound";

export default function Home({ onRoomJoined }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [error, setError] = useState("");
  const [previewCount, setPreviewCount] = useState(6);
  const [name, setName] = useState(loadName());
  const [createColor, setCreateColor] = useState<PlayerColor | undefined>(undefined);
  const [joinColor, setJoinColor] = useState<PlayerColor | undefined>(undefined);
  const [roomPreview, setRoomPreview] = useState<RoomPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [joining, setJoining] = useState(false);

  // Refs so the once-registered socket listeners read current values.
  const joinCodeRef = useRef(joinCode);
  joinCodeRef.current = joinCode;
  const roomPreviewRef = useRef(roomPreview);
  roomPreviewRef.current = roomPreview;
  const requestedColorRef = useRef<PlayerColor | undefined>(undefined);
  const onRoomJoinedRef = useRef(onRoomJoined);
  onRoomJoinedRef.current = onRoomJoined;

  useEffect(() => {
    connect();

    socket.on("roomJoined", ({ roomId, color, reassigned }) => {
      let notice = "";
      if (reassigned) {
        const requested = requestedColorRef.current;
        const taker = roomPreviewRef.current?.players.find((p) => p.color === requested);
        notice =
          requested && taker
            ? `${COLOR_LABEL[requested]} is already taken by ${taker.name}. You're playing ${COLOR_LABEL[color]}.`
            : `That colour was taken — you're playing ${COLOR_LABEL[color]}.`;
      }
      onRoomJoinedRef.current(roomId, color, notice);
    });

    socket.on("roomInfo", ({ roomId, preview }) => {
      // Ignore responses for a code the user has since changed.
      if (roomId !== joinCodeRef.current.trim().toUpperCase()) return;
      setRoomPreview(preview);
      setPreviewStatus(preview ? "found" : "notfound");
    });

    socket.on("error", (msg) => {
      setError(msg);
      setJoining(false);
    });

    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("roomInfo");
      socket.off("error");
    };
  }, []);

  // Drop a create-colour preference that's no longer valid for the table size.
  useEffect(() => {
    if (createColor && PLAYABLE_COLORS.indexOf(createColor) >= maxPlayers) {
      setCreateColor(undefined);
    }
  }, [maxPlayers, createColor]);

  // Look up the room (debounced) once a full code is entered.
  useEffect(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== CODE_LENGTH) {
      setRoomPreview(null);
      setPreviewStatus("idle");
      return;
    }
    setPreviewStatus("loading");
    const t = setTimeout(() => socket.emit("getRoomInfo", code), 250);
    return () => clearTimeout(t);
  }, [joinCode]);

  // If the colour we wanted just got taken, fall back to Auto.
  useEffect(() => {
    if (joinColor && roomPreview && !roomPreview.availableColors.includes(joinColor)) {
      setJoinColor(undefined);
    }
  }, [roomPreview, joinColor]);

  function commitName(): string {
    const trimmed = name.trim();
    saveName(trimmed);
    return trimmed;
  }

  function handleCreate() {
    setError("");
    requestedColorRef.current = createColor;
    socket.emit("createRoom", maxPlayers, {
      playerId: getPlayerId(),
      name: commitName(),
      preferredColor: createColor,
    });
  }

  const code = joinCode.trim();
  const roomFull = roomPreview !== null && roomPreview.players.length >= roomPreview.maxPlayers;
  const roomStarted = roomPreview !== null && roomPreview.phase !== "waiting";
  // Enabled whenever a code is present, except when we're confident it can't be
  // joined (confirmed missing, full, or already started).
  const canJoin =
    code.length > 0 && !joining && !roomFull && !roomStarted && previewStatus !== "notfound";

  function handleJoin() {
    setError("");
    if (code.length === 0) {
      setError("Enter a room code to join.");
      return;
    }
    if (!canJoin) return;
    requestedColorRef.current = joinColor;
    setJoining(true);
    socket.emit("joinRoom", code.toUpperCase(), {
      playerId: getPlayerId(),
      name: commitName(),
      preferredColor: joinColor,
    });
    // Safety net: a navigation or error normally clears this far sooner.
    setTimeout(() => setJoining(false), 4000);
  }

  const joinLabel = joining
    ? "Joining…"
    : roomFull
      ? "Room is full"
      : roomStarted
        ? "Game in progress"
        : "Join room";

  const previewPlayable = previewCount <= 4;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
      {/* Top control row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
          Multiplayer
        </span>
        <FullscreenToggle showLabel />
      </div>

      {/* Hero */}
      <header className="flex animate-fade-in-up flex-col items-center text-center">
        <HeroArt />
        <h1 className="mt-1 bg-gradient-to-r from-rose-300 via-indigo-200 to-emerald-300 bg-clip-text font-display text-6xl font-extrabold tracking-tight text-transparent drop-shadow-sm sm:text-7xl">
          Ludo
        </h1>
        <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-400 sm:text-base">
          The classic board game, reimagined for real-time multiplayer. Roll fair
          dice, race your tokens home, and outplay your friends — anywhere.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Pill>⚡ Real-time</Pill>
          <Pill>🎲 Provably fair dice</Pill>
          <Pill>🔒 Private rooms</Pill>
        </div>
      </header>

      {error && (
        <div className="mx-auto w-full max-w-md">
          <Toast kind="error" onDismiss={() => setError("")}>
            {error}
          </Toast>
        </div>
      )}

      {/* Create + Join — side by side from tablet up, stacked on mobile */}
      <div className="grid items-start gap-5 md:grid-cols-2">
        {/* Create room */}
        <Card className="animate-fade-in-up p-6 [animation-delay:60ms]">
          <h2 className="mb-1 text-lg font-bold">Create a room</h2>
          <p className="mb-4 text-xs text-slate-400">
            Pick your table size and invite friends with the room code.
          </p>

          <NameField value={name} onChange={setName} />

          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Players
          </label>
          <div className="mb-5 flex flex-wrap gap-2">
            {countRange().map((n) => {
              const playable = PLAYABLE.has(n);
              const selected = playable && n === maxPlayers;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!playable}
                  onClick={() => playable && setMaxPlayers(n)}
                  title={playable ? `${n} players` : "Coming soon"}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                    selected
                      ? "scale-105 bg-indigo-500 text-white shadow-lg shadow-indigo-500/40"
                      : playable
                        ? "bg-white/10 text-white hover:bg-white/20"
                        : "cursor-not-allowed bg-white/[0.03] text-slate-600"
                  }`}
                >
                  {n}
                  {!playable && (
                    <span className="absolute -bottom-1.5 text-[7px] font-semibold uppercase tracking-wide text-slate-500">
                      soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preferred colour <span className="text-slate-600">· optional</span>
          </label>
          <ColorPicker
            value={createColor}
            onChange={setCreateColor}
            enabledCount={maxPlayers}
            className="mb-5"
          />

          <Button variant="primary" fullWidth onClick={handleCreate}>
            Create room
          </Button>
          <p className="mt-2.5 text-center text-[11px] text-slate-500">
            Live games support 2–4 players today.
          </p>
        </Card>

        {/* Join room */}
        <Card className="animate-fade-in-up p-6 [animation-delay:120ms]">
          <h2 className="mb-1 text-lg font-bold">Join a room</h2>
          <p className="mb-4 text-xs text-slate-400">
            Got a code from a friend? Drop it in below.
          </p>

          <NameField value={name} onChange={setName} />

          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Room code
          </label>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            placeholder="CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canJoin && handleJoin()}
            maxLength={CODE_LENGTH}
            inputMode="text"
            autoCapitalize="characters"
          />
          <JoinStatus status={previewStatus} preview={roomPreview} codeLength={code.length} />

          <label className="mb-2 mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preferred colour <span className="text-slate-600">· optional</span>
          </label>
          <JoinColorPicker value={joinColor} onChange={setJoinColor} preview={roomPreview} className="mb-5" />

          <Button variant="secondary" fullWidth onClick={handleJoin} disabled={!canJoin}>
            {joinLabel}
          </Button>
          <p className="mt-2.5 text-center text-[11px] text-slate-500">
            If your colour is taken, the next free one is assigned automatically.
          </p>
        </Card>
      </div>

      {/* Board Preview — full width */}
      <Card className="animate-fade-in-up p-6 [animation-delay:160ms]">
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-bold">Board preview</h2>
              <span className="rounded-full bg-indigo-500/20 px-2.5 py-1 text-[11px] font-semibold text-indigo-300">
                {POLYGON_NAMES[previewCount] ?? `${previewCount}-gon`}
              </span>
            </div>
            <p className="mb-4 max-w-md text-xs leading-relaxed text-slate-400">
              A look at how larger tables could be laid out.{" "}
              <span className="font-semibold text-slate-300">
                5–15 players is a visual preview only
              </span>{" "}
              — those boards can't be played yet. Live games remain classic 2–4
              player Ludo.
            </p>

            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Players
            </label>
            <div className="mb-3 flex flex-wrap gap-2">
              {countRange().map((n) => {
                const playable = PLAYABLE.has(n);
                const selected = n === previewCount;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPreviewCount(n)}
                    title={playable ? `${n} players` : "Visual preview"}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                      selected
                        ? "scale-105 bg-indigo-500 text-white shadow-lg shadow-indigo-500/40"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {n}
                    {!playable && (
                      <span className="absolute -bottom-1.5 text-[7px] font-semibold uppercase tracking-wide text-slate-500">
                        soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${previewPlayable ? "bg-emerald-400" : "bg-amber-400"}`} />
              {previewPlayable
                ? `${previewCount}-player games are playable now.`
                : `${previewCount}-player boards are a visual preview — coming soon.`}
            </p>
          </div>

          <div className="mx-auto aspect-square w-full max-w-[20rem] rounded-3xl bg-black/20 p-2 ring-1 ring-white/5">
            <PolygonBoardPreview playerCount={previewCount} />
          </div>
        </div>
      </Card>

      {/* Features — full width */}
      <section className="animate-fade-in-up [animation-delay:200ms]">
        <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-slate-400">
          Why you'll like it
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<LockIcon />} title="Create private rooms" accent="#6366f1">
            Spin up a room and share a short code. Only people with the code can join.
          </Feature>
          <Feature icon={<BoltIcon />} title="Real-time with friends" accent="#0ea5e9">
            Rolls, moves and captures sync instantly across every device in the room.
          </Feature>
          <Feature icon={<DiceIcon />} title="Server-authoritative dice" accent="#10b981">
            Every roll is computed on the server, so no client can fake the outcome.
          </Feature>
          <Feature icon={<PiecesIcon />} title="Classic 2–4 player rules" accent="#f43f5e">
            Safe cells, captures, exact home entry and roll-a-6-to-start — the full ruleset.
          </Feature>
          <Feature icon={<GridIcon />} title="2–15 board previews" accent="#a855f7">
            Preview polygon boards from a 2-player duel up to a 15-sided table.
          </Feature>
          <Feature icon={<DeviceIcon />} title="Works on any screen" accent="#f59e0b">
            A responsive, full-screen-ready board that scales from phone to desktop.
          </Feature>
        </div>
      </section>

      <p className="pb-2 text-center text-[11px] text-slate-600">
        Server-authoritative · Real-time multiplayer · Built with WebSockets
      </p>
    </main>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function countRange(): number[] {
  return Array.from({ length: MAX_VISUAL_PLAYERS - 1 }, (_, i) => i + 2);
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300">
      {children}
    </span>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        Your name
      </label>
      <input
        className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white placeholder:font-normal placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
        placeholder="Player"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={16}
        autoCapitalize="words"
      />
    </>
  );
}

/** Small "Auto = let the server choose" chip, shared by both pickers. */
function AutoChip({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-10 items-center rounded-2xl px-3 text-xs font-bold transition-all ${
        selected
          ? "bg-white/20 text-white ring-2 ring-white/40"
          : "bg-white/5 text-slate-400 hover:bg-white/10"
      }`}
    >
      Auto
    </button>
  );
}

/**
 * Create-room colour preference. Only colours playable at the current table
 * size are enabled; the rest are dimmed. "Auto" lets the server choose.
 */
function ColorPicker({
  value,
  onChange,
  enabledCount,
  className = "",
}: {
  value: PlayerColor | undefined;
  onChange: (c: PlayerColor | undefined) => void;
  enabledCount: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <AutoChip selected={value === undefined} onClick={() => onChange(undefined)} />
      {PLAYABLE_COLORS.map((c, i) => {
        const enabled = i < enabledCount;
        const selected = value === c;
        const t = colorTokens(c);
        return (
          <button
            key={c}
            type="button"
            disabled={!enabled}
            onClick={() => onChange(c)}
            title={enabled ? COLOR_LABEL[c] : "Needs a larger table"}
            aria-label={COLOR_LABEL[c]}
            aria-pressed={selected}
            className={`relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all ${
              selected ? `scale-105 ring-2 ${t.ring} ring-offset-2 ring-offset-slate-900` : ""
            } ${enabled ? "hover:scale-105" : "cursor-not-allowed opacity-25"}`}
            style={{ backgroundColor: t.hex }}
          >
            {selected && <CheckIcon />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Join-room colour preference, driven by the live room preview: free colours
 * are selectable; taken ones are disabled and labelled with their owner.
 */
function JoinColorPicker({
  value,
  onChange,
  preview,
  className = "",
}: {
  value: PlayerColor | undefined;
  onChange: (c: PlayerColor | undefined) => void;
  preview: RoomPreview | null;
  className?: string;
}) {
  const takenBy = new Map<PlayerColor, string>();
  preview?.players.forEach((p) => takenBy.set(p.color, p.name));
  const available = new Set(preview?.availableColors ?? []);
  const colors = preview ? PLAYABLE_COLORS.slice(0, preview.maxPlayers) : [];

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <AutoChip selected={value === undefined} onClick={() => onChange(undefined)} />
        {colors.map((c) => {
          const taker = takenBy.get(c);
          const free = available.has(c);
          const selected = value === c;
          const t = colorTokens(c);
          return (
            <button
              key={c}
              type="button"
              disabled={!free}
              onClick={() => free && onChange(c)}
              title={free ? COLOR_LABEL[c] : `Taken by ${taker}`}
              aria-pressed={selected}
              className={`flex h-10 items-center gap-2 rounded-2xl px-3 text-xs font-semibold transition-all ${
                selected
                  ? `bg-white/10 text-white ring-2 ${t.ring}`
                  : free
                    ? "bg-white/5 text-white hover:bg-white/10"
                    : "cursor-not-allowed bg-white/[0.03] text-slate-500 opacity-70"
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: t.hex }} />
              <span>{COLOR_LABEL[c]}</span>
              {taker && <span className="text-slate-500">— {taker}</span>}
            </button>
          );
        })}
      </div>
      {!preview && (
        <p className="text-[11px] text-slate-500">
          Enter a valid room code to see which colours are free.
        </p>
      )}
    </div>
  );
}

/** Inline status line under the room-code input. */
function JoinStatus({
  status,
  preview,
  codeLength,
}: {
  status: PreviewStatus;
  preview: RoomPreview | null;
  codeLength: number;
}) {
  if (codeLength === 0) return null;
  if (status === "loading") {
    return <p className="mt-2 text-[11px] font-medium text-slate-400">Checking room…</p>;
  }
  if (status === "notfound") {
    return <p className="mt-2 text-[11px] font-semibold text-rose-300">Room not found. Check the code and try again.</p>;
  }
  if (status === "found" && preview) {
    const full = preview.players.length >= preview.maxPlayers;
    const started = preview.phase !== "waiting";
    if (started) return <p className="mt-2 text-[11px] font-semibold text-amber-300">This game has already started.</p>;
    if (full) return <p className="mt-2 text-[11px] font-semibold text-amber-300">This room is full.</p>;
    return (
      <p className="mt-2 text-[11px] font-semibold text-emerald-300">
        Room found · {preview.players.length}/{preview.maxPlayers} players · {preview.availableColors.length} colour
        {preview.availableColors.length === 1 ? "" : "s"} open
      </p>
    );
  }
  return null;
}

function Feature({
  icon,
  title,
  children,
  accent,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  accent: string;
}) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ring-white/10"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{children}</p>
        </div>
      </div>
    </div>
  );
}

// ── decorative hero vector ───────────────────────────────────────────────────

function HeroArt() {
  return (
    <div className="relative h-24 w-full max-w-xs animate-float">
      <svg viewBox="0 0 220 110" className="h-full w-full" aria-hidden>
        {PLAYER_PALETTE.slice(0, 4).map((hex, i) => {
          const x = 30 + i * 52;
          const y = i % 2 === 0 ? 26 : 84;
          return (
            <g key={hex}>
              <circle cx={x} cy={y} r={11} fill={hex} opacity={0.95} />
              <circle cx={x} cy={y} r={5} fill="white" opacity={0.35} />
            </g>
          );
        })}
        <g transform="translate(86 30)">
          <rect width="48" height="48" rx="12" fill="white" />
          <rect width="48" height="48" rx="12" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
          {[
            [13, 13], [35, 13],
            [24, 24],
            [13, 35], [35, 35],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={4} fill="#0f172a" />
          ))}
        </g>
      </svg>
    </div>
  );
}

// ── inline icons (lightweight vectors, no external assets) ────────────────────

const ICON = "h-5 w-5";
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}
function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PiecesIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <circle cx="12" cy="7" r="3" />
      <path d="M7 20c0-3 2.2-5 5-5s5 2 5 5" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <path d="M12 3 21 9v6l-9 6-9-6V9l9-6Z" />
      <path d="M12 3v18M3 9l9 3 9-3" />
    </svg>
  );
}
function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} {...STROKE} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
