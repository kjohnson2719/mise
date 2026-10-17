import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

/** A Today section's heading, with a link to its page on the right. */
export function SectionHeading({
  id,
  children,
  to,
  link,
}: {
  id: string
  children: React.ReactNode
  to?: "/plan" | "/recipes"
  link?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="font-heading text-xl font-semibold">
        {children}
      </h2>
      {to && link && (
        <Link
          to={to}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {link}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Link>
      )}
    </div>
  )
}
