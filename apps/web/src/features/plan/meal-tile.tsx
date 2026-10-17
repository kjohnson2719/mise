import {
  ArrowMoveUpRightIcon,
  Cancel01Icon,
  CookingPotIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  Moon02Icon,
  NoteIcon,
  RefreshIcon,
  RotateLeft01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatMinutes } from "@/features/recipes/format"
import { SelectMark } from "@/features/select/select-mark"
import { useLongPress, type Selection } from "@/features/select/use-selection"
import { cn } from "@/lib/utils"

import { ChangeMealDialog } from "./change-meal-dialog"
import { useHouseholdClock, type PlanEntry } from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { splitWhy, useWhyText } from "./why"

/** Cooking a planned meal: its servings, and its side alongside. */
export function cookSearch(entry: PlanEntry) {
  const own = entry.recipe?.servings
  const scale =
    entry.servings != null && own
      ? Math.round((entry.servings / own) * 1000) / 1000
      : 1
  return {
    ...(scale !== 1 ? { scale } : {}),
    ...(entry.withRecipe ? { with: entry.withRecipe.slug } : {}),
  }
}

/** Its servings, as planned or the recipe's own. */
export const servingsOf = (entry: PlanEntry) =>
  entry.servings ?? entry.recipe?.servings ?? null

/**
 * A planned meal: its photo, name and what's worth knowing, everything
 * else in its menu. A long press on a phone starts selecting with it.
 */
export function MealTile({
  entry,
  selection,
}: {
  entry: PlanEntry
  selection: Selection
}) {
  const { t } = useTranslation()
  const whyText = useWhyText()
  const { reasons, leaveOut } = splitWhy(entry.why)
  const press = useLongPress(
    () => selection.start(entry.id),
    !selection.selecting
  )
  const name = entry.recipe?.name ?? entry.note ?? ""
  const skipped = entry.status === "skipped"
  const cooked = entry.status === "cooked"
  const servings = servingsOf(entry)
  const side = entry.withRecipe && (
    <span className="font-normal text-muted-foreground">
      {" "}
      {t("plan.withName", { name: entry.withRecipe.name })}
    </span>
  )

  if (selection.selecting) {
    const picked = selection.isPicked(entry.id)
    return (
      <li>
        <button
          type="button"
          aria-pressed={picked}
          onClick={() => selection.toggle(entry.id)}
          className={cn(
            "flex min-h-17 w-full items-center gap-3 rounded-2xl bg-muted/50 p-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            picked && "bg-accent ring-2 ring-primary"
          )}
        >
          <SelectMark picked={picked} className="shrink-0" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span
              className={cn(
                "truncate font-medium",
                skipped && "text-muted-foreground line-through"
              )}
            >
              {name}
              {side}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {cooked
                ? t("plan.cooked")
                : skipped
                  ? t("plan.skipped")
                  : entry.recipe
                    ? t(`plan.meals.${entry.meal}`)
                    : t("plan.aNote")}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <li
      className="flex min-h-17 items-center gap-3 rounded-2xl bg-muted/50 p-2.5"
      {...press}
    >
      {entry.recipe?.photo ? (
        <img
          src={entry.recipe.photo}
          alt=""
          className={cn(
            "size-12 shrink-0 rounded-xl object-cover",
            skipped && "opacity-50"
          )}
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <HugeiconsIcon
            icon={entry.recipe ? CookingPotIcon : NoteIcon}
            strokeWidth={2}
            className="size-5"
          />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        {entry.recipe ? (
          <Link
            to="/recipes/$slug"
            params={{ slug: entry.recipe.slug }}
            search={entry.withRecipe ? { with: entry.withRecipe.slug } : {}}
            className={cn(
              "truncate font-medium hover:underline",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {name}
            {side}
          </Link>
        ) : (
          <span
            className={cn(
              "truncate font-medium",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {name}
          </span>
        )}
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {cooked && (
            <span className="flex items-center gap-1 font-medium text-primary">
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("plan.cooked")}
            </span>
          )}
          {skipped && <span className="font-medium">{t("plan.skipped")}</span>}
          {entry.recipe
            ? [
                servings != null && t("plan.servings", { count: servings }),
                entry.recipe.totalMinutes != null &&
                  formatMinutes(t, entry.recipe.totalMinutes),
              ]
                .filter(Boolean)
                .join(" · ")
            : !cooked && !skipped && t("plan.aNote")}
        </span>
        {entry.status === "planned" && reasons.length > 0 && (
          <span className="truncate text-xs font-medium text-primary">
            {whyText(reasons)}
          </span>
        )}
        {entry.status === "planned" && leaveOut.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {whyText(leaveOut)}
          </span>
        )}
      </div>
      <MealMenu entry={entry} name={name} />
    </li>
  )
}

/** Cook, mark, skip, move or take off a meal. */
export function MealMenu({
  entry,
  name,
  large = false,
}: {
  entry: PlanEntry
  name: string
  /** As What's next shows it, beside its big buttons. */
  large?: boolean
}) {
  const { t } = useTranslation()
  const clock = useHouseholdClock()
  const actions = usePlanActions()
  const [changing, setChanging] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={large ? "outline" : "ghost"}
              size={large ? "icon-lg" : "icon-sm"}
              className={cn("shrink-0", !large && "rounded-full")}
              aria-label={t("plan.menu", { name })}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {entry.recipe && entry.status === "planned" && !large && (
            <DropdownMenuItem
              render={
                <Link
                  to="/recipes/$slug/cook"
                  params={{ slug: entry.recipe.slug }}
                  search={cookSearch(entry)}
                />
              }
            >
              <HugeiconsIcon icon={CookingPotIcon} strokeWidth={2} />
              {t("plan.startCooking")}
            </DropdownMenuItem>
          )}
          {entry.status === "cooked" ? (
            <DropdownMenuItem
              onClick={() => void actions.change(entry, { status: "planned" })}
            >
              <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={2} />
              {t("plan.notCooked")}
            </DropdownMenuItem>
          ) : (
            !large && (
              <DropdownMenuItem
                onClick={() => void actions.change(entry, { status: "cooked" })}
              >
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                {entry.recipe ? t("plan.markCooked") : t("plan.done")}
              </DropdownMenuItem>
            )
          )}
          {entry.status === "skipped" ? (
            <DropdownMenuItem
              onClick={() => void actions.change(entry, { status: "planned" })}
            >
              <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={2} />
              {t("plan.unskip")}
            </DropdownMenuItem>
          ) : (
            entry.status === "planned" && (
              <DropdownMenuItem
                onClick={() =>
                  void actions.change(entry, { status: "skipped" })
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                {t("plan.skip")}
              </DropdownMenuItem>
            )
          )}
          {entry.anyDay && (
            <DropdownMenuItem
              onClick={() =>
                void actions.change(entry, {
                  date: clock.today,
                  anyDay: false,
                  meal: clock.meals.includes("dinner") ? "dinner" : entry.meal,
                })
              }
            >
              <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
              {t("plan.tonight")}
            </DropdownMenuItem>
          )}
          {entry.recipe && entry.status === "planned" && !entry.anyDay && (
            <DropdownMenuItem onClick={() => void actions.somethingElse(entry)}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
              {t("plan.somethingElse")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setChanging(true)}>
            <HugeiconsIcon icon={ArrowMoveUpRightIcon} strokeWidth={2} />
            {t("plan.change")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void actions.remove(entry)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("plan.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {changing && (
        <ChangeMealDialog
          entry={entry}
          open={changing}
          onOpenChange={setChanging}
        />
      )}
    </>
  )
}
