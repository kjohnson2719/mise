import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatMonthDay } from "@/features/plan/format"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { listQuery, usualQuery, type UsualBuy } from "./queries"

/** How many show before Show more. */
const SHOWN = 3

const capitalised = (name: string) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1)}`

/**
 * What the household buys every so often and is about due for, learned
 * from the shopping it's put away: "Milk? You last got some Oct 9."
 * Add puts it on the list as it was last bought; Not now leaves it until
 * it's due again.
 */
export function UsualBuys() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(usualQuery)
  const [all, setAll] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const due = data?.items ?? []
  if (due.length === 0) return null
  const shown = all ? due : due.slice(0, SHOWN)

  /** Takes them off the card straight away, before the server answers. */
  function hide(foods: string[]) {
    queryClient.setQueryData(usualQuery.queryKey, (usual) =>
      usual
        ? {
            items: usual.items.filter((item) => !foods.includes(item.food)),
          }
        : usual
    )
  }

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
    }
  }

  const add = (buys: UsualBuy[]) =>
    run(async () => {
      const foods = buys.map((buy) => buy.food)
      const { items } = await unwrap(
        api.POST("/api/list/usual/add", { body: { foods } })
      )
      hide(foods)
      // Nothing when they'd gone on the list some other way meanwhile.
      if (items.length === 0) return
      toast.success(
        items.length === 1
          ? t("list.usual.added", { name: items[0]!.name })
          : t("list.usual.addedAll", { count: items.length })
      )
    })

  const skip = (buy: UsualBuy) =>
    run(async () => {
      hide([buy.food])
      await unwrap(
        api.POST("/api/list/usual/skip", { body: { food: buy.food } })
      )
    })

  return (
    <section
      aria-labelledby="usual-buys"
      className="rounded-3xl border bg-card px-5 py-4 text-card-foreground md:px-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="usual-buys" className="font-heading font-medium">
            {t("list.usual.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("list.usual.hint")}
          </p>
        </div>
        {due.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void add(due)}
          >
            {t("list.usual.addAll")}
          </Button>
        )}
      </div>
      <ul className="mt-3 divide-y">
        {shown.map((buy) => (
          <li
            key={buy.food}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5"
          >
            <p className="min-w-0 text-sm">
              <Trans
                i18nKey="list.usual.ask"
                values={{
                  name: capitalised(buy.name),
                  date: formatMonthDay(buy.lastBought, i18n.language),
                }}
                components={{ b: <span className="font-medium" /> }}
              />
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void add([buy])}
                aria-label={t("list.usual.addLabel", { name: buy.name })}
              >
                {t("list.usual.add")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void skip(buy)}
                aria-label={t("list.usual.notNowLabel", { name: buy.name })}
              >
                {t("list.usual.notNow")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {due.length > SHOWN && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3"
          onClick={() => setAll(!all)}
        >
          {all
            ? t("list.usual.fewer")
            : t("list.usual.more", { count: due.length - SHOWN })}
        </Button>
      )}
    </section>
  )
}
