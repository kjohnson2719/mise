import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { priceNow } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

import { ProductSummary } from "./product-summary"
import { formatPrice, type BasketLine } from "./queries"

/**
 * A thing on the list at a store, to look over before it goes to the cart:
 * its product, how many, what it costs and whether it's a deal, whether it
 * goes, and Change to pick another.
 */
export function BasketLineRow({
  line,
  today,
  on,
  packages,
  onToggle,
  onPackages,
  onChange,
  noProduct,
  busy = false,
}: {
  line: BasketLine
  today: string
  on: boolean
  packages: number
  onToggle: (on: boolean) => void
  onPackages: (packages: number) => void
  onChange: () => void
  /** Said when it has no product: by default, nothing found at the store. */
  noProduct?: string
  /** The store's working on it: no changing it for now. */
  busy?: boolean
}) {
  const { t, i18n } = useTranslation()
  const id = React.useId()
  const product = line.product
  const saleEnds =
    product && priceNow(product, today).onSale ? product.saleEnds : null
  // "Usually $4.49", when that's not the regular price already shown.
  const usual =
    product && line.sale?.usual && line.sale.usual !== product.price
      ? formatPrice(line.sale.usual, product.currency, i18n.language)
      : null

  return (
    <li
      className={cn(
        "grid gap-3 rounded-2xl border p-3 transition-opacity sm:p-4",
        !on && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={on}
          disabled={!product}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={t("stores.basket.include", { name: line.name })}
        />
        {product ? (
          <ProductSummary product={product} today={today} packages={packages} />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {noProduct ?? t("stores.basket.noneFound")}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:pl-8">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {t("stores.basket.forItem", {
              item: [line.amount, line.name].filter(Boolean).join(" "),
            })}
          </span>
          {line.suggested && product && (
            <Badge variant="secondary">{t("stores.basket.merransPick")}</Badge>
          )}
          {product && !line.sure && (
            <Badge variant="outline">{t("stores.basket.checkHowMany")}</Badge>
          )}
          {line.sale?.verdict === "lowest" && (
            <Badge>{t("stores.basket.lowest")}</Badge>
          )}
          {line.sale?.verdict === "small" && (
            <Badge variant="outline">{t("stores.basket.barelyOff")}</Badge>
          )}
          {usual && (
            <span className="text-xs text-muted-foreground">
              {t("stores.basket.usually", { price: usual })}
            </span>
          )}
          {saleEnds && (
            <Badge variant="outline">
              {t("stores.basket.saleUntil", { date: saleEnds })}
            </Badge>
          )}
          {line.sent && (
            <Badge variant="outline">{t("stores.basket.sentBadge")}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {product && (
            <div className="flex items-center rounded-lg border">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!on || packages <= 1}
                onClick={() => onPackages(packages - 1)}
                aria-label={t("stores.basket.fewer")}
              >
                <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
              </Button>
              <span className="w-7 text-center text-sm tabular-nums">
                {packages}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!on || packages >= 99}
                onClick={() => onPackages(packages + 1)}
                aria-label={t("stores.basket.more")}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onChange}
          >
            {product ? t("stores.basket.change") : t("stores.basket.find")}
          </Button>
        </div>
      </div>
    </li>
  )
}
