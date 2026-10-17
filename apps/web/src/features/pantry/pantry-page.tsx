import {
  Add01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  ReceiptDollarIcon,
  ShoppingBasketAdd01Icon,
  SnowIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { addDays } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

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
import { Skeleton } from "@/components/ui/skeleton"
import { useCapability } from "@/features/capabilities/queries"
import { OnHandDialog } from "@/features/list/list-dialogs"
import { onHandQuery } from "@/features/list/queries"
import { useHouseholdClock } from "@/features/plan/queries"
import { SelectMark } from "@/features/select/select-mark"
import { SelectionBar, SelectionHeader } from "@/features/select/selection-bar"
import {
  useLongPress,
  useSelection,
  useSelectionKeepOnly,
  type Selection,
} from "@/features/select/use-selection"
import { cn } from "@/lib/utils"

import { EditPantryDialog, PlaceDialog, UseByDialog } from "./pantry-dialogs"
import {
  pantryQuery,
  STORAGE_PLACES,
  type PantryItem,
  type StoragePlace,
} from "./queries"
import { WaitingReceipts } from "./receipts/waiting-receipts"
import { usePantryActions } from "./use-pantry-actions"
import { missedMeal, urgency, useDayLabel } from "./use-soon"

/**
 * What's at home: what to use soon at the top, then the fridge, the
 * freezer and the cupboard, and what's always on hand.
 */
export function PantryPage() {
  const { t } = useTranslation()
  const pantry = useQuery(pantryQuery)
  const actions = usePantryActions()
  const [editing, setEditing] = React.useState<PantryItem | null>(null)
  const [onHand, setOnHand] = React.useState(false)
  const [dialog, setDialog] = React.useState<"place" | "useBy" | null>(null)
  const dayLabel = useDayLabel()
  const aiOn = useCapability("ai")

  const items = pantry.data?.items ?? []
  const soon = items
    .filter((item) => item.useSoon)
    .sort((a, b) => urgency(a.useSoon!) - urgency(b.useSoon!))
  const places = [...STORAGE_PLACES, null].map((place) => ({
    place,
    items: items.filter((item) => item.storedIn === place),
  }))

  const selection = useSelection()
  const selectable = items.map((item) => item.id)
  useSelectionKeepOnly(selection, selectable)
  const picked = selectable.filter((id) => selection.isPicked(id))

  const bulk = async (
    action: Parameters<typeof actions.bulk>[1],
    said: (count: number) => string
  ) => {
    setDialog(null)
    if (await actions.bulk(picked, action, said)) selection.done()
  }

  return (
    <>
      <PageHeader
        title={t("pantry.title")}
        description={
          items.length === 0
            ? t("pantry.empty")
            : soon.length > 0
              ? t("pantry.atHomeSoon", {
                  things: t("pantry.atHome", { count: items.length }),
                  soon: soon.length,
                })
              : t("pantry.atHome", { count: items.length })
        }
        actions={
          selection.selecting ? (
            <SelectionHeader selection={selection} allIds={selectable} />
          ) : (
            <div className="flex gap-2">
              {aiOn && (
                <Button
                  variant="outline"
                  aria-label={t("pantry.receipts.scan")}
                  render={<Link to="/pantry/receipts" />}
                >
                  <HugeiconsIcon
                    icon={ReceiptDollarIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  <span className="hidden sm:inline">
                    {t("pantry.receipts.scan")}
                  </span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("pantry.more")}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    disabled={items.length === 0}
                    onClick={() => selection.start()}
                  >
                    {t("pantry.select")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOnHand(true)}>
                    {t("pantry.onHand")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={items.length === 0}
                    onClick={() => void actions.clear()}
                  >
                    {t("pantry.clear")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      <div className="grid gap-6">
        <WaitingReceipts />
        <QuickAdd />

        {pantry.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-48 rounded-3xl" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={FridgeIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("pantry.nothing")}</EmptyTitle>
              <EmptyDescription>{t("pantry.nothingHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {soon.length > 0 && (
              <UseSoonCard
                items={soon}
                selection={selection}
                onOpen={setEditing}
                dayLabel={dayLabel}
              />
            )}
            {places
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section
                  key={group.place ?? "none"}
                  aria-labelledby={`place-${group.place ?? "none"}`}
                  className="@container rounded-3xl border bg-card px-5 text-card-foreground md:px-6"
                >
                  <h2
                    id={`place-${group.place ?? "none"}`}
                    className="flex items-baseline gap-2 pt-4 pb-3 text-lg font-semibold tracking-tight"
                  >
                    {t(`pantry.places.${group.place ?? "none"}`)}
                    <span className="font-sans text-sm font-normal text-muted-foreground">
                      {group.items.length}
                    </span>
                  </h2>
                  <ul className="divide-y border-t">
                    {group.items.map((item) => (
                      <PantryRow
                        key={item.id}
                        item={item}
                        selection={selection}
                        dayLabel={dayLabel}
                        onEdit={() => setEditing(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}

        <AlwaysOnHand onEdit={() => setOnHand(true)} />
      </div>

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("pantry.bulk.usedUp"),
            icon: CheckmarkCircle02Icon,
            onSelect: () =>
              void bulk({ action: "remove" }, (count) =>
                t("pantry.bulk.usedUpDone", { count })
              ),
          },
          {
            label: t("pantry.bulk.toList"),
            icon: ShoppingBasketAdd01Icon,
            onSelect: () => {
              const names = items
                .filter((item) => picked.includes(item.id))
                .map((item) => item.name)
              void actions.toList(names).then((done) => {
                if (done) selection.done()
              })
            },
          },
          {
            label: t("pantry.bulk.storedIn"),
            icon: SnowIcon,
            onSelect: () => setDialog("place"),
          },
          {
            label: t("pantry.bulk.useBy"),
            icon: Calendar03Icon,
            onSelect: () => setDialog("useBy"),
          },
        ]}
      />
      <PlaceDialog
        count={picked.length}
        open={dialog === "place"}
        onOpenChange={(open) => setDialog(open ? "place" : null)}
        onPick={(place) =>
          void bulk({ action: "storedIn", storedIn: place }, (count) =>
            t("pantry.bulk.moved", {
              count,
              place: t(`pantry.places.${place}`).toLowerCase(),
            })
          )
        }
      />
      <UseByDialog
        count={picked.length}
        open={dialog === "useBy"}
        onOpenChange={(open) => setDialog(open ? "useBy" : null)}
        onPick={(useBy) =>
          void bulk({ action: "useBy", useBy }, (count) =>
            useBy
              ? t("pantry.bulk.dated", { count, day: dayLabel(useBy, true) })
              : t("pantry.bulk.undated", { count })
          )
        }
      />
      <EditPantryDialog item={editing} onClose={() => setEditing(null)} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
    </>
  )
}

/** Planned meals still to come that something was set aside for. */
function upcoming(item: PantryItem, today: string) {
  return item.meals.filter(
    (meal) => meal.status === "planned" && meal.date >= today
  )
}

/** Food to cook before it turns, most urgent first. */
function UseSoonCard({
  items,
  selection,
  onOpen,
  dayLabel,
}: {
  items: PantryItem[]
  selection: Selection
  onOpen: (item: PantryItem) => void
  dayLabel: (day: string, inSentence?: boolean) => string
}) {
  const { t } = useTranslation()
  const actions = usePantryActions()
  const { today } = useHouseholdClock()
  const past = items.filter((item) => item.useSoon?.kind === "past")

  return (
    <section
      aria-labelledby="use-soon"
      className="grid gap-4 rounded-3xl border border-amber-500/30 bg-amber-500/[0.07] p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="use-soon" className="text-xl font-semibold tracking-tight">
            {t("pantry.soon.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("pantry.soon.count", { count: items.length })}
          </p>
        </div>
        {!selection.selecting && past.length > 0 && (
          <Button
            variant="outline"
            className="bg-card"
            onClick={() =>
              void actions.bulk(
                past.map((item) => item.id),
                { action: "remove" },
                (count) => t("pantry.soon.tossed", { count })
              )
            }
          >
            {t("pantry.soon.toss", { count: past.length })}
          </Button>
        )}
      </div>
      {/* A row to swipe through on phones; a grid when there's room. */}
      <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4">
        {items.map((item) => {
          const soon = item.useSoon!
          const when =
            soon.kind === "past"
              ? t("pantry.soon.pastWhen")
              : soon.kind === "leftover"
                ? t("pantry.soon.leftoverWhen")
                : dayLabel(soon.date)
          const meal = upcoming(item, today)[0]
          const missed = missedMeal(item, today)
          const detail =
            soon.kind === "leftover" && missed
              ? t("pantry.soon.boughtFor", { name: missed.name })
              : meal
                ? t("pantry.tags.for", {
                    name: meal.name,
                    day: dayLabel(meal.date),
                  })
                : item.amount
          const urgent =
            soon.kind === "past" ||
            (soon.kind === "soon" && soon.date <= addDays(today, 1))
          const picked = selection.isPicked(item.id)
          return (
            <li key={item.id} className="w-40 shrink-0 snap-start md:w-auto">
              <button
                type="button"
                onClick={() =>
                  selection.selecting ? selection.toggle(item.id) : onOpen(item)
                }
                aria-pressed={selection.selecting ? picked : undefined}
                className={cn(
                  "grid h-full w-full content-start gap-0.5 rounded-2xl bg-card px-3.5 py-3 text-left text-card-foreground transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  picked && "ring-2 ring-primary"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    urgent && "text-amber-700 dark:text-amber-400",
                    soon.kind === "past" && "text-destructive"
                  )}
                >
                  {when}
                </span>
                <span className="truncate font-semibold first-letter:uppercase">
                  {item.name}
                </span>
                {detail && (
                  <span className="truncate text-sm text-muted-foreground">
                    {detail}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Tag = { text: string; tone: "meal" | "soon" | "past" | "plain" }

const TAG_TONES: Record<Tag["tone"], string> = {
  meal: "bg-accent text-accent-foreground",
  soon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  past: "bg-destructive/10 text-destructive",
  plain: "bg-secondary text-muted-foreground",
}

/**
 * Something at home: its name and how much (tap to change it), what it's
 * for and when to use it by, and Used up. A long press starts selecting.
 */
function PantryRow({
  item,
  selection,
  dayLabel,
  onEdit,
}: {
  item: PantryItem
  selection: Selection
  dayLabel: (day: string, inSentence?: boolean) => string
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const actions = usePantryActions()
  const { today } = useHouseholdClock()
  const selecting = selection.selecting
  const picked = selection.isPicked(item.id)
  const press = useLongPress(() => selection.start(item.id), !selecting)

  const tags: Tag[] = upcoming(item, today)
    .slice(0, 2)
    .map((meal) => ({
      text: t("pantry.tags.for", {
        name: meal.name,
        day: dayLabel(meal.date, true),
      }),
      tone: "meal",
    }))
  const soon = item.useSoon
  if (soon?.kind === "past")
    tags.push({ text: t("pantry.tags.past"), tone: "past" })
  else if (soon?.kind === "soon")
    tags.push({
      text: t("pantry.tags.useBy", { day: dayLabel(soon.date, true) }),
      tone: "soon",
    })
  else if (soon?.kind === "leftover") {
    const missed = missedMeal(item, today)
    if (missed)
      tags.push({
        text:
          missed.status === "skipped"
            ? t("pantry.tags.leftoverSkipped", { name: missed.name })
            : t("pantry.tags.leftover", { name: missed.name }),
        tone: "soon",
      })
  } else if (item.useBy)
    tags.push({
      text: t("pantry.tags.useBy", { day: dayLabel(item.useBy, true) }),
      tone: "plain",
    })

  const elsewhere = STORAGE_PLACES.filter((place) => place !== item.storedIn)

  // A narrow card: tags under the name. A wide one: all in a line.
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3 @3xl:grid-cols-[minmax(0,1fr)_auto_auto] @3xl:gap-x-4">
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
            : t("pantry.editItem.title", { name: item.name })
        }
        className={cn(
          "col-start-1 row-start-1 flex min-w-0 items-baseline gap-1.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          selecting && "items-center gap-3"
        )}
      >
        {selecting && <SelectMark picked={picked} className="shrink-0" />}
        <span className="truncate font-medium first-letter:uppercase">
          {item.name}
        </span>
        {item.amount && (
          <span className="shrink-0 text-muted-foreground">
            · {item.amount}
          </span>
        )}
      </button>
      {tags.length > 0 && (
        <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap gap-1.5 @3xl:col-start-2 @3xl:row-start-1 @3xl:max-w-xs @3xl:justify-end">
          {tags.map((tag) => (
            <span
              key={tag.text}
              className={cn(
                "inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
                TAG_TONES[tag.tone]
              )}
            >
              {tag.text}
            </span>
          ))}
        </div>
      )}
      <div
        className={cn(
          "col-start-2 row-start-1 flex items-center gap-1.5 @3xl:col-start-3",
          tags.length > 0 && "row-span-2 @3xl:row-span-1",
          selecting && "invisible"
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void actions.remove(item)}
          aria-label={t("pantry.usedUpName", { name: item.name })}
        >
          {t("pantry.usedUp")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="hidden rounded-full sm:inline-flex"
          onClick={() => void actions.toList([item.name])}
          aria-label={t("pantry.toListName", { name: item.name })}
        >
          <HugeiconsIcon
            icon={ShoppingBasketAdd01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("pantry.toList")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label={t("pantry.options", { name: item.name })}
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onEdit}>
              {t("pantry.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void actions.toList([item.name])}>
              <HugeiconsIcon icon={ShoppingBasketAdd01Icon} strokeWidth={2} />
              {t("pantry.toListName", { name: item.name })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {elsewhere.map((place: StoragePlace) => (
              <DropdownMenuItem
                key={place}
                onClick={() => void actions.change(item, { storedIn: place })}
              >
                {t("pantry.moveTo", {
                  place: t(`pantry.places.${place}`).toLowerCase(),
                })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

/** Things assumed to be at home: tap one running low to put it on the list. */
function AlwaysOnHand({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation()
  const actions = usePantryActions()
  const { data, isPending } = useQuery(onHandQuery)
  return (
    <section
      aria-labelledby="on-hand"
      className="grid gap-3 rounded-3xl border border-dashed bg-muted/40 p-5 md:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="on-hand" className="text-lg font-semibold tracking-tight">
            {t("pantry.onHand")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("pantry.onHandHint")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full bg-card"
          onClick={onEdit}
        >
          {t("pantry.onHandEdit")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isPending ? (
          <Skeleton className="h-8 w-48 rounded-full" />
        ) : (
          (data?.items ?? []).map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              className="rounded-full bg-card"
              aria-label={t("pantry.lowName", { name })}
              onClick={() => void actions.toList([name])}
            >
              <span className="first-letter:uppercase">{name}</span>
              <HugeiconsIcon
                icon={ShoppingBasketAdd01Icon}
                strokeWidth={2}
                data-icon="inline-end"
                className="text-muted-foreground"
              />
            </Button>
          ))
        )}
        <span className="ml-1 text-sm text-muted-foreground">
          {t("pantry.lowOnHand")}
        </span>
      </div>
    </section>
  )
}

/** Type something in: "2 cans black beans" or "rice". */
function QuickAdd() {
  const { t } = useTranslation()
  const actions = usePantryActions()
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const typed = text.trim()
        if (!typed) return
        setBusy(true)
        void actions.add({ text: typed }).then((added) => {
          setBusy(false)
          if (added) setText("")
        })
      }}
    >
      <InputGroup>
        <InputGroupInput
          placeholder={t("pantry.add")}
          aria-label={t("pantry.addLabel")}
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
            aria-label={t("pantry.addButton")}
            disabled={!text.trim() || busy}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
