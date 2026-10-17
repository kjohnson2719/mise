import {
  Clock01Icon,
  CookBookIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { SelectMark } from "@/features/select/select-mark"
import { useLongPress } from "@/features/select/use-selection"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import { formatMinutes, formatServings } from "./format"
import { OnSaleBadge } from "@/features/stores/on-sale-badge"
import {
  formatPrice,
  useCosts,
  type RecipeSale,
} from "@/features/stores/queries"

import type { RecipeSummary } from "./queries"
import { RatingStars } from "./rating-stars"

/** How a card takes part in select mode. */
export type CardSelect = {
  selecting: boolean
  picked: boolean
  onToggle: () => void
  /** A long press on a phone, which starts selecting with this one. */
  onLongPress: () => void
}

const CARD =
  "group flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-card text-left text-card-foreground transition-colors outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * A recipe in the library: its photo, its name, a little about it, and its
 * tags. A link to it, or while selecting, a button that picks it.
 */
export function RecipeCard({
  recipe,
  select,
  onSale,
}: {
  recipe: RecipeSummary
  select?: CardSelect
  /** What it uses that's a deal at the household's store. */
  onSale?: readonly RecipeSale[] | undefined
}) {
  const { t } = useTranslation()
  const press = useLongPress(
    () => select?.onLongPress(),
    Boolean(select && !select.selecting)
  )
  if (select?.selecting) {
    return (
      <button
        type="button"
        aria-pressed={select.picked}
        aria-label={
          select.picked
            ? t("select.unpick", { name: recipe.name })
            : t("select.pick", { name: recipe.name })
        }
        onClick={select.onToggle}
        className={cn(
          CARD,
          select.picked && "border-primary ring-2 ring-primary"
        )}
      >
        <CardContent recipe={recipe} picked={select.picked} onSale={onSale} />
      </button>
    )
  }
  return (
    <Link
      to="/recipes/$slug"
      params={{ slug: recipe.slug }}
      className={CARD}
      {...press}
    >
      <CardContent recipe={recipe} onSale={onSale} />
    </Link>
  )
}

function CardContent({
  recipe,
  picked,
  onSale,
}: {
  recipe: RecipeSummary
  /** Picked or not, while selecting. */
  picked?: boolean
  onSale?: readonly RecipeSale[] | undefined
}) {
  const { t, i18n } = useTranslation()
  const costs = useCosts()
  const cost = costs.recipes.get(recipe.id)
  const perServing =
    cost?.perServing != null
      ? t("recipes.perServing", {
          price: formatPrice(cost.perServing, costs.currency, i18n.language),
        })
      : null
  return (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {picked !== undefined && (
          <SelectMark picked={picked} className="absolute top-3 left-3 z-10" />
        )}
        {recipe.photo ? (
          <img
            src={recipe.photo.card}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <HugeiconsIcon
              icon={CookBookIcon}
              strokeWidth={1.5}
              className="size-12"
            />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="space-y-1.5">
          <h2 className="font-heading text-base leading-snug font-semibold group-hover:text-primary">
            {recipe.name}
          </h2>
          {recipe.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {recipe.description}
            </p>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {recipe.totalMinutes !== null && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={Clock01Icon}
                strokeWidth={2}
                className="size-4"
              />
              {formatMinutes(t, recipe.totalMinutes)}
            </span>
          )}
          {recipe.servings !== null && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={2}
                className="size-4"
              />
              {t("recipes.serves", {
                count: recipe.servings,
                servings: formatServings(recipe.servings),
              })}
            </span>
          )}
          {perServing && <span>{perServing}</span>}
          {recipe.rating !== null && <RatingStars rating={recipe.rating} />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* New until it's made, then when it last was. */}
          {recipe.lastMadeAt ? (
            <Badge className="bg-accent text-accent-foreground">
              {t("recipes.madeWhen", {
                when: formatRelativeDate(recipe.lastMadeAt, i18n.language),
              })}
            </Badge>
          ) : (
            <Badge title={t("recipes.notMadeYet")}>{t("recipes.new")}</Badge>
          )}
          {onSale && onSale.length > 0 && <OnSaleBadge sales={onSale} />}
          {recipe.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              title={tag}
              className="max-w-full"
            >
              <span className="truncate">{tag}</span>
            </Badge>
          ))}
        </div>
      </div>
    </>
  )
}
