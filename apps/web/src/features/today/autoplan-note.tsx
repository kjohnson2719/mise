import { SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { autoplanNews } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { formatWeek } from "@/features/plan/format"
import { autoplanQuery, useHouseholdClock } from "@/features/plan/queries"

const seenKey = (at: string) => `merran.autoplanSeen.${at}`

function seenOnThisDevice(at: string) {
  try {
    return localStorage.getItem(seenKey(at)) === "1"
  } catch {
    return false
  }
}

/**
 * The week the autoplan planned, to look over: shown for a few days after
 * it runs, until Got it on this device.
 */
export function AutoplanNote() {
  const { t, i18n } = useTranslation()
  const { today } = useHouseholdClock()
  const { data } = useQuery(autoplanQuery)
  const last = data?.last ?? null
  const [seen, setSeen] = React.useState<string | null>(null)
  if (!last || !autoplanNews(last, today)) return null
  if (seen === last.at || seenOnThisDevice(last.at)) return null

  function gotIt() {
    try {
      localStorage.setItem(seenKey(last!.at), "1")
    } catch {
      // Not remembered: it shows again next time.
    }
    setSeen(last!.at)
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <HugeiconsIcon
        icon={SparklesIcon}
        strokeWidth={2}
        className="size-5 shrink-0 text-primary"
      />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          {t("today.autoplan.title", {
            week: formatWeek(last.week, i18n.language),
          })}
        </span>{" "}
        {t("today.autoplan.planned", { count: last.planned })}
        {last.listed > 0 &&
          ` ${t("today.autoplan.listed", { count: last.listed })}`}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          render={<Link to="/plan" search={{ week: last.week }} />}
        >
          {t("today.autoplan.see")}
        </Button>
        <Button size="sm" variant="ghost" onClick={gotIt}>
          {t("today.autoplan.gotIt")}
        </Button>
      </div>
    </div>
  )
}
