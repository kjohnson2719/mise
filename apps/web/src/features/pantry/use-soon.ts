import { addDays } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { formatMonthDay, formatShortWeekday } from "@/features/plan/format"
import { useHouseholdClock } from "@/features/plan/queries"

import type { PantryItem, UseSoon } from "./queries"

// Saying when to use food: the pantry's and Today's.

/**
 * "Today", "Tomorrow", "Wed" this week, "Oct 20" after; in a sentence,
 * "today" and "tomorrow".
 */
export function useDayLabel() {
  const { t, i18n } = useTranslation()
  const { today } = useHouseholdClock()
  return (day: string, inSentence = false) =>
    day === today
      ? inSentence
        ? t("pantry.soon.todayInline")
        : t("pantry.soon.today")
      : day === addDays(today, 1)
        ? inSentence
          ? t("pantry.soon.tomorrowInline")
          : t("pantry.soon.tomorrow")
        : day > today && day <= addDays(today, 6)
          ? formatShortWeekday(day, i18n.language)
          : formatMonthDay(day, i18n.language)
}

/** Most urgent first: past dates, then by date, then leftovers. */
export const urgency = (soon: UseSoon) =>
  soon.kind === "leftover" ? Number.MAX_SAFE_INTEGER : Date.parse(soon.date)

/** The meal a leftover was bought for: the one skipped, or gone by uncooked. */
export function missedMeal(item: PantryItem, today: string) {
  return item.meals.find(
    (meal) =>
      meal.status === "skipped" ||
      (meal.status === "planned" && meal.date < today)
  )
}
