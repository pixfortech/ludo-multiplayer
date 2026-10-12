// Makes the game's character files from the raw Blender exports:
// High / Medium / Low levels of detail (mesh simplification), quantised and
// meshopt-compressed geometry and animation. Updates
// characters.json with each level's file, size and triangle count.
//
//   node tools/characters/optimize.mjs <raw dir> <out dir> [<manifest copy>]
//
// The manifest copy keeps characters it already lists that this raw directory
// does not (teams can be built in separate runs).
//
// The game serves the GLBs from apps/client/public/characters and imports the
// manifest from apps/client/src/components/board3d/characters/characters.json.
//
// Works the same on Windows and Linux (gltfpack is an npm package).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [rawDir, outDir, manifestCopy] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error("usage: node tools/characters/optimize.mjs <raw dir> <out dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(rawDir, "characters.json"), "utf8"));

// Simplification ratio per level. Props and the character keep their named nodes and material names
// (the game tints "team" and shows or hides props). Textures arrive as WebP from Blender (the npm
// gltfpack cannot encode images).
const LEVELS = {
  high: { si: 1 },
  medium: { si: 0.55 },
  low: { si: 0.28 },
};

/** Counts triangles in a GLB's meshes (reads the JSON chunk's accessors). */
function triangles(path) {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  let total = 0;
  for (const mesh of gltf.meshes ?? []) for (const p of mesh.primitives) total += (p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3;
  return { total, animations: (gltf.animations ?? []).map((a) => a.name) };
}

for (const [key, entry] of Object.entries(manifest.characters)) {
  entry.levels = {};
  for (const [level, o] of Object.entries(LEVELS)) {
    const file = `${key}.${level}.glb`;
    const out = join(outDir, file);
    const args = ["gltfpack", "-i", join(rawDir, entry.raw), "-o", out, "-cc", "-kn", "-km", "-af", "30"];
    if (o.si < 1) args.push("-si", String(o.si));
    const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) throw new Error(`gltfpack failed for ${file}`);
    const t = triangles(out);
    entry.levels[level] = { file, bytes: statSync(out).size, triangles: Math.round(t.total) };
    entry.animations = t.animations;
  }
}
// The game imports the manifest (without the build-only raw file names).
for (const entry of Object.values(manifest.characters)) delete entry.raw;
writeFileSync(join(rawDir, "characters.optimized.json"), JSON.stringify(manifest, null, 2) + "\n");
if (manifestCopy) {
  // Characters built in another run (another raw directory) stay in the game's manifest; these replace their own.
  const merged = existsSync(manifestCopy) ? JSON.parse(readFileSync(manifestCopy, "utf8")) : { characters: {} };
  merged.characters = { ...merged.characters, ...manifest.characters };
  merged.fps = manifest.fps;
  writeFileSync(manifestCopy, JSON.stringify(merged, null, 2) + "\n");
}
console.table(Object.fromEntries(Object.entries(manifest.characters).flatMap(([k, e]) => Object.entries(e.levels).map(([l, v]) => [`${k} ${l}`, { kb: Math.round(v.bytes / 1024), triangles: v.triangles }]))));
