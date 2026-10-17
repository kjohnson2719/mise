import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { MEALS } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { householdQuery, isAdminRole } from "@/features/household/queries"

import { useHouseholdClock, type Meal } from "./queries"

/** The meals the household turned off: on the plan, but never filled for it. */
export function useNotFilled(): Meal[] {
  const clock = useHouseholdClock()
  return MEALS.filter((meal) => !clock.meals.includes(meal))
}

/** "Breakfast and snacks", in the reader's language. */
function useMealNames(meals: readonly Meal[]) {
  const { t, i18n } = useTranslation()
  return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(
    meals.map((meal) => t(`plan.mealNames.${meal}`))
  )
}

/**
 * Why a meal stays empty when the week's filled: it's turned off in
 * Settings → Household → Planning. It can still be planned by hand, and an
 * admin can turn it back on.
 */
function Why({ meals }: { meals: readonly Meal[] }) {
  const { t } = useTranslation()
  const { data: household } = useQuery(householdQuery)
  const names = useMealNames(meals)
  return (
    <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] gap-3">
      <PopoverHeader>
        <PopoverTitle>
          {t("plan.notFilled.title", { count: meals.length, meals: names })}
        </PopoverTitle>
        <PopoverDescription>
          {t("plan.notFilled.why", { count: meals.length, meals: names })}
        </PopoverDescription>
      </PopoverHeader>
      {household && isAdminRole(household.role) ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          render={<Link to="/settings/household" />}
        >
          {t("plan.notFilled.change")}
        </Button>
      ) : (
        <p className="text-muted-foreground">{t("plan.notFilled.askAdmin")}</p>
      )}
    </PopoverContent>
  )
}

/** A small (i) by a meal's label: this one isn't filled for you. */
export function NotFilledIcon({ meal }: { meal: Meal }) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={t("plan.notFilled.label", {
              meal: t(`plan.meals.${meal}`),
            })}
            title={t("plan.notFilled.short")}
          />
        }
      >
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
      </PopoverTrigger>
      <Why meals={[meal]} />
    </Popover>
  )
}

/** By how full the week is: "Breakfast and snacks are up to you". */
export function NotFilledNote({ meals }: { meals: readonly Meal[] }) {
  const { t } = useTranslation()
  const names = useMealNames(meals)
  if (meals.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        }
      >
        <HugeiconsIcon
          icon={InformationCircleIcon}
          strokeWidth={2}
          className="size-4"
        />
        {t("plan.notFilled.note", { count: meals.length, meals: names })}
      </PopoverTrigger>
      <Why meals={meals} />
    </Popover>
  )
}
