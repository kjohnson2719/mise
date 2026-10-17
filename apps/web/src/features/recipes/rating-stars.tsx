import { StarIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const STARS = [1, 2, 3, 4, 5] as const

/** A rating, shown as stars. */
export function RatingStars({
  rating,
  className,
}: {
  rating: number
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span
      role="img"
      aria-label={t("recipes.rating.label", { count: rating })}
      className={cn("inline-flex items-center text-highlight", className)}
    >
      {STARS.map((star) => (
        <HugeiconsIcon
          key={star}
          icon={StarIcon}
          strokeWidth={2}
          className={cn(
            "size-3.5",
            star <= rating ? "[&_path]:fill-current" : "opacity-30"
          )}
        />
      ))}
    </span>
  )
}

/** Five stars to pick a rating with. Picking the one already chosen clears it. */
export function RatingInput({
  value,
  onChange,
  id,
}: {
  value: number | null
  onChange: (rating: number | null) => void
  id?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={t("recipes.fields.rating")}
      className="-ml-1 flex items-center"
    >
      {STARS.map((star) => {
        const on = value !== null && star <= value
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={t("recipes.rating.label", { count: star })}
            onClick={() => onChange(value === star ? null : star)}
            className="rounded-full p-1 text-highlight transition-transform outline-none hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={StarIcon}
              strokeWidth={2}
              className={cn(
                "size-6",
                on ? "[&_path]:fill-current" : "opacity-40"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
