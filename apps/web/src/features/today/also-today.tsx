import { useTranslation } from "react-i18next"

import type { PlanEntry } from "@/features/plan/queries"

/** Today's planned meals besides the big one: "Easy pancakes for lunch". */
export function AlsoToday({ entries }: { entries: PlanEntry[] }) {
  const { t, i18n } = useTranslation()
  if (entries.length === 0) return null
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" })
  return (
    <p className="text-sm text-muted-foreground">
      {t("today.also", {
        meals: list.format(
          entries.map((entry) =>
            t(`today.alsoMeal.${entry.status}`, {
              name: entry.recipe?.name ?? entry.note ?? "",
              meal: t(`plan.meals.${entry.meal}`).toLowerCase(),
            })
          )
        ),
      })}
    </p>
  )
}
