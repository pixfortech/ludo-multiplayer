// Removes build output (packages/*/dist, apps/*/dist) on any platform.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

for (const group of ["packages", "apps"]) {
  for (const name of readdirSync(group)) {
    rmSync(join(group, name, "dist"), { recursive: true, force: true, maxRetries: 5 });
  }
}
