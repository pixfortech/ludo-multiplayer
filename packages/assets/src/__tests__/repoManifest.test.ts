// Validates the real repository asset tree: schema, missing files, orphan
// files and recorded sizes. Runs offline as part of `npm run test`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../validate.js";
import type { AssetManifest } from "../manifest.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ASSETS_DIR = join(REPO_ROOT, "assets");
const IGNORED = new Set(["manifest.json", "README.md", ".gitkeep"]);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) return listFiles(full);
    return IGNORED.has(dirent.name) ? [] : [relative(REPO_ROOT, full).split("\\").join("/")];
  });
}

const raw: unknown = JSON.parse(readFileSync(join(ASSETS_DIR, "manifest.json"), "utf8"));
const result = validateManifest(raw);

describe("assets/manifest.json", () => {
  it("matches the schema", () => {
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  const manifest = (result.ok ? result.manifest : { manifestVersion: 1, assets: [] }) as AssetManifest;
  const referenced = new Set<string>();
  for (const entry of manifest.assets) {
    referenced.add(entry.files.source);
    if (entry.files.optimized) referenced.add(entry.files.optimized);
    if (entry.generation.promptRef) referenced.add(entry.generation.promptRef);
  }

  it("references only files that exist", () => {
    const missing = [...referenced].filter((path) => !existsSync(join(REPO_ROOT, path)));
    expect(missing).toEqual([]);
  });

  it("has no unregistered files under assets/", () => {
    const orphans = listFiles(ASSETS_DIR).filter((path) => !referenced.has(path));
    expect(orphans).toEqual([]);
  });

  it("records the real size of every approved optimised file", () => {
    const mismatched = manifest.assets
      .filter((entry) => entry.status === "approved" && entry.files.optimized)
      .filter((entry) => statSync(join(REPO_ROOT, entry.files.optimized!)).size !== entry.fileSizeBytes)
      .map((entry) => entry.id);
    expect(mismatched).toEqual([]);
  });
});
