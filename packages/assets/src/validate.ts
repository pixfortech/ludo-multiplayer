import {
  MANIFEST_VERSION,
  type AssetCategory,
  type AssetEntry,
  type AssetKind,
  type AssetManifest,
  type AssetStatus,
  type GenerationSource,
} from "./manifest.js";

const KINDS: readonly AssetKind[] = ["image", "vector", "texture", "model3d", "audio", "video"];
const CATEGORIES: readonly AssetCategory[] = [
  "board",
  "token",
  "dice",
  "environment",
  "background",
  "effect",
  "icon",
  "ui",
  "audio",
  "marketing",
];
const STATUSES: readonly AssetStatus[] = ["concept", "candidate", "approved", "rejected", "superseded"];
const SOURCES: readonly GenerationSource[] = ["higgsfield", "procedural", "blender", "manual", "third-party"];

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export interface ManifestIssue {
  /** Asset id, or "manifest" for top-level problems. */
  where: string;
  message: string;
}

export type ManifestValidation =
  | { ok: true; manifest: AssetManifest }
  | { ok: false; issues: ManifestIssue[] };

/** Repo-relative path that stays inside `assets/`. */
export function isAssetPath(path: string): boolean {
  return (
    path.startsWith("assets/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateEntry(raw: unknown, index: number, issues: ManifestIssue[]): void {
  if (!isRecord(raw)) {
    issues.push({ where: `assets[${index}]`, message: "entry must be an object" });
    return;
  }
  const where = typeof raw.id === "string" ? raw.id : `assets[${index}]`;
  const fail = (message: string) => issues.push({ where, message });
  const e = raw as Partial<AssetEntry> & Record<string, unknown>;

  if (typeof e.id !== "string" || !ID_PATTERN.test(e.id)) fail("id must be kebab-case");
  if (typeof e.slot !== "string" || !SLOT_PATTERN.test(e.slot)) fail("slot must be dotted lowercase, e.g. token.3d.model");
  if (!KINDS.includes(e.kind as AssetKind)) fail(`kind must be one of ${KINDS.join(", ")}`);
  if (!CATEGORIES.includes(e.category as AssetCategory)) fail(`category must be one of ${CATEGORIES.join(", ")}`);
  if (typeof e.purpose !== "string" || e.purpose.trim() === "") fail("purpose is required");
  if (!isPositiveInt(e.version)) fail("version must be a positive integer");
  if (!STATUSES.includes(e.status as AssetStatus)) fail(`status must be one of ${STATUSES.join(", ")}`);
  if (typeof e.format !== "string" || e.format.trim() === "") fail("format is required");

  // Generation provenance
  const gen = e.generation;
  if (!isRecord(gen)) {
    fail("generation is required");
  } else {
    if (!SOURCES.includes(gen.source as GenerationSource)) fail(`generation.source must be one of ${SOURCES.join(", ")}`);
    if (typeof gen.tool !== "string" || gen.tool.trim() === "") fail("generation.tool is required");
    if (gen.generatedAt !== undefined && !isIsoDate(gen.generatedAt)) fail("generation.generatedAt must be ISO-8601");
    if (gen.promptRef !== undefined && (typeof gen.promptRef !== "string" || !isAssetPath(gen.promptRef))) {
      fail("generation.promptRef must be a path under assets/");
    }
    if (gen.source === "higgsfield") {
      if (typeof gen.model !== "string" || gen.model === "") fail("Higgsfield assets must record generation.model");
      if (gen.generatedAt === undefined) fail("Higgsfield assets must record generation.generatedAt");
      if (typeof gen.originalRef !== "string" || gen.originalRef === "") fail("Higgsfield assets must record generation.originalRef");
    }
  }

  // Files: inside assets/, versioned names
  const files = e.files;
  if (!isRecord(files) || typeof files.source !== "string") {
    fail("files.source is required");
  } else {
    const paths = [files.source, files.optimized].filter((p): p is string => typeof p === "string");
    for (const path of paths) {
      if (!isAssetPath(path)) fail(`path must stay under assets/: ${path}`);
      if (isPositiveInt(e.version) && !path.includes(`.v${e.version}.`)) {
        fail(`file name must carry its version as ".v${e.version}.": ${path}`);
      }
    }
    if (files.optimized !== undefined && typeof files.optimized !== "string") fail("files.optimized must be a string");
  }

  // Optional measurements
  if (e.dimensions !== undefined && (!isRecord(e.dimensions) || !isPositiveInt(e.dimensions.width) || !isPositiveInt(e.dimensions.height))) {
    fail("dimensions must be positive integer width/height");
  }
  if (e.fileSizeBytes !== undefined && !isPositiveInt(e.fileSizeBytes)) fail("fileSizeBytes must be a positive integer");
  if (e.mesh !== undefined) {
    if (!isRecord(e.mesh) || !isPositiveInt(e.mesh.triangles)) fail("mesh.triangles must be a positive integer");
    else if (e.mesh.textureResolution !== undefined && !isPositiveInt(e.mesh.textureResolution)) {
      fail("mesh.textureResolution must be a positive integer");
    }
  }

  if (!isRecord(e.license) || typeof e.license.notes !== "string" || typeof e.license.commercialUseConfirmed !== "boolean") {
    fail("license.notes and license.commercialUseConfirmed are required");
  }

  // Kind-specific requirements once an asset is past the concept stage
  const reviewed = e.status === "candidate" || e.status === "approved";
  if (reviewed && e.kind === "model3d" && e.mesh === undefined) fail("3D models must record mesh.triangles once reviewed");
  if (reviewed && (e.kind === "audio" || e.kind === "video") && typeof e.durationSeconds !== "number") {
    fail("audio/video must record durationSeconds once reviewed");
  }

  // Approval gate
  if (e.status === "approved") {
    if (!isRecord(files) || typeof files.optimized !== "string") fail("approved assets need files.optimized");
    if (e.fileSizeBytes === undefined) fail("approved assets need fileSizeBytes");
    if (!isRecord(e.license) || e.license.commercialUseConfirmed !== true) {
      fail("approved assets need license.commercialUseConfirmed = true");
    }
  }
}

export function validateManifest(raw: unknown): ManifestValidation {
  const issues: ManifestIssue[] = [];
  if (!isRecord(raw)) return { ok: false, issues: [{ where: "manifest", message: "manifest must be an object" }] };
  if (raw.manifestVersion !== MANIFEST_VERSION) {
    issues.push({ where: "manifest", message: `manifestVersion must be ${MANIFEST_VERSION}` });
  }
  if (!Array.isArray(raw.assets)) {
    issues.push({ where: "manifest", message: "assets must be an array" });
    return { ok: false, issues };
  }

  raw.assets.forEach((entry, index) => validateEntry(entry, index, issues));

  const seenIds = new Set<string>();
  const seenFiles = new Map<string, string>();
  for (const entry of raw.assets as Partial<AssetEntry>[]) {
    if (typeof entry?.id !== "string") continue;
    if (seenIds.has(entry.id)) issues.push({ where: entry.id, message: "duplicate id" });
    seenIds.add(entry.id);
    for (const path of [entry.files?.source, entry.files?.optimized]) {
      if (typeof path !== "string") continue;
      const owner = seenFiles.get(path);
      if (owner !== undefined && owner !== entry.id) {
        issues.push({ where: entry.id, message: `file already claimed by ${owner}: ${path}` });
      }
      seenFiles.set(path, entry.id);
    }
  }
  for (const entry of raw.assets as Partial<AssetEntry>[]) {
    if (typeof entry?.supersedes === "string" && !seenIds.has(entry.supersedes)) {
      issues.push({ where: entry.id ?? "?", message: `supersedes unknown id ${entry.supersedes}` });
    }
  }

  return issues.length === 0 ? { ok: true, manifest: raw as unknown as AssetManifest } : { ok: false, issues };
}
