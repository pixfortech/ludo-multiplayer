import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  inputClassName?: string;
}

export function TextField({ label, hint, error, inputClassName = "", id, ...rest }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 w-full rounded-[var(--radius-control)] border bg-surface px-4 text-base text-ink shadow-raised outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/70 focus:border-accent focus:shadow-[0_0_0_4px_rgba(31,95,214,0.14)] ${error ? "border-danger" : "border-border hover:border-[#cfc7b8]"} ${inputClassName}`}
        {...rest}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
