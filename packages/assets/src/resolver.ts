import type { AssetEntry, AssetKind, AssetManifest } from "./manifest.js";

/** What a renderer receives for a slot that has an approved asset. */
export interface ResolvedAsset {
  slot: string;
  id: string;
  version: number;
  kind: AssetKind;
  url: string;
  format: string;
}

/**
 * Renderers ask for assets by slot. `null` means "no approved asset — draw the
 * procedural fallback". The game must always be fully playable on fallbacks,
 * so callers handle `null` as the normal case, not an error.
 */
export interface AssetResolver {
  resolve(slot: string): ResolvedAsset | null;
  /** Convenience: the approved asset, or the caller's procedural fallback. */
  resolveOr<T>(slot: string, fallback: () => T): ResolvedAsset | T;
  /** Slots that currently have an approved asset. */
  approvedSlots(): string[];
}

export interface ResolverOptions {
  /**
   * Maps a repo-relative optimised path (e.g. "assets/2d/dice/face.v2.svg")
   * to the URL the client fetches. Defaults to serving it from "/" + path.
   */
  toUrl?: (optimizedPath: string) => string;
}

export function createAssetResolver(manifest: AssetManifest | null, options: ResolverOptions = {}): AssetResolver {
  const toUrl = options.toUrl ?? ((path: string) => `/${path}`);
  const bySlot = new Map<string, AssetEntry>();

  for (const entry of manifest?.assets ?? []) {
    if (entry.status !== "approved" || entry.files.optimized === undefined) continue;
    const current = bySlot.get(entry.slot);
    if (current === undefined || entry.version > current.version) bySlot.set(entry.slot, entry);
  }

  const resolve = (slot: string): ResolvedAsset | null => {
    const entry = bySlot.get(slot);
    if (entry?.files.optimized === undefined) return null;
    return {
      slot,
      id: entry.id,
      version: entry.version,
      kind: entry.kind,
      url: toUrl(entry.files.optimized),
      format: entry.format,
    };
  };

  return {
    resolve,
    resolveOr: (slot, fallback) => resolve(slot) ?? fallback(),
    approvedSlots: () => [...bySlot.keys()].sort(),
  };
}
