import {
  Add01Icon,
  ArrowDataTransferHorizontalIcon,
  Calendar03Icon,
  Cancel01Icon,
  Delete02Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  RepeatIcon,
  ShoppingBasket01Icon,
  ShoppingCart01Icon,
  Store01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { STORES_BY_KEY, storeSearch } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveHousehold } from "@/features/auth/use-me"
import { useCapability } from "@/features/capabilities/queries"
import { isAdminRole } from "@/features/household/queries"
import { usePeopleHere, type Person } from "@/features/live/live-updates"
import { SelectionBar, SelectionHeader } from "@/features/select/selection-bar"
import {
  useSelection,
  useSelectionKeepOnly,
} from "@/features/select/use-selection"
import { householdQuery } from "@/features/household/queries"
import {
  formatPrice,
  storesQuery,
  useListPrices,
  type ItemPrice,
} from "@/features/stores/queries"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"

import { AddFromPlanDialog } from "./add-from-plan-dialog"
import { ItemRow, type RowPrices } from "./item-row"
import {
  AisleDialog,
  EditItemDialog,
  EveryWeekDialog,
  FoodsDialog,
  ListPickDialog,
  OnHandDialog,
} from "./list-dialogs"
import { ListsDialog } from "./lists-dialog"
import { listQuery, type List, type ListItem } from "./queries"
import { useListActions } from "./use-list-actions"
import { UsualBuys } from "./usual-buys"

/** Which list this device last had open. */
const CHOSEN_LIST = "merran.list"

function readChosenList() {
  try {
    return localStorage.getItem(CHOSEN_LIST)
  } catch {
    return null
  }
}

/**
 * The shopping lists: add from the plan or type things in, then what's
 * left to get by aisle in a walk through the store, and what's in the cart
 * under it. With a list for each store, cards at the top pick which.
 */
export function ListPage() {
  const { t, i18n } = useTranslation()
  const list = useQuery(listQuery)
  const actions = useListActions()
  const admin = isAdminRole(useActiveHousehold()?.role)
  const others = usePeopleHere()
  const [fromPlan, setFromPlan] = React.useState(false)
  const [everyWeek, setEveryWeek] = React.useState(false)
  const [onHand, setOnHand] = React.useState(false)
  const [foods, setFoods] = React.useState(false)
  const [managing, setManaging] = React.useState(false)
  const [editing, setEditing] = React.useState<ListItem | null>(null)
  const [choosingAisle, setChoosingAisle] = React.useState(false)
  const [choosingList, setChoosingList] = React.useState(false)
  const [showCart, setShowCart] = React.useState(false)
  const [chosen, setChosen] = React.useState(readChosenList)

  const { data: household } = useQuery(householdQuery)
  const kroger = useCapability("stores.kroger")
  const walmart = useCapability("stores.walmart")
  const { data: stores } = useQuery({ ...storesQuery, enabled: kroger })
  /** Where to find something on its list's store's site, if it has one. */
  const findAt = (item: ListItem) => {
    const store = lists.find((option) => option.id === item.list)?.store
    const url = storeSearch(store, household?.country, item.name)
    return store && url
      ? { store: STORES_BY_KEY.get(store)?.name ?? store, url }
      : null
  }
  const lists = list.data?.lists ?? []
  const aisles = list.data?.aisles ?? []
  const all = list.data?.items ?? []
  const split = lists.length > 1
  const current = lists.find((option) => option.id === chosen) ?? lists[0]
  // With several lists, the one chosen; else everything.
  const items = split ? all.filter((item) => item.list === current?.id) : all
  const toGet = items.filter((item) => !item.checked)
  const got = items.filter((item) => item.checked)
  const totalLeft = all.filter((item) => !item.checked).length
  const prices = useListPrices()
  const priceOf = (item: ListItem) => prices.items.get(item.id) ?? null
  // A column of prices when anything left on the list showing has one.
  const rowPrices: RowPrices | null = toGet.some(priceOf)
    ? { of: priceOf, currency: prices.currency, store: prices.store }
    : null
  // Each aisle's things A to Z, as they read.
  const byName = new Intl.Collator(i18n.language, { sensitivity: "base" })
  const sorted = (items: ListItem[]) =>
    items.sort((a, b) => byName.compare(a.name, b.name))
  const byAisle = [
    ...aisles.map((aisle) => ({
      id: aisle.id,
      name: aisle.name,
      items: sorted(toGet.filter((item) => item.aisle === aisle.id)),
    })),
    {
      id: "none",
      name: t("list.noAisle"),
      items: sorted(
        toGet.filter((item) => !aisles.some((aisle) => aisle.id === item.aisle))
      ),
    },
  ].filter((aisle) => aisle.items.length > 0)

  function choose(id: string) {
    setChosen(id)
    try {
      localStorage.setItem(CHOSEN_LIST, id)
    } catch {
      // Not remembered on this device; no harm.
    }
  }

  const selection = useSelection()
  const selectable = [...toGet, ...(showCart ? got : [])].map((item) => item.id)
  useSelectionKeepOnly(selection, selectable)
  const picked = selectable.filter((id) => selection.isPicked(id))
  const elsewhere = lists.filter((option) => option.id !== current?.id)
  // The household's Kroger store (Fry's, Ralphs...) takes the Kroger list,
  // or without one, the lists for no store in particular.
  const krogerStore = stores?.kroger.location?.banner
  const toKroger =
    krogerStore &&
    toGet.length > 0 &&
    (current?.store === "kroger" ||
      (!lists.some((option) => option.store === "kroger") && !current?.store))
  // Walmart through the extension (experimental, when the server has it on),
  // on walmart.com: the Walmart list, or the lists for no store in particular.
  const toWalmart =
    walmart &&
    toGet.length > 0 &&
    (household?.country ?? "US") === "US" &&
    (current?.store === "walmart" ||
      (!lists.some((option) => option.store === "walmart") && !current?.store))
  /** The list showing, when there's more than one. */
  const listShowing = split ? current?.id : undefined

  const bulk = async (
    action: Parameters<typeof actions.bulk>[1],
    said: (count: number) => string
  ) => {
    if (await actions.bulk(picked, action, said)) selection.done()
  }

  /** Clears what's checked, or everything, on the list showing. */
  function clear(which: "checked" | "all") {
    if (!split) return void actions.clear(which)
    const ids = (which === "checked" ? got : items).map((item) => item.id)
    void actions.bulk(ids, { action: "remove" }, (count) =>
      t("list.cleared", { count })
    )
  }

  return (
    <>
      <PageHeader
        title={t("list.title")}
        description={
          list.isPending
            ? t("list.loading")
            : totalLeft === 0
              ? t("list.nothingToGet")
              : split
                ? t("list.toGetAcross", {
                    things: t("list.toGet", { count: totalLeft }),
                    lists: t("list.listCount", { count: lists.length }),
                  })
                : t("list.toGet", { count: totalLeft })
        }
        actions={
          selection.selecting ? (
            <SelectionHeader selection={selection} allIds={selectable} />
          ) : (
            <>
              {toKroger && (
                <Button variant="outline" render={<Link to="/list/kroger" />}>
                  <HugeiconsIcon
                    icon={ShoppingCart01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("list.sendTo", { store: krogerStore })}
                </Button>
              )}
              {toWalmart && (
                <Button variant="outline" render={<Link to="/list/walmart" />}>
                  <HugeiconsIcon
                    icon={ShoppingCart01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t("list.sendTo", { store: "Walmart" })}
                </Button>
              )}
              <Button onClick={() => setFromPlan(true)}>
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("list.fromPlan")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("list.more")}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    disabled={selectable.length === 0}
                    onClick={() => selection.start()}
                  >
                    {t("list.select")}
                  </DropdownMenuItem>
                  {admin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setManaging(true)}>
                        {split ? t("list.editLists") : t("list.splitByStore")}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEveryWeek(true)}>
                    {t("list.everyWeek")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOnHand(true)}>
                    {t("list.onHand")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFoods(true)}>
                    {t("list.foods")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={got.length === 0}
                    onClick={() => clear("checked")}
                  >
                    {split && current
                      ? t("list.clearCheckedOn", { list: current.name })
                      : t("list.clearChecked")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={items.length === 0}
                    onClick={() => clear("all")}
                  >
                    {split && current
                      ? t("list.clearListNamed", { list: current.name })
                      : t("list.clearAll")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-6">
        {others.length > 0 && <ShoppingWith people={others} />}
        {(split || admin) && current && (
          <StoreCards
            lists={lists}
            items={all}
            current={current.id}
            split={split}
            admin={admin}
            priceOf={priceOf}
            currency={prices.currency}
            onChoose={choose}
            onManage={() => setManaging(true)}
          />
        )}

        <QuickAdd list={split ? current : undefined} />
        {!selection.selecting && <UsualBuys />}

        {list.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
          </div>
        ) : split && all.length > 0 && items.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            {t("list.emptyHere", { list: current?.name })}
          </p>
        ) : items.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ShoppingBasket01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("list.empty")}</EmptyTitle>
              <EmptyDescription>{t("list.emptyHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setFromPlan(true)}>
                  {t("list.fromPlan")}
                </Button>
                <Button variant="outline" onClick={() => setEveryWeek(true)}>
                  {t("list.setUpEveryWeek")}
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {byAisle.map((aisle) => (
              <section
                key={aisle.id}
                aria-labelledby={`aisle-${aisle.id}`}
                className="@container rounded-3xl border bg-card px-5 text-card-foreground md:px-6"
              >
                <h2
                  id={`aisle-${aisle.id}`}
                  className="flex items-baseline gap-2 pt-4 pb-3 text-lg font-semibold tracking-tight"
                >
                  {aisle.name}
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    {aisle.items.length}
                  </span>
                </h2>
                <ul className="divide-y border-t">
                  {aisle.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      selection={selection}
                      onEdit={() => setEditing(item)}
                      findAt={findAt(item)}
                      prices={rowPrices}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {toGet.length === 0 && (
              <div className="grid justify-items-center gap-3 py-4 text-center">
                <p className="text-muted-foreground">{t("list.allDone")}</p>
                {got.length > 0 && (
                  <Button onClick={() => void actions.putAway(listShowing)}>
                    <HugeiconsIcon
                      icon={FridgeIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("list.putAwayAll")}
                  </Button>
                )}
              </div>
            )}

            {got.length > 0 && (
              <section
                aria-labelledby="in-the-cart"
                className="@container rounded-3xl border bg-muted/40 px-5 md:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
                  <p id="in-the-cart" className="min-w-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {t("list.inTheCart", { count: got.length })}
                    </span>
                    {!showCart && (
                      <span>
                        :{" "}
                        {got.map((item) => item.name.toLowerCase()).join(", ")}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      aria-expanded={showCart}
                      onClick={() => setShowCart((open) => !open)}
                    >
                      {showCart ? t("list.hide") : t("list.show")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-card"
                      onClick={() => void actions.putAway(listShowing)}
                    >
                      <HugeiconsIcon
                        icon={FridgeIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {t("list.putAway")}
                    </Button>
                  </div>
                </div>
                {showCart && (
                  <ul className="divide-y border-t pb-1">
                    {got.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        selection={selection}
                        onEdit={() => setEditing(item)}
                        findAt={findAt(item)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("list.bulk.check"),
            icon: Tick02Icon,
            onSelect: () =>
              void bulk({ action: "check" }, (count) =>
                t("list.bulk.checked", { count })
              ),
          },
          ...(showCart
            ? [
                {
                  label: t("list.bulk.uncheck"),
                  icon: Cancel01Icon,
                  onSelect: () =>
                    void bulk({ action: "uncheck" }, (count) =>
                      t("list.bulk.unchecked", { count })
                    ),
                },
              ]
            : []),
          ...(split
            ? [
                {
                  label: t("list.bulk.list"),
                  icon: ArrowDataTransferHorizontalIcon,
                  onSelect: () => setChoosingList(true),
                },
              ]
            : []),
          {
            label: t("list.bulk.aisle"),
            icon: Store01Icon,
            onSelect: () => setChoosingAisle(true),
          },
          {
            label: t("list.bulk.everyWeek"),
            icon: RepeatIcon,
            onSelect: () =>
              void bulk({ action: "every-week" }, (count) =>
                t("list.bulk.weekly", { count })
              ),
          },
          {
            label: t("list.bulk.remove"),
            icon: Delete02Icon,
            destructive: true,
            onSelect: () =>
              void bulk({ action: "remove" }, (count) =>
                t("list.bulk.removed", { count })
              ),
          },
        ]}
      />
      <AisleDialog
        count={picked.length}
        aisles={aisles}
        open={choosingAisle}
        onOpenChange={setChoosingAisle}
        onPick={(aisle) => {
          setChoosingAisle(false)
          void bulk({ action: "aisle", aisle: aisle?.id ?? null }, (count) =>
            t("list.bulk.moved", {
              count,
              aisle: aisle?.name ?? t("list.noAisle"),
            })
          )
        }}
      />
      <ListPickDialog
        count={picked.length}
        lists={elsewhere}
        open={choosingList}
        onOpenChange={setChoosingList}
        onPick={(target) => {
          setChoosingList(false)
          void bulk({ action: "move", list: target.id }, (count) =>
            t("list.bulk.movedTo", { count, list: target.name })
          )
        }}
      />
      <AddFromPlanDialog open={fromPlan} onOpenChange={setFromPlan} />
      <EveryWeekDialog open={everyWeek} onOpenChange={setEveryWeek} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
      <FoodsDialog open={foods} onOpenChange={setFoods} />
      <ListsDialog
        open={managing}
        onOpenChange={setManaging}
        lists={lists}
        aisles={aisles}
      />
      <EditItemDialog
        item={editing}
        items={all}
        aisles={aisles}
        lists={lists}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/** "Jamie is on the list too": shopping together, changes show up live. */
function ShoppingWith({ people }: { people: Person[] }) {
  const { t, i18n } = useTranslation()
  const named = people.slice(0, 3).map((person) => person.name)
  const names = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  }).format(
    people.length > 3
      ? [...named.slice(0, 2), t("list.andMore", { count: people.length - 2 })]
      : named
  )
  return (
    <p
      role="status"
      className="flex items-center gap-2.5 justify-self-start rounded-full bg-accent py-1 pr-3.5 pl-1 text-sm text-accent-foreground"
    >
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((person) => (
          <span
            key={person.id}
            className="flex size-6 items-center justify-center rounded-full bg-card text-[0.65rem] font-semibold ring-2 ring-accent"
          >
            {initials(person.name)}
          </span>
        ))}
      </span>
      <span>
        <Trans
          i18nKey="list.together"
          count={people.length}
          values={{ names }}
          components={{ b: <span className="font-medium" /> }}
        />
      </span>
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
    </p>
  )
}

/** A card for each list, to pick which shows; and one to split by store. */
function StoreCards({
  lists,
  items,
  current,
  split,
  admin,
  priceOf,
  currency,
  onChoose,
  onManage,
}: {
  lists: readonly List[]
  items: readonly ListItem[]
  current: string
  split: boolean
  admin: boolean
  priceOf: (item: ListItem) => ItemPrice | null
  currency: string
  onChoose: (id: string) => void
  onManage: () => void
}) {
  const { t, i18n } = useTranslation()
  const money = (cents: number) => formatPrice(cents, currency, i18n.language)
  return (
    <div
      role={split ? "tablist" : undefined}
      aria-label={t("list.cards.label")}
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
    >
      {lists.map((list) => {
        const own = split
          ? items.filter((item) => item.list === list.id)
          : items
        const toGet = own.filter((item) => !item.checked)
        const left = toGet.length
        const got = own.length - left
        const costs = toGet.flatMap((item) => priceOf(item) ?? [])
        const total = costs.reduce((sum, cost) => sum + cost.total, 0)
        const sales = costs.flatMap((cost) => cost.sale ?? [])
        const saved = sales.reduce((sum, sale) => sum + sale.saved, 0)
        const selected = split && list.id === current
        const body = (
          <>
            <span className="truncate font-heading text-xl font-semibold">
              {list.name}
            </span>
            <span className="text-sm text-muted-foreground">
              {left > 0
                ? t("list.cards.left", { count: left })
                : t("list.cards.nothingLeft")}
              {got > 0 && ` · ${t("list.cards.inCart", { count: got })}`}
              {costs.length > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {costs.length < left
                      ? t("list.cards.aboutSome", {
                          total: money(total),
                          priced: costs.length,
                          left,
                        })
                      : t("list.cards.about", { total: money(total) })}
                  </span>
                </>
              )}
            </span>
            {saved > 0 && (
              <span className="text-sm font-medium text-primary">
                {t("list.cards.saving", {
                  saved: money(saved),
                  count: sales.length,
                })}
              </span>
            )}
            <Progress
              value={own.length ? (got / own.length) * 100 : 0}
              aria-label={t("list.cards.progress", { got, total: own.length })}
              className="h-1.5"
            />
          </>
        )
        return (
          <div
            key={list.id}
            className={cn(
              "relative grid w-64 shrink-0 snap-start content-start gap-2.5 rounded-3xl border bg-card p-5 text-card-foreground sm:w-auto",
              selected && "border-primary ring-1 ring-primary"
            )}
          >
            {split ? (
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChoose(list.id)}
                className="grid gap-2.5 text-left outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
              >
                {body}
              </button>
            ) : (
              <div className="grid gap-2.5">{body}</div>
            )}
          </div>
        )
      })}
      {admin && lists.length < 4 && (
        <button
          type="button"
          onClick={onManage}
          className="grid w-64 shrink-0 snap-start content-start gap-1.5 rounded-3xl border border-dashed p-5 text-left text-muted-foreground transition-colors outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-auto"
        >
          <span className="flex items-center gap-1.5 font-heading text-xl font-semibold text-foreground">
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-5"
            />
            {split ? t("list.cards.another") : t("list.cards.split")}
          </span>
          <span className="text-sm">
            {split ? t("list.cards.anotherHint") : t("list.cards.splitHint")}
          </span>
        </button>
      )}
    </div>
  )
}

/** Type something onto the list showing: "2 lb ground beef" or "paper towels". */
function QuickAdd({ list }: { list?: List }) {
  const { t } = useTranslation()
  const actions = useListActions()
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const typed = text.trim()
        if (!typed) return
        setBusy(true)
        void actions
          .add({ text: typed, ...(list ? { list: list.id } : {}) })
          .then((added) => {
            setBusy(false)
            if (added) setText("")
          })
      }}
    >
      <InputGroup>
        <InputGroupInput
          placeholder={
            list ? t("list.addTo", { list: list.name }) : t("list.add")
          }
          aria-label={
            list
              ? t("list.addToLabel", { list: list.name })
              : t("list.addLabel")
          }
          enterKeyHint="done"
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            variant="default"
            aria-label={t("list.addButton")}
            disabled={!text.trim() || busy}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
