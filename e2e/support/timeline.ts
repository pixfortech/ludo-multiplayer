// A timeline of what the board and die showed, recorded in the page itself
// (MutationObserver + performance.now()), so tests can check the order and
// timing of animations as a player saw them.
import type { Page } from "@playwright/test";

export interface TimelineEvent {
  t: number;
  /** "die", a token key (playerId:tokenId), or "home:<playerId>" for a home counter. */
  target: string;
  /** data-value of the die, data-step of a token, or a home count. */
  value: string;
}

export async function startTimeline(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __timeline: TimelineEvent[]; __timelineObserver?: MutationObserver };
    w.__timelineObserver?.disconnect();
    w.__timeline = [];
    const visibleDie = () => [...document.querySelectorAll<HTMLElement>('[data-testid="die"]')].find((d) => d.getBoundingClientRect().width > 0);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        // A counter re-mounted to restart its animation arrives as a new element.
        if (r.type === "childList") {
          for (const node of r.addedNodes) {
            if (!(node instanceof Element)) continue;
            const counters = node.matches('[data-testid="home-count"]') ? [node] : [...node.querySelectorAll('[data-testid="home-count"]')];
            for (const c of counters) if (c.getBoundingClientRect().width > 0) w.__timeline.push({ t: performance.now(), target: `home:${c.getAttribute("data-player")}`, value: c.getAttribute("data-home")! });
          }
          continue;
        }
        const el = r.target as Element;
        const id = el.getAttribute("data-testid") ?? "";
        if (id === "die" && el === visibleDie()) w.__timeline.push({ t: performance.now(), target: "die", value: el.getAttribute("data-value")! });
        if (id.startsWith("token-") && r.attributeName === "data-step") w.__timeline.push({ t: performance.now(), target: id.slice(6), value: el.getAttribute("data-step")! });
        if (id === "home-count" && r.attributeName === "data-home" && el.getBoundingClientRect().width > 0) w.__timeline.push({ t: performance.now(), target: `home:${el.getAttribute("data-player")}`, value: el.getAttribute("data-home")! });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-step", "data-value", "data-home"] });
    w.__timelineObserver = observer;
  });
}

export function readTimeline(page: Page): Promise<TimelineEvent[]> {
  return page.evaluate(() => (window as unknown as { __timeline: TimelineEvent[] }).__timeline ?? []);
}

/** Running travel/tumble animations on tokens and on the die cube (0 when the board is at rest). */
export function runningAnimations(page: Page): Promise<{ tokens: number; die: number }> {
  return page.evaluate(() => {
    // Script-driven animations only: travel, tumble, settle. CSS loops such as the movable ring's breathing are not movement.
    const count = (els: Element[]) => els.reduce((n, el) => n + el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && !(a instanceof CSSAnimation)).length, 0);
    return {
      tokens: count([...document.querySelectorAll('[data-testid^="token-"]')]),
      die: count([...document.querySelectorAll(".die-cube")]),
    };
  });
}

/** Whether the die's tumble is running on the visible die. */
export function dieSpinning(page: Page): Promise<boolean> {
  return page.evaluate(() => [...document.querySelectorAll(".die-cube")].some((el) => el.getBoundingClientRect().width > 0 && el.getAnimations().some((a) => a.id === "die-spin" && a.playState === "running")));
}
