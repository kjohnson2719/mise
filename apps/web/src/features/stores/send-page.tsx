import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { listQuery } from "@/features/list/queries"
import { ApiError } from "@/lib/api/client"

import { sendPlanQuery, type SendPlan } from "./queries"

/** Left out of this send: bought somewhere else, say. */
const OUT = "out"

type Item = SendPlan["items"][number]

/** What the person changed on this page, kept while the tab's open. */
type Choices = {
  /** Where things not picked at any store go. */
  rest: string | null
  /** Where each thing goes, when it isn't where it would. */
  where: Record<string, string>
}

const savedChoices = (list: string): Choices => {
  try {
    const saved = sessionStorage.getItem(`merran.send.${list}`)
    if (saved) return JSON.parse(saved) as Choices
  } catch {
    // Not kept in this tab; no harm.
  }
  return { rest: null, where: {} }
}

/**
 * Send, for one list: where each thing goes, then each store's part,
 * reviewed and sent one after the other. A thing goes to the store the
 * household picked a product at for it (the newest, when it's more than
 * one, which it says); the rest go to one store, chosen at the top; any
 * can be left out.
 */
export function SendPage({ list }: { list: string }) {
  const { t } = useTranslation()
  const plan = useQuery(sendPlanQuery(list))
  const { data: lists } = useQuery(listQuery)
  const name =
    lists && lists.lists.length > 1
      ? lists.lists.find((one) => one.id === list)?.name
      : undefined

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 self-start md:mt-4"
        render={<Link to="/list" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.list")}
      </Button>
      <PageHeader
        title={name ? t("send.titleFor", { list: name }) : t("send.title")}
        description={t("send.description")}
      />
      {plan.data ? (
        <Plan list={list} plan={plan.data} />
      ) : plan.isPending ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {plan.error instanceof ApiError
            ? plan.error.message
            : t("status.error.description")}
        </p>
      )}
    </>
  )
}

function Plan({ list, plan }: { list: string; plan: SendPlan }) {
  const { t } = useTranslation()
  const [choices, setChoices] = React.useState(() => savedChoices(list))
  React.useEffect(() => {
    try {
      sessionStorage.setItem(`merran.send.${list}`, JSON.stringify(choices))
    } catch {
      // Not kept in this tab; no harm.
    }
  }, [list, choices])

  const keys = plan.stores.map((store) => store.key)
  const nameOf = (key: string) =>
    plan.stores.find((store) => store.key === key)?.name ?? key
  /** Where a thing would go without the person saying: its newest pick. */
  const pickedAt = (item: Item) => item.picked.find((key) => keys.includes(key))
  // The rest go where most of what's picked goes, unless the person said.
  const busiest = keys
    .map((key) => ({
      key,
      count: plan.items.filter((item) => pickedAt(item) === key).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.key
  const rest =
    choices.rest && keys.includes(choices.rest) ? choices.rest : busiest
  const whereOf = (item: Item) => {
    const said = choices.where[item.itemId]
    if (said === OUT || (said && keys.includes(said))) return said
    return pickedAt(item) ?? rest ?? OUT
  }
  const move = (item: Item, where: string) =>
    setChoices((was) => ({
      ...was,
      where: { ...was.where, [item.itemId]: where },
    }))

  if (keys.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        {t("send.noStores")}
      </p>
    )
  }
  if (plan.items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        {t("send.nothing")}
      </p>
    )
  }

  const unpicked = plan.items.filter((item) => !pickedAt(item)).length
  const where = [
    ...plan.stores.map((store) => ({ value: store.key, label: store.name })),
    { value: OUT, label: t("send.leaveOut") },
  ]
  const parts = [...keys, OUT]
    .map((key) => ({
      key,
      items: plan.items.filter((item) => whereOf(item) === key),
    }))
    .filter((part) => part.items.length > 0)

  return (
    <div className="grid gap-4 pb-24">
      {keys.length > 1 && unpicked > 0 && (
        <div className="grid gap-2 rounded-2xl border p-4">
          <p className="font-medium">
            {t("send.restTitle", { count: unpicked })}
          </p>
          <p className="text-sm text-muted-foreground">{t("send.restHint")}</p>
          <ToggleGroup
            variant="outline"
            size="sm"
            value={rest ? [rest] : []}
            onValueChange={(value) => {
              const picked = value[0]
              if (picked) setChoices((was) => ({ ...was, rest: picked }))
            }}
            className="justify-start"
          >
            {plan.stores.map((store) => (
              <ToggleGroupItem key={store.key} value={store.key}>
                {store.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {parts.map((part) => {
        const out = part.key === OUT
        const sent = part.items.filter((item) => item.sent.includes(part.key))
        const to = part.key === "kroger" ? "/list/kroger" : "/list/walmart"
        return (
          <Card key={part.key}>
            <CardHeader>
              <CardTitle>
                {out
                  ? t("send.leftOut", { count: part.items.length })
                  : t("send.partTitle", {
                      store: nameOf(part.key),
                      count: part.items.length,
                    })}
              </CardTitle>
              {out ? (
                <CardDescription>{t("send.leftOutHint")}</CardDescription>
              ) : (
                sent.length > 0 && (
                  <CardDescription>
                    {sent.length === part.items.length
                      ? t("send.allSent", { store: nameOf(part.key) })
                      : t("send.someSent", {
                          count: sent.length,
                          store: nameOf(part.key),
                        })}
                  </CardDescription>
                )
              )}
              {!out && (
                <CardAction>
                  <Button
                    variant={
                      sent.length === part.items.length ? "outline" : "default"
                    }
                    render={
                      <Link
                        to={to}
                        search={{
                          items: part.items
                            .map((item) => item.itemId)
                            .join(","),
                          list,
                        }}
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={ShoppingCart01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("send.review", { store: nameOf(part.key) })}
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <ul className="grid divide-y">
                {part.items.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium first-letter:uppercase">
                        {item.name}
                        {item.amount && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {item.amount}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.picked.length > 1 && (
                          <Badge variant="outline">
                            {t("send.pickedAtBoth", {
                              stores: item.picked.map(nameOf).join(", "),
                            })}
                          </Badge>
                        )}
                        {item.picked.length === 0 && !out && (
                          <Badge variant="secondary">
                            {t("send.notPicked")}
                          </Badge>
                        )}
                        {!out && item.sent.includes(part.key) && (
                          <Badge variant="outline">{t("send.sentBadge")}</Badge>
                        )}
                      </div>
                    </div>
                    <Select
                      items={where}
                      value={whereOf(item)}
                      onValueChange={(next) => next && move(item, String(next))}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-40"
                        aria-label={t("send.whereFor", { name: item.name })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {where.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
