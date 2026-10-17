import { levelOf } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import type { Recipe } from "./queries"
import { useSetNeeds, type RecipeTastes } from "./use-tastes"

/**
 * What the household's tastes make of a recipe, above its ingredients:
 * what's left out and who for, with a way to say the recipe needs it, and
 * what keeps it from being suggested.
 */
export function TastesNote({
  recipe,
  tastes,
  onStandIn,
}: {
  recipe: Recipe
  tastes: RecipeTastes
  /** Offers stand-ins for a line left out, by its place in the lines. */
  onStandIn?: (line: number) => void
}) {
  const { t, i18n } = useTranslation()
  const needs = useSetNeeds(recipe)
  if (tastes.leaveOut.length === 0 && tastes.ruledOut.length === 0) return null
  // Foods it can't be checked for, as Merran can't read its ingredients
  // (a recipe kept in Arabic, say): said once, not as foods it has.
  const unchecked = new Set(tastes.unchecked.map((item) => item.food))
  const allergy = tastes.unchecked.some((item) => item.level === "allergy")

  return (
    <ul className="grid gap-1.5" aria-label={t("recipes.tastes.label")}>
      {tastes.leaveOut.map(({ food, who, swap, lines }) => (
        <Note
          key={`out:${food}`}
          text={
            swap
              ? who
                ? t("recipes.tastes.swapping", { food, who })
                : t("recipes.tastes.swappingAll", { food })
              : who
                ? t("recipes.tastes.leaving", { food, who })
                : t("recipes.tastes.leavingAll", { food })
          }
          action={t("recipes.tastes.need", { food })}
          disabled={needs.saving}
          onAction={() => void needs.need(food)}
          other={
            onStandIn && lines[0] !== undefined
              ? {
                  label: t("recipes.swaps.standIn"),
                  onClick: () => onStandIn(lines[0]!),
                }
              : undefined
          }
        />
      ))}
      {unchecked.size > 0 && (
        <Note
          text={
            allergy
              ? t("recipes.tastes.unreadAllergy")
              : t("recipes.tastes.unread", {
                  foods: new Intl.ListFormat(i18n.language, {
                    type: "disjunction",
                  }).format(unchecked),
                })
          }
          tone={allergy ? "warning" : "muted"}
        />
      )}
      {tastes.ruledOut.map((item) => {
        const { food, who } = item
        if (unchecked.has(food)) return null
        const level = levelOf(item)
        // A dislike that's usually left out, but not from this one: the
        // household said so, or tidy up marked it. One it's named for has
        // no way back, until tidy up marks it.
        const by = tastes.needed.find((need) => need.food === food)?.by
        const needed = by === "household" || by === "mark"
        const text = needed
          ? who
            ? t("recipes.tastes.needed", { food, who })
            : t("recipes.tastes.neededAll", { food })
          : level === "leave-out"
            ? who
              ? t("recipes.tastes.dish", { food, who })
              : t("recipes.tastes.dishAll", { food })
            : level === "allergy"
              ? who
                ? t("recipes.tastes.allergy", { food, who })
                : t("recipes.tastes.allergyAll", { food })
              : who
                ? t("recipes.tastes.never", { food, who })
                : t("recipes.tastes.neverAll", { food })
        return (
          <Note
            key={`ruled:${food}`}
            text={text}
            tone={level === "allergy" ? "warning" : "muted"}
            action={needed ? t("recipes.tastes.canLeaveOut") : undefined}
            disabled={needs.saving}
            onAction={() => void needs.leaveOut(food)}
          />
        )
      })}
    </ul>
  )
}

function Note({
  text,
  tone = "muted",
  action,
  disabled,
  onAction,
  other,
}: {
  text: string
  tone?: "muted" | "warning"
  action?: string
  disabled?: boolean
  onAction?: () => void
  /** Another way out, like finding a stand-in. */
  other?: { label: string; onClick: () => void }
}) {
  return (
    <li
      className={
        tone === "warning"
          ? "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground"
      }
    >
      <span className="min-w-0">{text}</span>
      {(action || other) && (
        <span className="-my-1 -mr-2 flex flex-wrap gap-1">
          {other && (
            <Button variant="ghost" size="sm" onClick={other.onClick}>
              {other.label}
            </Button>
          )}
          {action && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onAction}
            >
              {action}
            </Button>
          )}
        </span>
      )}
    </li>
  )
}
