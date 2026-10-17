import { useTranslation } from "react-i18next"

import { formatMinutes } from "@/features/recipes/format"
import type { Schemas } from "@/lib/api/client"

export type Reason = Schemas["Reason"]

/**
 * A meal's reasons, and apart from them what to leave out of it, which
 * gets a line of its own so it isn't cut off.
 */
export function splitWhy(why: readonly Reason[]) {
  return {
    reasons: why.filter((reason) => reason.kind !== "leaveOut"),
    leaveOut: why.filter((reason) => reason.kind === "leaveOut"),
  }
}

/** Says why a meal was picked: "Taco night · Rated 5 stars". */
export function useWhyText() {
  const { t, i18n } = useTranslation()
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" })
  return (why: readonly Reason[]) =>
    why
      .map((reason) => {
        switch (reason.kind) {
          case "theme":
            return t("plan.why.theme", { label: reason.label })
          case "themeMissed":
            return t("plan.why.themeMissed", { label: reason.label })
          case "usesUp":
            return t("plan.why.usesUp", { foods: list.format(reason.foods) })
          case "onSale":
            return reason.lowest
              ? t("plan.why.onSaleLowest", { foods: list.format(reason.foods) })
              : t("plan.why.onSale", { foods: list.format(reason.foods) })
          case "new":
            return t("plan.why.new")
          case "notLately":
            return t("plan.why.notLately", { count: reason.weeks })
          case "rated":
            return t("plan.why.rated", { count: reason.stars })
          case "quick":
            return t("plan.why.quick", {
              time: formatMinutes(t, reason.minutes),
            })
          case "leaveOut":
            return t("plan.why.leaveOut", {
              foods: list.format(
                reason.foods.map(({ food, who }) =>
                  who ? t("plan.why.leaveOutFor", { food, who }) : food
                )
              ),
            })
        }
      })
      .join(" · ")
}
