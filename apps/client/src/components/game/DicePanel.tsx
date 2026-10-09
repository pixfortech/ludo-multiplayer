// The die tray and Roll control. The tray takes the current player's colour;
// the die is never recoloured. Rolling is enabled only when the server says
// this seat may roll and the previous reveal has finished.
//   panel: tray above a full-width Roll button (desktop and tablet rail).
//   thumb: the tray itself is the button, 64 px die in the phone thumb bar.
import type { CSSProperties } from "react";
import type { PlayerIdentity } from "@ludo/design-tokens";
import { tint } from "../board/surfaceShared";
import { Button } from "../ui/Button";
import { DiceIcon } from "../ui/Icons";
import { Die } from "./Die";
import type { DieView } from "./useBoardPlayback";

interface DicePanelProps {
  die: DieView;
  identity: PlayerIdentity | null;
  canRoll: boolean;
  rolling: boolean;
  waitingLabel: string;
  onRoll: () => void;
  layout?: "panel" | "thumb";
}

export function DicePanel({ die, identity, canRoll, rolling, waitingLabel, onRoll, layout = "panel" }: DicePanelProps) {
  const trayStyle: CSSProperties & Record<"--tray-glow", string> = identity
    ? { borderColor: identity.rim, background: tint(identity.body, 0.82), "--tray-glow": `${identity.body}40` }
    : { borderColor: "#E2DCD1", background: "#f6f3ee", "--tray-glow": "transparent" };
  const label = rolling ? "Rolling…" : canRoll ? "Roll dice" : waitingLabel;
  const tumbling = die.rolling || rolling;
  const dieView = (size: number) => <Die value={die.value} rolling={tumbling} revealKey={die.revealKey} size={size} dimmed={!canRoll && !tumbling} />;

  if (layout === "thumb") {
    return (
      <button
        type="button"
        onClick={onRoll}
        disabled={!canRoll}
        aria-label={label}
        aria-keyshortcuts="R"
        className={`press flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[22px] border-2 disabled:cursor-not-allowed ${canRoll ? "tray-ready" : ""}`}
        style={trayStyle}
        data-testid="dice-tray"
      >
        {dieView(60)}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className={`flex shrink-0 items-center justify-center rounded-[22px] border-2 p-2 ${canRoll ? "tray-ready" : ""}`} style={trayStyle} data-testid="dice-tray">
        {dieView(64)}
      </div>
      <Button variant={canRoll || rolling ? "primary" : "secondary"} size="lg" disabled={!canRoll} loading={rolling} icon={<DiceIcon />} onClick={onRoll} aria-keyshortcuts="R" className="min-w-0 flex-1">
        {label}
      </Button>
    </div>
  );
}
