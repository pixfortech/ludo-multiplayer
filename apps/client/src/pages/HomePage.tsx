import { useState, type FormEvent, type ReactNode } from "react";
import { BOARD_SHAPE_BY_PLAYER_COUNT, PLAYER_COUNTS, type PlayerCount } from "@ludo/shared-types";
import { BoardShapePreview } from "../components/brand/BoardShapePreview";
import { HeroBoard } from "../components/brand/HeroBoard";
import { RendererPreview } from "../components/brand/RendererPreview";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ArrowRightIcon, CrownIcon, CubeIcon, DiceIcon, EnterIcon, PlusIcon, ResumeIcon, SquareGridIcon, UsersIcon } from "../components/ui/Icons";
import { Segmented } from "../components/ui/Segmented";
import { formatRoomCode, isCompleteCode, normaliseCodeInput, relativeTime } from "../lib/format";
import { Link, paths, useRouter } from "../lib/router";
import { useGame } from "../state/gameClient";

function QuickJoin() {
  const { navigate } = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isCompleteCode(code)) {
      setError("Enter the 6-character room code, like ABC·234.");
      return;
    }
    navigate(paths.join(code));
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5" aria-label="Join with a room code">
      <label htmlFor="quick-code" className="text-sm font-semibold text-ink">
        Have a code?
      </label>
      <div className="flex gap-2">
        <input
          id="quick-code"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC·234"
          value={formatRoomCode(code)}
          onChange={(e) => {
            setCode(normaliseCodeInput(e.target.value));
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "quick-code-error" : undefined}
          className="tabular min-h-12 w-full min-w-0 rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[17px] font-semibold tracking-[0.08em] text-ink shadow-raised outline-none placeholder:font-medium placeholder:tracking-[0.08em] placeholder:text-ink-muted/60 focus:border-accent focus:shadow-[0_0_0_4px_rgba(31,95,214,0.14)]"
        />
        <button type="submit" aria-label="Find room" className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-ink shadow-raised hover:border-[#cfc7b8]">
          <ArrowRightIcon />
        </button>
      </div>
      {error ? (
        <p id="quick-code-error" role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function SavedGameBanner() {
  const { seats } = useGame();
  const latest = seats.list()[0];
  if (!latest) return null;
  return (
    <Link
      to={paths.lobby(latest.roomCode)}
      className="press group flex items-center gap-3 rounded-[var(--radius-card)] border border-[#c9d9f6] bg-[#f3f7fe] px-4 py-3 text-left hover:border-accent"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-raised">
        <ResumeIcon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Resume your game</span>
        <span className="block truncate text-[13px] text-ink-muted">
          Room <span className="tabular font-semibold tracking-[0.06em]">{formatRoomCode(latest.roomCode)}</span> as {latest.displayName} · {relativeTime(latest.savedAt)}
        </span>
      </span>
      <ArrowRightIcon className="text-accent transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Hero() {
  const { navigate } = useRouter();
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:px-10 lg:pb-16 lg:pt-12 xl:gap-20 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-[calc(100svh-64px-40px)]">
        <div className="flex flex-col gap-6 lg:gap-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="available" dot>
              Classic · 2–4 players · Live now
            </Badge>
            <Badge tone="upcoming">Up to 15 players coming</Badge>
          </div>
          <div className="flex flex-col gap-4">
            <h1 id="hero-title" className="font-display text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink min-[400px]:text-[42px] sm:text-[54px] lg:text-[60px] xl:text-[68px]">
              Ludo, beautifully
              <br className="hidden sm:block" /> played together.
            </h1>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-ink-muted sm:text-lg">
              Open a private table, share the code and play in real time. The server rolls every die fairly, and your seat waits for you if you drop out.
            </p>
          </div>
          <div className="flex flex-col gap-3 min-[460px]:flex-row">
            <Button variant="primary" size="lg" icon={<PlusIcon />} onClick={() => navigate(paths.create())} className="min-[460px]:min-w-[200px]">
              Create game
            </Button>
            <Button variant="secondary" size="lg" icon={<EnterIcon />} onClick={() => navigate(paths.join())} className="min-[460px]:min-w-[180px]">
              Join game
            </Button>
          </div>
          <div className="grid max-w-[34rem] gap-4">
            <QuickJoin />
            <SavedGameBanner />
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-ink-muted">
            <li className="inline-flex items-center gap-2">
              <DiceIcon size={16} /> Fair server dice
            </li>
            <li className="inline-flex items-center gap-2">
              <ResumeIcon size={16} /> Rooms auto-save
            </li>
            <li className="inline-flex items-center gap-2">
              <UsersIcon size={16} /> Phone, tablet or desktop
            </li>
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[460px] sm:max-w-[560px] lg:max-w-[min(680px,calc(100svh-150px))]">
          <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(255,255,255,0.95),rgba(255,255,255,0)_70%)]" />
          <div className="animate-float rounded-[32px] border border-white/70 bg-white/60 p-2.5 shadow-[0_30px_60px_-30px_rgba(20,24,33,0.35),0_8px_24px_rgba(20,24,33,0.08)] backdrop-blur-sm sm:p-3.5">
            <HeroBoard />
          </div>
          <p className="mt-4 text-center text-[13px] text-ink-muted">Tap a corner to trace its route home.</p>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</span>
      <h2 id={id} className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[38px]">
        {title}
      </h2>
      {children ? <p className="text-[17px] leading-relaxed text-ink-muted">{children}</p> : null}
    </div>
  );
}

const SHAPE_NAME = (n: PlayerCount) => (n <= 4 ? "Classic square" : `${BOARD_SHAPE_BY_PLAYER_COUNT[n][0]!.toUpperCase()}${BOARD_SHAPE_BY_PLAYER_COUNT[n].slice(1)}`);

function TableSection() {
  const { navigate } = useRouter();
  const [players, setPlayers] = useState<PlayerCount>(4);
  const [renderer, setRenderer] = useState<"2d" | "3d">("2d");
  const live = players <= 4;
  return (
    <section aria-labelledby="table-title" className="mx-auto w-full max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
      <SectionHeading id="table-title" eyebrow="Your table" title="Pick the table size">
        Classic Ludo seats 2 to 4 players today. Larger polygon boards for up to 15 are being built and are shown here as previews.
      </SectionHeading>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <Card className="flex flex-col gap-6 p-5 sm:p-7">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span id="count-label" className="text-sm font-semibold text-ink">
                Players
              </span>
              {live ? <Badge tone="available">Available now</Badge> : <Badge tone="development">In development</Badge>}
            </div>
            <div role="radiogroup" aria-labelledby="count-label" className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {PLAYER_COUNTS.map((n) => {
                const checked = n === players;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={`${n} players${n > 4 ? ", in development" : ""}`}
                    onClick={() => setPlayers(n)}
                    className={`press tabular relative flex min-h-11 items-center justify-center rounded-[10px] text-[15px] font-semibold ${
                      checked ? (n <= 4 ? "bg-accent text-white shadow-[0_4px_12px_-4px_rgba(31,95,214,0.6)]" : "bg-ink text-white") : n <= 4 ? "bg-[#eef3fd] text-[#1a4fb4] hover:bg-[#e2ebfb]" : "bg-[#f3f0ea] text-ink-muted hover:bg-[#ebe6dd]"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-ink-muted">Blue counts are playable now. Grey counts preview boards that are still in development.</p>
          </div>
          <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[240px]">
              <BoardShapePreview players={players} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="font-display text-2xl font-semibold text-ink">
                {SHAPE_NAME(players)} · {players} players
              </p>
              <p className="text-[15px] leading-relaxed text-ink-muted">
                {live
                  ? players === 2
                    ? "Two players sit opposite each other on the classic board. Every rule applies: sixes to enter, captures, safe stars and exact rolls home."
                    : `${players} players on the classic board, clockwise from the top left. Every traditional rule applies.`
                  : `A ${BOARD_SHAPE_BY_PLAYER_COUNT[players]} board with one corner per player and fair, equal paths. It is being designed now; it can't be played yet.`}
              </p>
              {live ? (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => navigate(paths.create())} className="self-start">
                  Create a {players}-player game
                </Button>
              ) : (
                <Button variant="secondary" disabled className="self-start">
                  Coming later
                </Button>
              )}
            </div>
          </div>
        </Card>
        <Card className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="w-full max-w-[260px]">
              <Segmented
                label="View"
                value={renderer}
                onChange={setRenderer}
                options={[
                  { value: "2d", label: <span className="inline-flex items-center gap-2"><SquareGridIcon size={16} />2D</span>, ariaLabel: "2D view" },
                  { value: "3d", label: <span className="inline-flex items-center gap-2"><CubeIcon size={16} />3D</span>, ariaLabel: "3D view preview, in development" },
                ]}
              />
            </div>
            {renderer === "2d" ? <Badge tone="accent">Arrives with the board</Badge> : <Badge tone="development">In development</Badge>}
          </div>
          <RendererPreview mode={renderer} />
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Both views will read the same board layout, colours and symbols, so you can switch at any time without changing the game.
          </p>
        </Card>
      </div>
    </section>
  );
}

const MODES: { title: string; body: string; status: "available" | "development" | "upcoming"; label: string; icon: ReactNode }[] = [
  { title: "Classic online", body: "2–4 players on their own devices, in a private room you open with a code. Every rule enforced by the server.", status: "available", label: "Available", icon: <UsersIcon /> },
  { title: "Expanded tables", body: "5–15 players on polygon boards with fair, equal paths for every seat.", status: "development", label: "In development", icon: <SquareGridIcon /> },
  { title: "3D tabletop", body: "The same game on a tactile 3D board, switchable at any moment.", status: "development", label: "In development", icon: <CubeIcon /> },
  { title: "Pass and play", body: "Everyone around one phone or tablet, with clear hand-offs between turns.", status: "upcoming", label: "Planned", icon: <DiceIcon /> },
];

function ModesSection() {
  return (
    <section aria-labelledby="modes-title" id="modes" className="scroll-mt-20 bg-white/50">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
        <SectionHeading id="modes-title" eyebrow="Game modes" title="Start classic. More tables are on the way." />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MODES.map((m) => (
            <li key={m.title}>
              <Card className={`flex h-full flex-col gap-4 p-5 sm:p-6 ${m.status === "available" ? "" : "bg-[#fdfcfa]"}`}>
                <div className="flex items-center justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] ${m.status === "available" ? "bg-[#e8effc] text-accent" : "bg-[#f3f0ea] text-ink-muted"}`}>{m.icon}</span>
                  <Badge tone={m.status} dot={m.status === "available"}>
                    {m.label}
                  </Badge>
                </div>
                <h3 className="font-display text-xl font-semibold text-ink">{m.title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{m.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS: { title: string; body: string; art: ReactNode }[] = [
  {
    title: "Roll a six to enter",
    body: "Tokens leave their base onto your coloured start square only on a six, and a six earns another roll.",
    art: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
        <rect x="6" y="6" width="36" height="36" rx="9" fill="#F6F1E7" stroke="#D8D0C2" />
        {[
          [16, 16],
          [16, 24],
          [16, 32],
          [32, 16],
          [32, 24],
          [32, 32],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill="#141821" />
        ))}
      </svg>
    ),
  },
  {
    title: "Race clockwise",
    body: "Move the rolled number of squares around the board. When more than one token can move, you choose.",
    art: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
        <circle cx="24" cy="24" r="15" fill="none" stroke="#D8D0C2" strokeWidth="5" />
        <path d="M24 9a15 15 0 0 1 15 15" fill="none" stroke="#1F5FD6" strokeWidth="5" strokeLinecap="round" />
        <path d="M34 22l5 4 4-5" fill="none" stroke="#1F5FD6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Capture and stay safe",
    body: "Land on an opponent to send them home and roll again. Starred squares and start squares are safe.",
    art: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
        <path d="M24 7l4.9 10 11 1.6-8 7.8 1.9 10.9L24 32.2l-9.8 5.1 1.9-10.9-8-7.8 11-1.6z" fill="#ECE6DC" stroke="#8E8676" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Exact roll home",
    body: "Enter your coloured lane and reach the centre with an exact roll. Getting a token home earns a bonus roll.",
    art: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
        <rect x="8" y="20" width="9" height="9" rx="2" fill="#E4E9F6" />
        <rect x="18" y="20" width="9" height="9" rx="2" fill="#B8C9EF" />
        <rect x="28" y="20" width="9" height="9" rx="2" fill="#7EA0E5" />
        <path d="M38 14v20l8-10z" fill="#1F5FD6" />
      </svg>
    ),
  },
  {
    title: "First home wins",
    body: "Bring all four tokens home first to win, or keep playing for a full ranking if the room is set that way.",
    art: (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fbf1df] text-[#a06a0a]">
        <CrownIcon size={26} />
      </span>
    ),
  },
];

function HowToPlay() {
  return (
    <section aria-labelledby="how-title" id="how-to-play" className="scroll-mt-20 mx-auto w-full max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
      <SectionHeading id="how-title" eyebrow="How to play" title="Simple to learn, hard to put down">
        Three sixes in a row forfeit the turn, and if only one token can move it moves for you.
      </SectionHeading>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Card className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                {step.art}
                <span className="tabular font-display text-[28px] font-semibold text-[#e2dcd1]">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{step.title}</h3>
              <p className="text-[15px] leading-relaxed text-ink-muted">{step.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <TableSection />
      <ModesSection />
      <HowToPlay />
    </>
  );
}
