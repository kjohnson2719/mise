import {
  ArrowDataTransferHorizontalIcon,
  ArrowTurnBackwardIcon,
  MinusSignCircleIcon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { displayIngredient, type UnitSystem } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { formatServings } from "./format"
import type { Recipe } from "./queries"
import type { SwappedLine } from "./swaps/this-time"
import type { LeftOutLine } from "./use-tastes"

type Line = Recipe["ingredients"][number]

/** Lines grouped under their sections, in order. */
export function bySection<T extends { section: string | null }>(lines: T[]) {
  const groups: { section: string | null; lines: T[] }[] = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last && last.section === line.section) last.lines.push(line)
    else groups.push({ section: line.section, lines: [line] })
  }
  return groups
}

/** How many it's made for: the recipe's servings, or a multiple of it. */
export function useServings(recipe: Recipe) {
  const base = recipe.servings
  const [amount, setAmount] = React.useState(base ?? 1)
  const step = base === null || amount <= 2 ? 0.5 : 1
  return {
    /** What the amounts are multiplied by. */
    factor: base ? amount / base : amount,
    amount,
    base,
    more: () => setAmount((value) => value + step),
    fewer: () => setAmount((value) => Math.max(step, value - step)),
    reset: () => setAmount(base ?? 1),
    changed: amount !== (base ?? 1),
  }
}

export type Servings = ReturnType<typeof useServings>

/** − 4 servings + : making more or less of the recipe. */
export function ServingsStepper({ servings }: { servings: Servings }) {
  const { t } = useTranslation()
  const label = servings.base
    ? t("recipes.servings", {
        count: servings.amount,
        servings: formatServings(servings.amount),
      })
    : t("recipes.times", { factor: formatServings(servings.amount) })
  return (
    <div className="flex items-center gap-2">
      {/* Always laid out, on the far side from the +, so showing it never
          moves the stepper out from under a second tap. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={servings.reset}
        disabled={!servings.changed}
        aria-hidden={!servings.changed}
        className={cn(!servings.changed && "invisible")}
      >
        {t("recipes.reset")}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={servings.fewer}
        aria-label={t("recipes.fewerServings")}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <span
        className="min-w-24 text-center text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {label}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={servings.more}
        aria-label={t("recipes.moreServings")}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </div>
  )
}

/** A line as shown, at a scale and in units: "2 ½ tbsp tomato paste". */
function shownLine(
  text: string,
  options: { factor: number; system: UnitSystem }
) {
  const { amount, rest } = displayIngredient(text, options)
  return `${amount}${rest}`
}

/** Whether showing metric or US amounts would change any line. */
export function convertible(lines: Line[]) {
  return lines.some((line) =>
    (["metric", "us"] as const).some(
      (system) =>
        displayIngredient(line.text, { system }).amount !==
        displayIngredient(line.text).amount
    )
  )
}

/** As written, metric or US. */
export function UnitToggle({
  system,
  onChange,
  className,
}: {
  system: UnitSystem
  onChange: (system: UnitSystem) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[system]}
      onValueChange={(value) => {
        const next = value[0] as UnitSystem | undefined
        if (next) onChange(next)
      }}
      aria-label={t("recipes.units.label")}
      className={className}
    >
      {(["written", "metric", "us"] as const).map((value) => (
        <ToggleGroupItem key={value} value={value} className="grow">
          {t(`recipes.units.${value}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Ingredients ticked off while getting things out, by id. */
export function useTicks(initial: Iterable<string> = []) {
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(
    () => new Set(initial)
  )
  const toggle = React.useCallback(
    (id: string) =>
      setTicked((current) => {
        const next = new Set(current)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    []
  )
  const clear = React.useCallback(() => setTicked(new Set()), [])
  return { ticked, toggle, clear }
}

export type Ticks = ReturnType<typeof useTicks>

/**
 * The ingredients, with their amounts scaled and in the chosen units.
 * Each can be ticked off while getting things out; ones left out for
 * someone who doesn't like them are crossed off, saying who for.
 */
export function IngredientList({
  lines,
  factor,
  factorOf,
  system,
  ticks,
  highlighted,
  leftOut,
  swapped,
  onSwap,
  onUnswap,
  size = "default",
}: {
  lines: Line[]
  factor: number
  /** Each line's own factor, when they differ: a sauce made with a main. */
  factorOf?: (lineId: string) => number
  system: UnitSystem
  /** Ticks kept by the page, as the cook view does; otherwise kept here. */
  ticks?: Ticks
  /** Lines to pick out, like the ones the current step uses. */
  highlighted?: ReadonlySet<string>
  /** Lines left out for the household's dislikes, by id. */
  leftOut?: ReadonlyMap<string, LeftOutLine>
  /** Lines of a stand-in used this time, by id: what they're instead of. */
  swapped?: ReadonlyMap<string, SwappedLine>
  /** Offers stand-ins for a line. */
  onSwap?: (line: Line) => void
  /** Goes back to a swapped line's ingredient, by its id. */
  onUnswap?: (ingredientId: string) => void
  size?: "default" | "lg"
}) {
  const { t } = useTranslation()
  const own = useTicks()
  const { ticked, toggle } = ticks ?? own

  return (
    <div className="-mx-2 grid gap-5">
      {bySection(lines).map((group, index) => (
        <section key={index}>
          {group.section && (
            <h3 className="mb-1 px-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.section}
            </h3>
          )}
          <ul className="grid gap-0.5">
            {group.lines.map((line) => {
              const { amount, rest } = displayIngredient(line.text, {
                factor: factorOf?.(line.id) ?? factor,
                system,
              })
              const out = leftOut?.get(line.id)
              const swapButton = onSwap && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  aria-label={t("recipes.swaps.button", { line: line.text })}
                  title={t("recipes.swaps.button", { line: line.text })}
                  onClick={() => onSwap(line)}
                >
                  <HugeiconsIcon
                    icon={ArrowDataTransferHorizontalIcon}
                    strokeWidth={2}
                  />
                </Button>
              )
              if (out) {
                return (
                  <li key={line.id} className="group flex items-start gap-1">
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-1.5 text-muted-foreground",
                        size === "lg" && "py-2"
                      )}
                    >
                      <HugeiconsIcon
                        icon={MinusSignCircleIcon}
                        strokeWidth={2}
                        className={cn(
                          "size-4 shrink-0",
                          size === "lg" ? "mt-1.5" : "mt-1"
                        )}
                      />
                      <span
                        className={cn(
                          "leading-snug",
                          size === "lg" ? "text-lg" : "text-base"
                        )}
                      >
                        <span className="line-through">
                          {amount && (
                            <span className="font-semibold">{amount}</span>
                          )}
                          {rest}
                        </span>{" "}
                        <span className="text-sm whitespace-nowrap">
                          {out.who
                            ? t("recipes.tastes.lineFor", { who: out.who })
                            : t("recipes.tastes.line")}
                        </span>
                      </span>
                    </div>
                    {swapButton}
                  </li>
                )
              }
              const done = ticked.has(line.id)
              const swap = swapped?.get(line.id)
              return (
                <li key={line.id} className="group flex items-start gap-1">
                  <label
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60",
                      highlighted?.has(line.id) &&
                        !done &&
                        "bg-accent text-accent-foreground hover:bg-accent/80",
                      size === "lg" && "py-2"
                    )}
                  >
                    <Checkbox
                      checked={done}
                      onCheckedChange={() => toggle(line.id)}
                      className={size === "lg" ? "mt-1" : "mt-0.5"}
                    />
                    <span
                      className={cn(
                        "leading-snug",
                        size === "lg" ? "text-lg" : "text-base",
                        done && "text-muted-foreground line-through"
                      )}
                    >
                      {amount && (
                        <span className="font-semibold">{amount}</span>
                      )}
                      {rest}
                      {swap && (
                        <span className="ml-1.5 text-sm text-primary">
                          {t("recipes.swaps.insteadOf", {
                            line: shownLine(swap.insteadOf, {
                              factor: factorOf?.(line.id) ?? factor,
                              system,
                            }),
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                  {swap
                    ? onUnswap && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                          aria-label={t("recipes.swaps.unswap", {
                            line: swap.insteadOf,
                          })}
                          title={t("recipes.swaps.unswap", {
                            line: swap.insteadOf,
                          })}
                          onClick={() => onUnswap(swap.ingredientId)}
                        >
                          <HugeiconsIcon
                            icon={ArrowTurnBackwardIcon}
                            strokeWidth={2}
                          />
                        </Button>
                      )
                    : swapButton}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
