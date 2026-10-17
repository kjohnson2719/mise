import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

/**
 * The bowl M. Strokes use `currentColor`; the middle of the M reads
 * `--logo-accent` and falls back to `currentColor`, so it's one color unless
 * a parent sets the accent.
 */
export function MerranMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 11v13a15 15 0 0 0 30 0V11" />
      <path
        d="M9 11l15 14 15-14"
        style={{ stroke: "var(--logo-accent, currentColor)" }}
      />
    </svg>
  )
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string
  showWordmark?: boolean
}) {
  return (
    <span
      className={cn("flex items-center gap-2 text-primary", className)}
      style={{ "--logo-accent": "var(--highlight)" } as CSSProperties}
    >
      <MerranMark className="size-8 shrink-0" />
      {showWordmark && (
        <span className="font-heading text-2xl leading-none font-medium tracking-tight text-foreground [font-variation-settings:'SOFT'_100]">
          merr<span className="text-primary">a</span>n
        </span>
      )}
    </span>
  )
}
