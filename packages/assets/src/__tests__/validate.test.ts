import { describe, expect, it } from "vitest";
import { isAssetPath, validateManifest } from "../validate.js";
import type { AssetEntry } from "../manifest.js";
import { approvedEntry } from "./fixtures.js";

function check(...assets: unknown[]) {
  return validateManifest({ manifestVersion: 1, assets });
}

function messages(...assets: unknown[]): string[] {
  const result = check(...assets);
  return result.ok ? [] : result.issues.map((issue) => issue.message);
}

describe("validateManifest", () => {
  it("accepts an empty manifest", () => {
    expect(check().ok).toBe(true);
  });

  it("accepts a complete approved entry", () => {
    expect(check(approvedEntry()).ok).toBe(true);
  });

  it("rejects a wrong manifest version or shape", () => {
    expect(validateManifest({ manifestVersion: 2, assets: [] }).ok).toBe(false);
    expect(validateManifest({ manifestVersion: 1 }).ok).toBe(false);
    expect(validateManifest(null).ok).toBe(false);
  });

  it("rejects duplicate ids and files claimed twice", () => {
    expect(messages(approvedEntry(), approvedEntry())).toContain("duplicate id");
    const other = approvedEntry({ id: "dice-2d-face-alt" });
    expect(messages(approvedEntry(), other).some((m) => m.startsWith("file already claimed"))).toBe(true);
  });

  it("requires Higgsfield provenance", () => {
    const entry = approvedEntry();
    const { model: _model, originalRef: _ref, ...generation } = entry.generation;
    const issues = messages({ ...entry, generation });
    expect(issues).toContain("Higgsfield assets must record generation.model");
    expect(issues).toContain("Higgsfield assets must record generation.originalRef");
  });

  it("does not require model/job ids for procedural assets", () => {
    const entry = approvedEntry({ generation: { source: "procedural", tool: "board-layouts" } });
    expect(check(entry).ok).toBe(true);
  });

  it("keeps every path inside assets/", () => {
    for (const bad of ["../secrets.v2.png", "/etc/passwd.v2", "assets/../x.v2.png", "public/x.v2.png"]) {
      expect(isAssetPath(bad)).toBe(false);
      expect(check(approvedEntry({ files: { source: bad } })).ok).toBe(false);
    }
  });

  it("requires the version in every file name so approved files are never overwritten", () => {
    const entry = approvedEntry({ version: 3 });
    expect(messages(entry).some((m) => m.includes('".v3."'))).toBe(true);
  });

  it("gates approval on an optimised file, a size and confirmed commercial use", () => {
    const entry: AssetEntry = approvedEntry({
      files: { source: "assets/source/dice-2d-face.v2.png" },
      license: { notes: "pending", commercialUseConfirmed: false },
    });
    delete entry.fileSizeBytes;
    const issues = messages(entry);
    expect(issues).toContain("approved assets need files.optimized");
    expect(issues).toContain("approved assets need fileSizeBytes");
    expect(issues).toContain("approved assets need license.commercialUseConfirmed = true");
  });

  it("lets concepts skip approval-only requirements", () => {
    const concept: AssetEntry = approvedEntry({
      status: "concept",
      files: { source: "assets/concepts/dice-2d-face.v2.png" },
      license: { notes: "Not yet reviewed.", commercialUseConfirmed: false },
    });
    delete concept.fileSizeBytes;
    expect(check(concept).ok).toBe(true);
  });

  it("requires mesh data on reviewed 3D models", () => {
    const model = approvedEntry({
      id: "token-3d-model",
      slot: "token.3d.model",
      kind: "model3d",
      category: "token",
      format: "glb",
      status: "candidate",
      files: { source: "assets/source/token-3d-model.v2.glb" },
    });
    expect(messages(model)).toContain("3D models must record mesh.triangles once reviewed");
    expect(check({ ...model, mesh: { triangles: 4000, textureResolution: 1024 } }).ok).toBe(true);
  });

  it("requires a duration on reviewed audio", () => {
    const sfx = approvedEntry({
      id: "sfx-dice-roll",
      slot: "audio.sfx.dice-roll",
      kind: "audio",
      category: "audio",
      format: "ogg",
      status: "candidate",
      files: { source: "assets/source/sfx-dice-roll.v2.wav" },
    });
    expect(messages(sfx)).toContain("audio/video must record durationSeconds once reviewed");
  });

  it("rejects supersedes links to unknown ids", () => {
    expect(messages(approvedEntry({ supersedes: "nope" }))).toContain("supersedes unknown id nope");
  });

  it("reports malformed entries without throwing", () => {
    expect(check("not an object").ok).toBe(false);
    expect(check({}).ok).toBe(false);
  });
});
