import { useTranslation } from "react-i18next"

import { useHouseholdClock } from "./queries"
import type { WhenWords } from "./when"

/** The words for naming days and weeks, in the reader's language. */
export function useWhenWords(): WhenWords {
  const { t, i18n } = useTranslation()
  const { today } = useHouseholdClock()
  return {
    today,
    language: i18n.language,
    todayWord: t("plan.today"),
    anyDayOf: (week) => t("plan.anyDayOf", { week }),
  }
}
