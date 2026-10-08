// Regenerates the committed design artifacts under docs/design/generated/.
// Run with `npm run design:generate`; tests fail if the files are stale.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGN_ARTIFACTS } from "./designArtifactList.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const artifact of DESIGN_ARTIFACTS) {
  const path = join(root, artifact.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, artifact.build());
  console.log(`wrote ${artifact.path}`);
}
