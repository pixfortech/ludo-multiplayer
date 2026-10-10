// The end of the game: trophy, winner, final standings and a summary taken
// only from the authoritative action log and final state. A confetti burst
// plays once, only when the end was seen live and motion is allowed; a
// refresh or reconnect shows the same screen without it. Actions are real:
// a new game, home, or back to the board. There is no rematch backend, so
// there is no "Play again".

import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { PlayerIdentity } from "@ludo/design-tokens";
import type { GameStateView } from "@ludo/shared-types";
import { formatDuration, summarise, type GameSummary } from "../../lib/gameSummary";
import { ordinal } from "../../lib/gameText";
import { Link, paths } from "../../lib/router";
import { useGame } from "../../state/gameClient";
import { CrownIcon, HomeIcon, PlusIcon } from "../ui/Icons";
import { PlayerToken } from "./PlayerToken";
import { Trophy } from "./Trophy";

const Confetti = lazy(() => import("./Confetti"));

interface VictoryScreenProps {
  game: GameStateView;
  me: string | null;
  nameOf: (id: string) => string;
  identityOf: (id: string) => PlayerIdentity;
  /** The end was just played live: celebrate (once). */
  celebrate: boolean;
  reduced: boolean;
  onViewBoard: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2.5">
      <dt className="text-[12px] font-medium text-ink-muted">{label}</dt>
      <dd className="tabular font-display text-[20px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function VictoryScreen({ game, me, nameOf, identityOf, celebrate, reduced, onViewBoard }: VictoryScreenProps) {
  const { client } = useGame();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  const winner = game.winnerId;
  const winnerIdentity = winner ? identityOf(winner) : null;
  const heading = winner ? (winner === me ? "You win!" : `${nameOf(winner)} wins!`) : "Game over";
  const fullRanking = game.settings.rankingMode === "full-ranking";

  // The summary comes from the room's complete, authoritative action log.
  useEffect(() => {
    let live = true;
    client
      .fullHistory()
      .then((actions) => live && setSummary(summarise(actions, game)))
      .catch(() => live && setHistoryFailed(true));
    return () => {
      live = false;
    };
  }, [client, game]);

  // Focus moves to the dialog's title so it is announced; Escape returns to the board.
  useEffect(() => {
    title.current?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onViewBoard();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Standings: the server's ranking first, then anyone not ranked (first-winner games), by tokens home.
  const standings = useMemo(() => {
    const ranked = game.ranking.length ? game.ranking : winner ? [winner] : [];
    const rest = game.players
      .filter((p) => !ranked.includes(p.id))
      .sort((a, b) => b.tokens.filter((t) => t.step === 56).length - a.tokens.filter((t) => t.step === 56).length)
      .map((p) => p.id);
    const rows: { id: string; place: number | null }[] = [...ranked.map((id, i) => ({ id, place: i + 1 })), ...rest.map((id) => ({ id, place: null }))];
    return rows;
  }, [game, winner]);
  const homeOf = (id: string) => game.players.find((p) => p.id === id)?.tokens.filter((t) => t.step === 56).length ?? 0;
  const capturesOf = (id: string) => summary?.players.find((p) => p.playerId === id)?.captures ?? null;
  const confettiColours = useMemo(() => (winnerIdentity ? [winnerIdentity.body, winnerIdentity.highlight, "#E3B341", "#F6F1E7", winnerIdentity.rim] : ["#E3B341", "#F6F1E7"]), [winnerIdentity]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(20,24,33,0.4)] backdrop-blur-[2px] sm:items-center sm:p-6" data-testid="victory-screen">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="animate-victory-in relative flex max-h-[min(88svh,100%)] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-overlay sm:max-h-[calc(100svh-48px)] sm:max-w-[680px] sm:rounded-[28px] phone-landscape:max-h-[100svh] phone-landscape:max-w-[720px]"
      >
        {celebrate && !reduced ? (
          <Suspense fallback={null}>
            <Confetti colours={confettiColours} />
          </Suspense>
        ) : null}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-6 sm:px-8 sm:pt-8">
          {/* Winner */}
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left phone-landscape:flex-row phone-landscape:text-left">
            {winnerIdentity ? <Trophy identity={winnerIdentity} size={104} /> : null}
            <div className="flex min-w-0 flex-col items-center gap-1.5 sm:items-start phone-landscape:items-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E3B341] bg-[#FFF6DC] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#5B4300]" data-testid="game-complete">
                <CrownIcon size={13} /> Game complete
              </span>
              <h2 id={titleId} ref={title} tabIndex={-1} className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.025em] text-ink outline-none sm:text-[42px]">
                {heading}
              </h2>
              {winner && winnerIdentity ? (
                <p className="flex items-center gap-2 text-[15px] text-ink-muted">
                  <PlayerToken identity={winnerIdentity} size={26} shadow={false} />
                  <span>
                    {winner === me ? "You" : nameOf(winner)} · {winnerIdentity.name} · all four tokens home
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Standings */}
          <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{fullRanking ? "Final ranking" : "Final standings"}</h3>
          <ol className="mt-2 flex flex-col gap-1.5" data-testid="victory-ranking" aria-label={fullRanking ? "Final ranking" : "Final standings"}>
            {standings.map(({ id, place }) => {
              const identity = identityOf(id);
              const caps = capturesOf(id);
              return (
                <li key={id} className="flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2" style={{ borderColor: place === 1 ? "#E3B341" : "#E2DCD1", background: place === 1 ? "#FFFBEF" : "#FFFFFF" }}>
                  <span className="tabular w-9 shrink-0 text-[14px] font-bold text-ink">{place ? ordinal(place) : "–"}</span>
                  <PlayerToken identity={identity} size={30} shadow={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {id === me ? "You" : nameOf(id)}
                      {place === 1 ? <CrownIcon size={14} className="ml-1.5 inline text-[#a77b0e]" aria-label="Winner" /> : null}
                    </span>
                    <span className="block text-[12px] text-ink-muted">
                      {identity.name} · {homeOf(id)}/4 home{caps !== null ? ` · ${caps} ${caps === 1 ? "capture" : "captures"}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {!fullRanking ? <p className="mt-2 text-[12px] text-ink-muted">First player home wins; other places are not ranked in this game.</p> : null}

          {/* Summary: only what the log shows */}
          {summary ? (
            <>
              <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Game summary</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="game-summary">
                {summary.durationMs !== null ? <Stat label="Duration" value={formatDuration(summary.durationMs)} /> : null}
                <Stat label="Turns" value={String(summary.turns)} />
                <Stat label="Captures" value={String(summary.captures)} />
                <Stat label="Tokens home" value={`${summary.tokensHome}/${game.players.length * 4}`} />
              </dl>
            </>
          ) : historyFailed ? null : (
            <p className="mt-6 text-[13px] text-ink-muted" role="status">
              Loading the game summary…
            </p>
          )}
        </div>

        {/* Actions: always visible, never clipped. */}
        <div className="flex flex-wrap gap-2 border-t border-border bg-surface px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8">
          <Link to={paths.create()} className="press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-ink px-5 text-[15px] font-semibold text-white">
            <PlusIcon size={18} /> New game
          </Link>
          <Link to={paths.home()} className="press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-5 text-[15px] font-semibold text-ink shadow-raised">
            <HomeIcon size={18} /> Return home
          </Link>
          <button type="button" onClick={onViewBoard} className="press inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] px-4 text-[15px] font-semibold text-ink-muted hover:text-ink">
            View board
          </button>
        </div>
      </div>
    </div>
  );
}
