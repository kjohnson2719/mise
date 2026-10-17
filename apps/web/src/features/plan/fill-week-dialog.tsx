import {
  Cancel01Icon,
  CookingPotIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { dayOfWeek, type WeekThemes } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatMinutes } from "@/features/recipes/format"
import { ApiError } from "@/lib/api/client"

import { formatWeekday } from "./format"
import {
  suggest,
  useHouseholdClock,
  type Meal,
  type PlanEntry,
  type PlanSlot,
  type Suggestion,
} from "./queries"
import { usePlanActions } from "./use-plan-actions"
import { splitWhy, useWhyText } from "./why"

const slotKey = (slot: PlanSlot) => `${slot.date}:${slot.meal}`

/** Recipe ideas for a week's empty meals, from today on, each saying why. */
export function FillWeekDialog({
  open,
  onOpenChange,
  days,
  entries,
  themes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: string[]
  /** What's planned in the week already. */
  entries: PlanEntry[]
  themes: WeekThemes
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("plan.fill.title")}</DialogTitle>
          <DialogDescription>{t("plan.fill.description")}</DialogDescription>
        </DialogHeader>
        {open && (
          <FillWeek
            days={days}
            entries={entries}
            themes={themes}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The ideas: re-roll any or leave it out, and nothing goes on the plan
 * until Add.
 */
function FillWeek({
  days,
  entries,
  themes,
  onDone,
}: {
  days: string[]
  entries: PlanEntry[]
  themes: WeekThemes
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const clock = useHouseholdClock()
  const actions = usePlanActions()
  const whyText = useWhyText()
  const [chosen, setChosen] = React.useState<Meal[]>(
    clock.meals.includes("dinner") ? ["dinner"] : [...clock.meals]
  )
  /** Re-rolled ideas, and ideas left out (null), by slot. */
  const [changes, setChanges] = React.useState<
    Record<string, Suggestion | null>
  >({})
  /** Ideas passed over, so a re-roll doesn't bring them back. */
  const [passed, setPassed] = React.useState<string[]>([])
  const [rolling, setRolling] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const upcoming = days.filter((day) => day >= clock.today)
  const taken = new Set(
    entries.filter((entry) => !entry.anyDay).map((entry) => slotKey(entry))
  )
  // Leftovers and eat-out nights stay empty.
  const skipNight = (slot: PlanSlot) =>
    slot.meal === "dinner" && themes[dayOfWeek(slot.date)]?.kind === "skip"
  const slots = upcoming.flatMap((date) =>
    clock.meals
      .filter((meal) => chosen.includes(meal))
      .map((meal) => ({ date, meal }))
      .filter((slot) => !taken.has(slotKey(slot)) && !skipNight(slot))
  )
  const ideas = useQuery({
    queryKey: ["plan", "suggest", slots],
    queryFn: () => suggest(slots),
    enabled: slots.length > 0,
    // Fresh ideas each time it opens; the same ones while it's open.
    staleTime: Infinity,
    gcTime: 0,
  })

  const fromServer = new Map(
    (ideas.data?.suggestions ?? []).map((idea) => [slotKey(idea), idea])
  )
  const rows = slots.flatMap((slot) => {
    const key = slotKey(slot)
    const idea = key in changes ? changes[key] : fromServer.get(key)
    return idea ? [{ ...idea, key }] : []
  })
  const unfilled = slots.filter((slot) => {
    const key = slotKey(slot)
    return !(key in changes) && !fromServer.has(key)
  }).length
  const when = (slot: PlanSlot) =>
    `${formatWeekday(slot.date, i18n.language)} · ${t(`plan.meals.${slot.meal}`)}`

  async function reroll(row: (typeof rows)[number]) {
    setRolling(row.key)
    try {
      const exclude = [
        ...new Set([...rows.map((other) => other.recipe.id), ...passed]),
      ].slice(0, 200)
      const [next] = (await suggest([row], exclude)).suggestions
      if (!next) {
        toast(t("plan.fill.noOther", { when: when(row) }))
        return
      }
      setPassed((ids) => [...ids, row.recipe.id])
      setChanges((current) => ({ ...current, [row.key]: next }))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setRolling(null)
    }
  }

  async function addAll() {
    setAdding(true)
    const added = await actions.addMany(
      rows.map((row) => ({
        date: row.date,
        meal: row.meal,
        recipe: row.recipe.id,
        withRecipe: row.withRecipe?.id ?? null,
        why: row.why,
      }))
    )
    setAdding(false)
    if (added) onDone()
  }

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("plan.fill.over")}</p>
    )
  }

  return (
    <div className="grid min-w-0 gap-4">
      {clock.meals.length > 1 && (
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          value={chosen}
          onValueChange={(value) => {
            if (value.length) setChosen(value as Meal[])
          }}
          aria-label={t("plan.fill.meals")}
          className="flex-wrap"
        >
          {clock.meals.map((meal) => (
            <ToggleGroupItem key={meal} value={meal}>
              {t(`plan.meals.${meal}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("plan.fill.allPlanned")}
        </p>
      ) : ideas.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: Math.min(slots.length, 4) }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : ideas.isError ? (
        <p className="text-sm text-muted-foreground">{t("plan.fill.failed")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {unfilled ? t("plan.fill.nothing") : t("plan.fill.nothingLeft")}
        </p>
      ) : (
        <ul className="-mx-1 grid max-h-[55vh] gap-1 overflow-y-auto px-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-1">
              {row.recipe.photo ? (
                <img
                  src={row.recipe.photo}
                  alt=""
                  className="size-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    icon={CookingPotIcon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </span>
              )}
              <div className="grid min-w-0 flex-1">
                <span className="truncate text-xs text-muted-foreground">
                  {when(row)}
                </span>
                <span className="truncate font-medium">
                  {row.recipe.name}
                  {row.withRecipe && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      {t("plan.withName", { name: row.withRecipe.name })}
                    </span>
                  )}
                </span>
                {splitWhy(row.why).reasons.length > 0 ? (
                  <span className="truncate text-xs font-medium text-primary">
                    {whyText(splitWhy(row.why).reasons)}
                  </span>
                ) : (
                  row.recipe.totalMinutes != null && (
                    <span className="text-xs text-muted-foreground">
                      {formatMinutes(t, row.recipe.totalMinutes)}
                    </span>
                  )
                )}
                {splitWhy(row.why).leaveOut.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {whyText(splitWhy(row.why).leaveOut)}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("plan.fill.reroll", { when: when(row) })}
                title={t("plan.somethingElse")}
                disabled={rolling !== null}
                onClick={() => void reroll(row)}
              >
                {rolling === row.key ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("plan.fill.leaveOut", { when: when(row) })}
                title={t("plan.fill.leaveOut", { when: when(row) })}
                onClick={() =>
                  setChanges((current) => ({ ...current, [row.key]: null }))
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && unfilled > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("plan.fill.unfilled", { count: unfilled })}
        </p>
      )}

      <DialogFooter>
        <Button variant={rows.length ? "ghost" : "outline"} onClick={onDone}>
          {rows.length ? t("plan.fill.cancel") : t("plan.fill.close")}
        </Button>
        {rows.length > 0 && (
          <Button disabled={adding} onClick={() => void addAll()}>
            {adding && <Spinner data-icon="inline-start" />}
            {t("plan.fill.add", { count: rows.length })}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
