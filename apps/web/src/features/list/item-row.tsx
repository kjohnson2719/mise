import {
  LinkSquare02Icon,
  Search01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SelectMark } from "@/features/select/select-mark"
import { useLongPress, type Selection } from "@/features/select/use-selection"
import {
  formatPrice,
  type ItemPrice,
  type YourStore,
} from "@/features/stores/queries"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ListItem } from "./queries"
import { useListActions } from "./use-list-actions"

/** What the things on a list cost, each at its store. */
export type RowPrices = {
  of: (item: ListItem) => ItemPrice | null
  currency: string
}

/** Finding a thing at one of the household's stores. */
export type RowFind = {
  stores: readonly YourStore[]
  onFind: (item: ListItem, store: YourStore) => void
}

/** Dishes named on the line under a thing; the rest are "and 3 more". */
const MEALS_SHOWN = 2

/**
 * One thing to buy, in at most two lines: a box to check it off, its name
 * and how much (tap to change it), and under that what it's for. On the
 * right, what it costs and what a sale saves, and Find, at any of the
 * household's stores. A long press starts selecting with it.
 */
export function ItemRow({
  item,
  selection,
  onEdit,
  find = null,
  prices = null,
}: {
  item: ListItem
  selection: Selection
  onEdit: () => void
  /** The household's stores to find it at. */
  find?: RowFind | null
  /**
   * The list's prices, when anything left on it has one: a row without a
   * price keeps the column, so prices line up.
   */
  prices?: RowPrices | null
}) {
  const { t, i18n } = useTranslation()
  const actions = useListActions()
  const press = useLongPress(
    () => selection.start(item.id),
    !selection.selecting
  )
  const selecting = selection.selecting
  const picked = selection.isPicked(item.id)
  const priced = Boolean(prices) && !item.checked
  const cost = priced ? (prices?.of(item) ?? null) : null
  const money = (cents: number) =>
    formatPrice(cents, prices?.currency ?? "USD", i18n.language)

  // What it's for: every week, and the dishes, the first two by name.
  const meals = item.checked
    ? []
    : forMeals(item.meals).map(({ name, times }) =>
        times > 1 ? t("list.mealTimes", { name, times }) : name
      )
  const named = meals.slice(0, MEALS_SHOWN)
  const more = meals.length - named.length
  const list = (type: Intl.ListFormatType) =>
    new Intl.ListFormat(i18n.language, { type })
  const forText =
    named.length === 0
      ? null
      : t("list.forMeals", {
          // "A and B", or "A, B" before "and 3 more".
          meals:
            more > 0
              ? list("unit").format(named)
              : list("conjunction").format(named),
        })
  const weekly = !item.checked && item.source === "every-week"
  const about = [weekly && t("list.everyWeekBadge"), forText]
    .filter(Boolean)
    .join(" · ")

  const finding =
    item.checked || selecting || !find?.stores.length ? null : find
  const note = cost ? priceNote(cost) : undefined

  /** "Fry's price on Oct 17, for 2 × Kroger 2% Milk. Usually $3.49 each." */
  function priceNote(cost: ItemPrice) {
    const day = (iso: string) => formatDate(`${iso}T12:00:00`, i18n.language)
    return [
      t(cost.packages > 1 ? "list.price.notePacks" : "list.price.note", {
        store: cost.store,
        day: day(cost.seenOn),
        packages: cost.packages,
        product: cost.product,
      }),
      !cost.sure && t("list.price.guess"),
      cost.sale &&
        (cost.sale.ends
          ? t("list.price.saleEnds", { day: day(cost.sale.ends) })
          : t("list.price.onSale")),
      cost.sale?.verdict === "lowest" && t("list.price.lowest"),
      cost.usual !== null &&
        t(cost.packages > 1 ? "list.price.usualEach" : "list.price.usual", {
          price: money(cost.usual),
        }),
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <li className="flex items-center gap-3.5 py-3 @2xl:gap-4">
      {selecting ? (
        <span
          onClick={() => selection.toggle(item.id)}
          className="shrink-0 cursor-pointer"
        >
          <SelectMark picked={picked} />
        </span>
      ) : (
        <Checkbox
          className="size-6 shrink-0 rounded-md"
          checked={item.checked}
          aria-label={
            item.checked
              ? t("list.uncheck", { name: item.name })
              : t("list.check", { name: item.name })
          }
          onCheckedChange={(on) =>
            void actions.change(item, { checked: on === true })
          }
        />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <button
          type="button"
          onClick={selecting ? () => selection.toggle(item.id) : onEdit}
          {...(selecting ? {} : press)}
          aria-pressed={selecting ? picked : undefined}
          aria-label={
            selecting
              ? picked
                ? t("select.unpick", { name: item.name })
                : t("select.pick", { name: item.name })
              : t("list.edit", { name: item.name })
          }
          className={cn(
            "flex min-w-0 items-baseline gap-1.5 justify-self-start rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            item.checked && !selecting && "text-muted-foreground line-through"
          )}
        >
          <span className="truncate font-medium first-letter:uppercase">
            {item.name}
          </span>
          {item.amount && (
            <span className="shrink-0 text-muted-foreground">
              · {item.amount}
            </span>
          )}
        </button>
        {about && (
          <p
            className="flex min-w-0 text-sm text-muted-foreground"
            title={more > 0 ? list("conjunction").format(meals) : undefined}
          >
            <span className="truncate">{about}</span>
            {more > 0 && (
              <span className="shrink-0">
                &nbsp;{t("list.mealsMore", { count: more })}
              </span>
            )}
          </p>
        )}
      </div>
      {priced && (
        <div
          title={note}
          className="grid min-w-16 shrink-0 justify-items-end gap-0.5 tabular-nums"
        >
          {cost && (
            <>
              <span
                className={cn(
                  "text-sm",
                  cost.sale
                    ? "font-medium text-primary"
                    : "text-muted-foreground"
                )}
              >
                {!cost.sure && "~"}
                {money(cost.total)}
              </span>
              {cost.sale && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <HugeiconsIcon
                    icon={Tag01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                  {t("list.price.save", { saved: money(cost.sale.saved) })}
                </span>
              )}
              <span className="sr-only">{note}</span>
            </>
          )}
        </div>
      )}
      {finding && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("list.findName", { name: item.name })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-4"
            />
            <span className="hidden @lg:inline">{t("list.findMenu")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("list.findAtLabel", { name: item.name })}
              </DropdownMenuLabel>
              {finding.stores.map((store) => (
                <DropdownMenuItem
                  key={store.key}
                  onClick={() => finding.onFind(item, store)}
                >
                  <span className="flex-1">{store.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {store.connected ? (
                      t("list.findPick")
                    ) : (
                      <HugeiconsIcon
                        icon={LinkSquare02Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    )}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

/** One per dish, however many times it's planned, with how many. */
function forMeals(meals: ListItem["meals"]) {
  const ids = new Map<string, Set<string>>()
  for (const meal of meals) {
    const seen = ids.get(meal.name) ?? new Set<string>()
    seen.add(meal.id)
    ids.set(meal.name, seen)
  }
  return [...ids].map(([name, seen]) => ({ name, times: seen.size }))
}
