// Validates the real repository asset tree: schema, missing files, orphan
// files, recorded sizes, size cap and Git LFS storage. Runs offline as part
// of `npm run test`.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../validate.js";
import type { AssetManifest } from "../manifest.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ASSETS_DIR = join(REPO_ROOT, "assets");
const IGNORED = new Set(["manifest.json", "README.md", ".gitkeep"]);
/** Draft prompts are documents, not assets; they need no manifest entry until used. */
const PROMPTS_DIR = "assets/source/prompts/";
/** Hard cap for any single file in the asset tree. Category budgets are tighter. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

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
    const orphans = listFiles(ASSETS_DIR).filter((path) => !referenced.has(path) && !path.startsWith(PROMPTS_DIR));
    expect(orphans).toEqual([]);
  });

  it(`keeps every file under the ${MAX_FILE_BYTES / 1024 / 1024} MB hard cap`, () => {
    const oversized = listFiles(ASSETS_DIR).filter((path) => statSync(join(REPO_ROOT, path)).size > MAX_FILE_BYTES);
    expect(oversized).toEqual([]);
  });

  it("stores LFS-tracked binaries as LFS pointers, never as raw blobs", () => {
    // A machine without git-lfs silently commits the full binary; catch that.
    const staged = git("ls-files", "-z", "--", "assets").split("\0").filter(Boolean);
    const notPointers = staged.filter((path) => {
      if (!git("check-attr", "filter", "--", path).trim().endsWith("filter: lfs")) return false;
      return !git("cat-file", "-p", `:${path}`).startsWith(LFS_POINTER_PREFIX);
    });
    expect(notPointers).toEqual([]);
  });

  it("routes binary formats to LFS and keeps SVG in regular Git", () => {
    const filterOf = (path: string) => git("check-attr", "filter", "--", path).trim().split(": ").pop();
    expect(filterOf("assets/3d/tokens/x.v1.glb")).toBe("lfs");
    expect(filterOf("assets/2d/textures/x.v1.ktx2")).toBe("lfs");
    expect(filterOf("assets/audio/x.v1.ogg")).toBe("lfs");
    expect(filterOf("assets/2d/tokens/x.v1.svg")).toBe("unspecified");
  });

  it("records the real size of every approved optimised file", () => {
    const mismatched = manifest.assets
      .filter((entry) => entry.status === "approved" && entry.files.optimized)
      .filter((entry) => statSync(join(REPO_ROOT, entry.files.optimized!)).size !== entry.fileSizeBytes)
      .map((entry) => entry.id);
    expect(mismatched).toEqual([]);
  });
});
