// Shared Vite/Vitest resolution for the monorepo.
//
// Every workspace package exposes a "source" export condition that points at
// its TypeScript entry. Adding it ahead of Vite's defaults lets tests and the
// client dev server consume sibling packages straight from source (no build
// step, live reload across packages), while Node and `tsc` builds fall through
// to the compiled `dist/` output.
import { defaultClientConditions, defaultServerConditions } from "vite";

export const workspaceSourceResolution = {
  resolve: { conditions: ["source", ...defaultClientConditions] },
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
};
