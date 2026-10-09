import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // One primary per view: accent fill with a restrained top-light gradient and inner highlight.
  primary:
    "text-white bg-[linear-gradient(180deg,#2c6be0_0%,#1f5fd6_55%,#1a52bb_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(20,24,33,0.12),0_6px_16px_-6px_rgba(31,95,214,0.55)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(20,24,33,0.12),0_10px_22px_-8px_rgba(31,95,214,0.6)] hover:brightness-[1.04]",
  secondary: "bg-surface text-ink border border-border shadow-raised hover:border-[#cfc7b8] hover:bg-[#fcfbf9]",
  ghost: "bg-transparent text-ink hover:bg-ink/[0.05]",
  danger: "bg-surface text-danger border border-[#f0c9cf] hover:bg-[#fff6f7]",
};

const SIZES: Record<Size, string> = {
  md: "min-h-11 px-4 text-[15px] gap-2",
  lg: "min-h-14 px-6 text-base gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = "secondary", size = "md", loading = false, icon, block, className = "", children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press inline-flex select-none items-center justify-center rounded-[var(--radius-control)] font-semibold tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon}
      <span>{children}</span>
    </button>
  );
}
