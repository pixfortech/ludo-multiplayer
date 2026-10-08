// Asset manifest schema — the record of every visual/audio asset the project
// produces, where it came from, and whether it is approved for use.
//
// The manifest lives at `assets/manifest.json`. This TypeScript definition is
// the schema; `validateManifest` enforces it at runtime and in tests.
//
// Generated assets are decoration only. Board geometry, token coordinates and
// rules never come from an asset (see docs/design/higgsfield-integration.md).

export const MANIFEST_VERSION = 1;

export type AssetKind = "image" | "vector" | "texture" | "model3d" | "audio" | "video";

export type AssetCategory =
  | "board"
  | "token"
  | "dice"
  | "environment"
  | "background"
  | "effect"
  | "icon"
  | "ui"
  | "audio"
  | "marketing";

/** Lifecycle. Only `approved` assets are ever served to the game. */
export type AssetStatus = "concept" | "candidate" | "approved" | "rejected" | "superseded";

export type GenerationSource = "higgsfield" | "procedural" | "blender" | "manual" | "third-party";

export interface AssetGeneration {
  source: GenerationSource;
  /** Tool used, e.g. "higgsfield-mcp", "higgsfield-cli", "blender 4.x". */
  tool: string;
  /** Exact model id as reported by the tool (e.g. "recraft_v4_1"). Required for Higgsfield. */
  model?: string;
  /** Path to the versioned prompt/reference file, e.g. "assets/source/prompts/dice.v2.md". */
  promptRef?: string;
  /** ISO-8601 timestamp of generation. Required for Higgsfield. */
  generatedAt?: string;
  /** Provider job / generation id, for traceability. Required for Higgsfield. */
  originalRef?: string;
}

export interface AssetFiles {
  /** Original output as received (repo-relative, under `assets/`). */
  source: string;
  /** Optimised, game-ready output (repo-relative, under `assets/`). Required once approved. */
  optimized?: string;
}

export interface AssetMesh {
  triangles: number;
  /** Largest texture edge in pixels, if textured. */
  textureResolution?: number;
}

export interface AssetLicense {
  /** Free-text usage notes (terms checked, restrictions, attribution). */
  notes: string;
  /** Commercial use of this output has been checked and is permitted. */
  commercialUseConfirmed: boolean;
}

export interface AssetEntry {
  /** Unique, stable id, e.g. "token-2d-base". */
  id: string;
  /**
   * The logical role this asset fills, e.g. "token.3d.model". The resolver
   * picks the newest approved entry per slot; anything else falls back to the
   * procedural renderer.
   */
  slot: string;
  kind: AssetKind;
  category: AssetCategory;
  purpose: string;
  /** Monotonic version. File names carry it as `.v<version>.` so approved files are never overwritten. */
  version: number;
  status: AssetStatus;
  generation: AssetGeneration;
  files: AssetFiles;
  format: string;
  dimensions?: { width: number; height: number };
  /** Size of the optimised file (or source file if not yet optimised), in bytes. */
  fileSizeBytes?: number;
  mesh?: AssetMesh;
  /** Required for kind "audio" / "video". */
  durationSeconds?: number;
  license: AssetLicense;
  /** Id of the entry this one replaces, if any. */
  supersedes?: string;
  notes?: string;
}

export interface AssetManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  assets: AssetEntry[];
}
