// Single list of generated design artifacts, shared by the generator script
// and the drift test.
import { buildPaletteReport, buildPaletteSheetSvg } from "@ludo/design-tokens";

export interface DesignArtifact {
  path: string;
  build: () => string;
}

export const DESIGN_ARTIFACTS: readonly DesignArtifact[] = [
  { path: "docs/design/generated/palette-report.md", build: buildPaletteReport },
  { path: "docs/design/generated/palette-sheet.svg", build: buildPaletteSheetSvg },
];
