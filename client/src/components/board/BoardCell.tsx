import type { ReactNode } from "react";

interface Props {
  row: number; // 0-indexed grid row
  col: number; // 0-indexed grid col
  span?: number; // square span (1 = single cell)
  className?: string;
  children?: ReactNode;
}

/**
 * A single positioned tile on the 15×15 board grid. Purely presentational —
 * placement is driven by (row, col) so callers stay declarative.
 */
export default function BoardCell({ row, col, span = 1, className = "", children }: Props) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        gridRow: `${row + 1} / span ${span}`,
        gridColumn: `${col + 1} / span ${span}`,
      }}
    >
      {children}
    </div>
  );
}
