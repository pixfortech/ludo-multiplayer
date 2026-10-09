import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, paths, useRouter } from "../../lib/router";
import { useGame } from "../../state/gameClient";
import { Wordmark } from "../brand/Wordmark";
import { CloseIcon, MenuIcon, PlusIcon } from "../ui/Icons";

const SECTION_LINKS = [
  { href: "/#how-to-play", label: "How to play" },
  { href: "/#modes", label: "Game modes" },
];

/** Lets a page (the game screen) take the full viewport height: no footer. */
const ImmersiveContext = createContext<(on: boolean) => void>(() => undefined);

export function useImmersiveShell(): void {
  const setImmersive = useContext(ImmersiveContext);
  useEffect(() => {
    setImmersive(true);
    return () => setImmersive(false);
  }, [setImmersive]);
}

function NavAnchor({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
  const { navigate, route } = useRouter();
  return (
    <a
      href={href}
      onClick={(event) => {
        onNavigate?.();
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        const hash = href.split("#")[1]!;
        const go = () => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (route.name !== "home") {
          navigate("/");
          requestAnimationFrame(() => requestAnimationFrame(go));
        } else go();
      }}
      className="press rounded-full px-3.5 py-2 text-[15px] font-medium text-ink-muted hover:bg-ink/[0.05] hover:text-ink"
    >
      {label}
    </a>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { route } = useRouter();
  const { seats } = useGame();
  const [menuOpen, setMenuOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const saved = seats.list().length;

  useEffect(() => setMenuOpen(false), [route]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const resumeLink = (
    <Link to={paths.resume()} className="press relative inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-[15px] font-medium text-ink-muted hover:bg-ink/[0.05] hover:text-ink">
      Resume
      {saved > 0 ? (
        <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white" aria-label={`${saved} saved`}>
          {saved}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/80 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link to={paths.home()} aria-label="Ludo home" className="press -ml-1 rounded-xl p-1">
            <Wordmark size={34} />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {SECTION_LINKS.map((l) => (
              <NavAnchor key={l.href} {...l} />
            ))}
            {resumeLink}
            <Link to={paths.join()} className="press inline-flex min-h-11 items-center rounded-full px-3.5 text-[15px] font-medium text-ink-muted hover:bg-ink/[0.05] hover:text-ink">
              Join
            </Link>
            <Link
              to={paths.create()}
              className="press ml-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(20,24,33,0.2)] hover:bg-[#262c3b]"
            >
              <PlusIcon size={18} />
              Create game
            </Link>
          </nav>
          <button type="button" aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((o) => !o)} className="press flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-ink/5 md:hidden">
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
        {menuOpen ? (
          <div id="mobile-menu" className="animate-fade-up border-t border-border bg-surface px-4 pb-5 pt-3 shadow-overlay md:hidden">
            <nav aria-label="Menu" className="flex flex-col gap-1">
              {SECTION_LINKS.map((l) => (
                <NavAnchor key={l.href} {...l} onNavigate={() => setMenuOpen(false)} />
              ))}
              {resumeLink}
              <Link to={paths.join()} className="press inline-flex min-h-11 items-center rounded-full px-3.5 text-[15px] font-medium text-ink-muted hover:bg-ink/[0.05]">
                Join with a code
              </Link>
            </nav>
          </div>
        ) : null}
      </header>
      <main id="main" className="flex-1">
        <ImmersiveContext.Provider value={setImmersive}>{children}</ImmersiveContext.Provider>
      </main>
      <footer className={`border-t border-border/70 ${immersive ? "hidden" : ""}`}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-4 py-6 text-[13px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <span>Classic Ludo for 2–4 players · online rooms that wait for you</span>
          <span>Server-authoritative: dice and moves are decided by the game server.</span>
        </div>
      </footer>
    </div>
  );
}
