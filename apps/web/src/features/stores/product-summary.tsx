import { priceNow } from "@merran/shared"
import { ShoppingBasket01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { formatPrice, type StoreProduct } from "./queries"

/** A product's picture, name and size, and its price today. */
export function ProductSummary({
  product,
  today,
  packages = 1,
}: {
  product: StoreProduct
  today: string
  packages?: number
}) {
  const { t, i18n } = useTranslation()
  const now = priceNow(product, today)
  const money = (cents: number) =>
    formatPrice(cents, product.currency, i18n.language)
  return (
    <>
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
        {product.image ? (
          <img
            src={product.image}
            alt=""
            loading="lazy"
            className="size-full object-contain"
          />
        ) : (
          <HugeiconsIcon
            icon={ShoppingBasket01Icon}
            strokeWidth={2}
            className="text-muted-foreground"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[product.brand, product.size].filter(Boolean).join(" · ")}
          {!product.inStock && ` · ${t("stores.basket.outOfStock")}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {now.price !== null ? (
          <>
            <p className="text-sm font-semibold tabular-nums">
              {money(now.price * packages)}
            </p>
            {now.onSale && now.regular !== null && (
              <p className="text-xs text-muted-foreground tabular-nums line-through">
                {money(now.regular * packages)}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("stores.basket.noPrice")}
          </p>
        )}
      </div>
    </>
  )
}
