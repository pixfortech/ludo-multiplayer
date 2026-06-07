import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { socket, connect } from "../socket";
import { Button, Card, Toast, FullscreenToggle } from "../components/ui";
import { PLAYER_PALETTE, PLAYABLE_COUNTS, MAX_VISUAL_PLAYERS } from "../theme";
import type { PlayerColor } from "../types";
import PolygonBoardPreview from "../components/board/PolygonBoardPreview";
import { POLYGON_NAMES } from "../components/board/polygonLayout";

interface Props {
  onRoomJoined: (roomId: string, color: PlayerColor) => void;
}

const PLAYABLE = new Set<number>(PLAYABLE_COUNTS);

export default function Home({ onRoomJoined }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [error, setError] = useState("");
  const [previewCount, setPreviewCount] = useState(6);

  useEffect(() => {
    connect();
    socket.on("roomJoined", ({ roomId, color }) => onRoomJoined(roomId, color));
    socket.on("error", (msg) => setError(msg));
    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("error");
    };
  }, [onRoomJoined]);

  function handleCreate() {
    setError("");
    socket.emit("createRoom", maxPlayers);
  }

  function handleJoin() {
    setError("");
    if (joinCode.trim().length === 0) {
      setError("Enter a room code to join.");
      return;
    }
    socket.emit("joinRoom", joinCode.trim());
  }

  const previewPlayable = previewCount <= 4;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-7 px-5 py-8 sm:max-w-2xl sm:py-12">
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
        <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-400">
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
        <Toast kind="error" onDismiss={() => setError("")}>
          {error}
        </Toast>
      )}

      {/* Create room */}
      <Card className="animate-fade-in-up p-6 [animation-delay:60ms]">
        <h2 className="mb-1 text-lg font-bold">Create a room</h2>
        <p className="mb-4 text-xs text-slate-400">
          Pick your table size and invite friends with the room code.
        </p>

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

        <input
          className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
          placeholder="CODE"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          maxLength={6}
          inputMode="text"
          autoCapitalize="characters"
        />

        <Button variant="secondary" fullWidth onClick={handleJoin}>
          Join room
        </Button>
      </Card>

      {/* Features */}
      <section className="animate-fade-in-up [animation-delay:160ms]">
        <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-slate-400">
          Why you'll like it
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feature icon={<LockIcon />} title="Create private rooms" accent="#6366f1">
            Spin up a room and share a short code. Only people with the code can join.
          </Feature>
          <Feature icon={<BoltIcon />} title="Play with friends in real time" accent="#0ea5e9">
            Rolls, moves and captures sync instantly across every device in the room.
          </Feature>
          <Feature icon={<DiceIcon />} title="Server-authoritative fair dice" accent="#10b981">
            Every roll is computed on the server, so no client can fake the outcome.
          </Feature>
          <Feature icon={<PiecesIcon />} title="Classic 2–4 player gameplay" accent="#f43f5e">
            Safe cells, captures, exact home entry and roll-a-6-to-start — the full ruleset.
          </Feature>
          <Feature icon={<GridIcon />} title="2–15 visual board previews" accent="#a855f7" wide>
            Preview polygon boards from a 2-player duel all the way up to a 15-sided table.
          </Feature>
        </div>
      </section>

      {/* Board Preview */}
      <Card className="animate-fade-in-up p-6 [animation-delay:200ms]">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">Board preview</h2>
          <span className="shrink-0 rounded-full bg-indigo-500/20 px-2.5 py-1 text-[11px] font-semibold text-indigo-300">
            {POLYGON_NAMES[previewCount] ?? `${previewCount}-gon`}
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          A look at how larger tables could be laid out. <span className="font-semibold text-slate-300">5–15 players is a
          visual preview only</span> — those boards can't be played yet. Live games
          remain classic 2–4 player Ludo.
        </p>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Players
        </label>
        <div className="mb-5 flex flex-wrap gap-2">
          {countRange().map((n) => {
            const playable = PLAYABLE.has(n);
            const selected = n === previewCount;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setPreviewCount(n)}
                title={playable ? `${n} players` : "Visual preview"}
                className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
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

        <div className="mx-auto aspect-square w-full max-w-[18rem] rounded-3xl bg-black/20 p-2 ring-1 ring-white/5 sm:max-w-sm">
          <PolygonBoardPreview playerCount={previewCount} />
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${previewPlayable ? "bg-emerald-400" : "bg-amber-400"}`} />
          {previewPlayable
            ? `${previewCount}-player games are playable now.`
            : `${previewCount}-player boards are a visual preview — coming soon.`}
        </p>
      </Card>

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

function Feature({
  icon,
  title,
  children,
  accent,
  wide = false,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  accent: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`group rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06] ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
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
        {/* orbiting tokens */}
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
        {/* centre dice tile showing a 5 */}
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

// ── inline feature icons (lightweight vectors, no external assets) ────────────

const ICON = "h-5 w-5";
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

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
