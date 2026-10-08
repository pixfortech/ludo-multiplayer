// Single list of generated design artifacts, shared by the generator script
// and the drift test.
import { CLASSIC_DIAGRAMS } from "@ludo/board-layouts";
import { buildPaletteReport, buildPaletteSheetSvg, buildTokenSizeSheetSvg } from "@ludo/design-tokens";

export interface DesignArtifact {
  path: string;
  build: () => string;
}

export const DESIGN_ARTIFACTS: readonly DesignArtifact[] = [
  { path: "docs/design/generated/palette-report.md", build: buildPaletteReport },
  { path: "docs/design/generated/palette-sheet.svg", build: buildPaletteSheetSvg },
  { path: "docs/design/generated/token-sizes.svg", build: buildTokenSizeSheetSvg },
  ...CLASSIC_DIAGRAMS,
];
