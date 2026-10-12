// A hidden list of the latest presentation events (the die thrown and landed,
// the characters' cues, token moves, the victory screen), in the order they
// were shown, with the time. Tests and tooling read it; the sound and dialogue
// system will subscribe to the same events (presentation.ts). It renders
// nothing visible and re-renders only itself.

import { useEffect, useRef, useState } from "react";
import { onPresentationEvent, type PresentationEvent } from "./presentation";

interface Logged {
  n: number;
  t: number;
  event: PresentationEvent;
}

const KEEP = 60;

export function PresentationLog() {
  const [events, setEvents] = useState<Logged[]>([]);
  const count = useRef(0);
  useEffect(() => onPresentationEvent((event) => setEvents((list) => [...list.slice(-(KEEP - 1)), { n: ++count.current, t: Math.round(performance.now()), event }])), []);
  return (
    <ol className="sr-only" aria-hidden="true" data-testid="presentation-log">
      {events.map(({ n, t, event }) => {
        const player = "playerId" in event ? event.playerId : event.type === "cue" ? event.cue.playerId : null;
        return (
          <li
            key={n}
            data-n={n}
            data-t={t}
            data-type={event.type}
            data-kind={event.type === "cue" ? event.cue.kind : undefined}
            data-player={player ?? undefined}
            data-value={event.type === "die-land" ? event.value : undefined}
            data-tokens={event.type === "cue" ? event.cue.tokens.join(" ") : event.type === "token-move" ? `${event.playerId}:${event.tokenId}` : undefined}
            data-to={event.type === "token-move" ? event.to : undefined}
          />
        );
      })}
    </ol>
  );
}
