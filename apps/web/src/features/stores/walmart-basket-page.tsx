import {
  ArrowLeft01Icon,
  Search01Icon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  priceNow,
  type ExtensionCalls,
  type ExtensionNo,
  type ExtensionStatus,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useActiveHousehold } from "@/features/auth/use-me"
import {
  callExtension,
  ExtensionError,
  useExtension,
} from "@/features/extension/bridge"
import { ExtensionSetup } from "@/features/extension/extension-setup"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { BasketLineRow } from "./basket-line"
import { ProductSearchDialog } from "./product-search-dialog"
import {
  formatPrice,
  walmartBasketQuery,
  type BasketLine,
  type StoreProduct,
} from "./queries"
import { WalmartJobCard } from "./walmart-job"

type WalmartBasket = Schemas["WalmartBasket"]

/**
 * The list at Walmart (experimental): a product for each thing and how
 * many, to look over before Merran's browser extension fills the cart in
 * a Walmart tab of the person's own. Merran never reaches Walmart itself,
 * and never gets past Walmart's check that it's a person: the extension
 * stops, and this page asks the person to finish it in the tab and carry
 * on. Checking out is always theirs, on Walmart's site.
 */
export function WalmartBasketPage() {
  const { t } = useTranslation()
  const basket = useQuery(walmartBasketQuery)

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
      {basket.data ? (
        <Walmart basket={basket.data} />
      ) : basket.isPending ? (
        <>
          <PageHeader title={t("stores.walmart.title")} />
          <div className="grid gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <PageHeader title={t("stores.basket.failedTitle")} />
          <div className="grid justify-items-start gap-3">
            <p className="text-muted-foreground">
              {basket.error instanceof ApiError
                ? basket.error.message
                : t("status.error.description")}
            </p>
            <Button variant="outline" onClick={() => void basket.refetch()}>
              {t("stores.basket.again")}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

/** What the extension said no for, as the person reads it. */
function useSaidNo() {
  const { t } = useTranslation()
  return (answer: { ok: false; why: ExtensionNo; message?: string } | null) =>
    answer === null
      ? t("stores.walmart.no.noAnswer")
      : (answer.message ?? t(`stores.walmart.no.${answer.why}`))
}

function Walmart({ basket }: { basket: WalmartBasket }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { today } = useHouseholdClock()
  const household = useActiveHousehold()
  const extension = useExtension()
  const saidNo = useSaidNo()
  const status: ExtensionStatus | null =
    extension.state === "here" ? extension.status : null
  const connected =
    status?.households.some((one) => one.id === household?.id) ?? false
  const ready = connected && status?.walmart.access === true
  const job = status?.job ?? null
  const working = job?.state === "running"
  // Stopped part way, or at Walmart's check: carried on or put aside first.
  const paused = job?.state === "check" || job?.state === "stopped"

  // The cart as Merran has it, again each time the extension moves on: what
  // it found, Merran's picks, and what went in the cart.
  const moved = job ? `${job.kind} ${job.state} ${job.done}` : ""
  React.useEffect(() => {
    if (moved) {
      void queryClient.invalidateQueries({
        queryKey: walmartBasketQuery.queryKey,
      })
    }
  }, [moved, queryClient])

  // Going unless it's left out: what's out of stock, and what went last
  // time, so nothing goes to the cart twice.
  const [chosen, setChosen] = React.useState<Record<string, boolean>>({})
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [picking, setPicking] = React.useState<BasketLine | null>(null)
  const [asking, setAsking] = React.useState<string | null>(null)

  // Afresh after each fill: what went is left out next time.
  const [sentAt, setSentAt] = React.useState(basket.sentAt)
  if (sentAt !== basket.sentAt) {
    setSentAt(basket.sentAt)
    setChosen({})
    setCounts({})
  }

  const isOn = (line: BasketLine) =>
    Boolean(line.product) &&
    (chosen[line.itemId] ?? (line.product!.inStock && !line.sent))
  const packagesOf = (line: BasketLine) => counts[line.itemId] ?? line.packages
  const going = basket.lines.filter(isOn)
  const total = going.reduce((sum, line) => {
    const price = priceNow(line.product!, today).price
    return price === null ? sum : sum + price * packagesOf(line)
  }, 0)
  const unpriced = going.some(
    (line) => priceNow(line.product!, today).price === null
  )

  /** Asks the extension to do something, and says if it didn't. */
  async function ask<
    C extends "walmart-find" | "walmart-fill" | "walmart-carry-on",
  >(what: C, args: ExtensionCalls[C]["args"]) {
    setAsking(what)
    try {
      const answer = (await callExtension(what, args)) as
        ExtensionCalls["walmart-find"]["answer"] | null
      if (!answer?.ok) toast.error(saidNo(answer))
    } finally {
      setAsking(null)
    }
  }

  const find = () =>
    household && void ask("walmart-find", { householdId: household.id })

  const fill = () =>
    household &&
    void ask("walmart-fill", {
      householdId: household.id,
      lines: going.map((line) => ({
        itemId: line.itemId,
        packages: packagesOf(line),
      })),
    })

  /** Walmart's search, in the person's Walmart tab, for picking by hand. */
  async function search(words: string): Promise<StoreProduct[] | null> {
    if (!household) return null
    // No extension to search with: say so now, not after waiting for it.
    if (!ready) throw new ExtensionError(t("stores.walmart.no.searchSetup"))
    const answer = await callExtension(
      "walmart-search",
      { householdId: household.id, words },
      60_000
    )
    if (answer?.ok) return answer.products
    if (answer?.why === "check") {
      toast.warning(t("stores.walmart.no.searchCheck"), {
        action: {
          label: t("stores.walmart.job.showTab"),
          onClick: () => void callExtension("walmart-show", {}),
        },
      })
      return null
    }
    throw new ExtensionError(saidNo(answer))
  }

  /** What Walmart had for it when the extension looked: no Walmart visit. */
  const options = async (line: BasketLine) =>
    (
      await unwrap(
        api.GET("/api/stores/walmart/products/{itemId}", {
          params: { path: { itemId: line.itemId } },
        })
      )
    ).products

  const pick = (line: BasketLine, product: StoreProduct) =>
    unwrap(
      api.PUT("/api/stores/walmart/products/{itemId}", {
        params: { path: { itemId: line.itemId } },
        body: { product: product as Schemas["WalmartProduct"] },
      })
    )

  function picked(line: BasketLine) {
    queryClient.setQueryData(walmartBasketQuery.queryKey, (was) =>
      was
        ? {
            ...was,
            lines: was.lines.map((old) =>
              old.itemId === line.itemId ? line : old
            ),
          }
        : was
    )
    setCounts(({ [line.itemId]: _, ...rest }) => rest)
    setChosen((was) => ({ ...was, [line.itemId]: true }))
  }

  return (
    <>
      <PageHeader
        title={t("stores.walmart.title")}
        description={t("stores.walmart.description")}
        actions={
          <Button
            disabled={
              !ready ||
              working ||
              paused ||
              going.length === 0 ||
              asking !== null
            }
            onClick={fill}
          >
            {asking === "walmart-fill" ? (
              <Spinner />
            ) : (
              <HugeiconsIcon
                icon={ShoppingCart01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {t("stores.walmart.send", { count: going.length })}
          </Button>
        }
      />

      <div className="grid gap-4 pb-24">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t("stores.walmart.experimental")}</Badge>
          {basket.sentAt && (
            <span className="text-sm text-muted-foreground">
              {t("stores.basket.sentBefore", {
                when: formatRelativeDate(basket.sentAt, i18n.language),
              })}
            </span>
          )}
        </div>

        {!ready && household && (
          <ExtensionSetup
            extension={extension}
            householdId={household.id}
            household={household.name}
            description={t("stores.walmart.setup")}
            also={{
              title: t("stores.walmart.access.title"),
              text: t("stores.walmart.access.text"),
              done: status?.walmart.access === true,
              action: (
                <Button
                  onClick={() => void callExtension("walmart-access", {})}
                >
                  {t("stores.walmart.access.button")}
                </Button>
              ),
            }}
          />
        )}

        {job && (
          <WalmartJobCard
            job={job}
            cartUrl={basket.cartUrl}
            onShowTab={() => void callExtension("walmart-show", {})}
            onStop={() => void callExtension("walmart-stop", {})}
            onCarryOn={() => void ask("walmart-carry-on", {})}
            onDismiss={() => void callExtension("walmart-dismiss", {})}
          />
        )}

        {basket.toFind.length > 0 && !working && !paused && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
            <div className="grid gap-1">
              <p className="font-medium">
                {t("stores.walmart.toFind", { count: basket.toFind.length })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("stores.walmart.toFindHint")}
              </p>
            </div>
            <Button
              variant={going.length === 0 ? "default" : "outline"}
              disabled={!ready || asking !== null}
              onClick={find}
            >
              {asking === "walmart-find" ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {t("stores.walmart.find")}
            </Button>
          </div>
        )}

        {basket.lines.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            {t("stores.basket.empty")}
          </p>
        ) : (
          <ul className="grid gap-2">
            {basket.lines.map((line) => (
              <BasketLineRow
                key={line.itemId}
                line={line}
                today={today}
                on={isOn(line)}
                packages={packagesOf(line)}
                onToggle={(on) =>
                  setChosen((was) => ({ ...was, [line.itemId]: on }))
                }
                onPackages={(packages) =>
                  setCounts((was) => ({ ...was, [line.itemId]: packages }))
                }
                onChange={() => setPicking(line)}
                noProduct={t("stores.walmart.nothingPicked")}
              />
            ))}
          </ul>
        )}

        {going.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 rounded-2xl border bg-muted/40 p-4">
            <span className="text-sm text-muted-foreground">
              {unpriced
                ? t("stores.basket.totalSome")
                : t("stores.basket.total")}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatPrice(total, "USD", i18n.language)}
            </span>
          </div>
        )}
      </div>

      <ProductSearchDialog
        line={picking}
        store={basket.store}
        today={today}
        onOpenChange={(open) => !open && setPicking(null)}
        onPicked={picked}
        search={search}
        start={options}
        pick={pick}
        hint={t("stores.walmart.searchHint")}
      />
    </>
  )
}
