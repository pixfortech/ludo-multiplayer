// Colours and small helpers shared by the board's static layers.
import { mixLab } from "@ludo/design-tokens";

export const WHITE = "#FFFFFF";
export const SEPARATOR = "#ECE7DE";
export const tint = (hex: string, t: number): string => (t === 0 ? hex : mixLab(hex, WHITE, t));
