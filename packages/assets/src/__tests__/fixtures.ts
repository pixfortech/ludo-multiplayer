import type { AssetEntry } from "../manifest.js";

/** A fully valid approved Higgsfield-generated entry; tests override fields. */
export function approvedEntry(overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    id: "dice-2d-face",
    slot: "dice.2d.face",
    kind: "vector",
    category: "dice",
    purpose: "Dice face artwork for the 2D renderer",
    version: 2,
    status: "approved",
    generation: {
      source: "higgsfield",
      tool: "higgsfield-mcp",
      model: "recraft_v4_1",
      promptRef: "assets/source/prompts/dice-2d-face.v2.md",
      generatedAt: "2026-10-08T12:00:00Z",
      originalRef: "job_123",
    },
    files: {
      source: "assets/source/dice-2d-face.v2.png",
      optimized: "assets/2d/dice/dice-2d-face.v2.svg",
    },
    format: "svg",
    dimensions: { width: 512, height: 512 },
    fileSizeBytes: 4096,
    license: { notes: "Checked against provider terms.", commercialUseConfirmed: true },
    ...overrides,
  };
}
