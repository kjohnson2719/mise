import {
  Alert02Icon,
  ArrowLeft01Icon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { priceNow } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useActiveHousehold } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { BasketLineRow } from "./basket-line"
import { ProductSearchDialog } from "./product-search-dialog"
import {
  formatPrice,
  krogerBasketQuery,
  useListName,
  type Basket,
  type BasketLine,
} from "./queries"

/**
 * The list at the household's Kroger store: a product for each thing and
 * how many, to look over before it goes to the linked account's cart.
 * Kroger only lets Merran add to the cart; checking out is on its site.
 */
export function KrogerBasketPage({ list }: { list?: string }) {
  const { t } = useTranslation()
  const basket = useQuery(krogerBasketQuery(list))

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
        // Afresh after each send: what went is left out next time.
        <Review
          key={basket.data.sentAt ?? ""}
          basket={basket.data}
          list={list}
        />
      ) : basket.isPending ? (
        <>
          <PageHeader
            title={t("stores.basket.loadingTitle")}
            description={t("stores.basket.loading")}
          />
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

function Review({ basket, list }: { basket: Basket; list?: string }) {
  const { t, i18n } = useTranslation()
  const listName = useListName(list)
  const queryClient = useQueryClient()
  const { today } = useHouseholdClock()
  const admin = isAdminRole(useActiveHousehold()?.role)
  // Left out to begin with: what's out of stock, and what went last time,
  // so nothing goes to the cart twice.
  const [left, setLeft] = React.useState<Set<string>>(
    () =>
      new Set(
        basket.lines
          .filter((line) => !line.product || !line.product.inStock || line.sent)
          .map((line) => line.itemId)
      )
  )
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [picking, setPicking] = React.useState<BasketLine | null>(null)
  const [sending, setSending] = React.useState(false)

  const packagesOf = (line: BasketLine) => counts[line.itemId] ?? line.packages
  const going = basket.lines.filter(
    (line) => line.product && !left.has(line.itemId)
  )
  const total = going.reduce((sum, line) => {
    const price = priceNow(line.product!, today).price
    return price === null ? sum : sum + price * packagesOf(line)
  }, 0)
  const unpriced = going.some(
    (line) => priceNow(line.product!, today).price === null
  )
  const currency = going[0]?.product?.currency ?? "USD"
  const where =
    basket.modality === "DELIVERY"
      ? t("stores.basket.delivery")
      : t("stores.basket.pickup")

  function toggle(itemId: string, on: boolean) {
    setLeft((was) => {
      const next = new Set(was)
      if (on) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function picked(line: BasketLine) {
    queryClient.setQueryData(krogerBasketQuery(list).queryKey, (was) =>
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
    toggle(line.itemId, true)
  }

  async function send() {
    setSending(true)
    try {
      const sent = await unwrap(
        api.POST("/api/stores/kroger/send", {
          body: {
            lines: going.map((line) => ({
              itemId: line.itemId,
              packages: packagesOf(line),
            })),
          },
        })
      )
      toast.success(
        t("stores.basket.sent", { count: sent.sent, store: sent.store }),
        {
          action: {
            label: t("stores.basket.openCart"),
            onClick: () =>
              window.open(sent.cartUrl, "_blank", "noopener,noreferrer"),
          },
        }
      )
      await queryClient.invalidateQueries({
        queryKey: krogerBasketQuery(list).queryKey,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t("stores.basket.title", { store: basket.store })}
        description={
          listName
            ? t("stores.basket.descriptionFor", {
                list: listName,
                location: basket.location.name,
                where,
              })
            : t("stores.basket.description", {
                location: basket.location.name,
                where,
              })
        }
        actions={
          <Button
            disabled={!basket.linked || going.length === 0 || sending}
            onClick={() => void send()}
          >
            {sending ? (
              <Spinner />
            ) : (
              <HugeiconsIcon
                icon={ShoppingCart01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {t("stores.basket.send", { count: going.length })}
          </Button>
        }
      />

      <div className="grid gap-4 pb-24">
        {!basket.linked && (
          <Alert>
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            <AlertTitle>
              {t("stores.basket.notLinked", { store: basket.store })}
            </AlertTitle>
            <AlertDescription>
              {admin
                ? t("stores.basket.linkHint")
                : t("stores.basket.askAdmin")}
              {admin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  render={<Link to="/settings/household" />}
                >
                  {t("stores.basket.linkNow")}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {basket.sentAt && (
          <p className="text-sm text-muted-foreground">
            {t("stores.basket.sentBefore", {
              when: formatRelativeDate(basket.sentAt, i18n.language),
            })}
          </p>
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
                on={Boolean(line.product) && !left.has(line.itemId)}
                packages={packagesOf(line)}
                onToggle={(on) => toggle(line.itemId, on)}
                onPackages={(packages) =>
                  setCounts((was) => ({ ...was, [line.itemId]: packages }))
                }
                onChange={() => setPicking(line)}
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
              {formatPrice(total, currency, i18n.language)}
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
      />
    </>
  )
}
