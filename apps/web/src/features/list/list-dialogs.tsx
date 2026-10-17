import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import {
  everyWeekQuery,
  foodAliasesQuery,
  joinedNamesQuery,
  onHandQuery,
  type Aisle,
  type List,
  type ListItem,
} from "./queries"
import { useListActions } from "./use-list-actions"

/** No aisle, in a Select: Select values can't be null. */
const NONE = "none"

/** An aisle to pick: the household's, in walking order, or none. */
function AisleSelect({
  id,
  aisles,
  value,
  onChange,
}: {
  id: string
  aisles: readonly Aisle[]
  value: string | null
  onChange: (aisle: string | null) => void
}) {
  const { t } = useTranslation()
  const options = [
    ...aisles.map((aisle) => ({ value: aisle.id, label: aisle.name })),
    { value: NONE, label: t("list.noAisle") },
  ]
  return (
    <Select
      items={options}
      value={value ?? NONE}
      onValueChange={(next) => {
        if (next) onChange(next === NONE ? null : next)
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Changing one thing on the list: its name, how much, its aisle, and the
 * list it's on when there's more than one.
 */
export function EditItemDialog({
  item,
  items,
  aisles,
  lists,
  onClose,
}: {
  item: ListItem | null
  /** Everything on the list, for Same as. */
  items: readonly ListItem[]
  aisles: readonly Aisle[]
  lists: readonly List[]
  onClose: () => void
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {item && (
          <EditItem
            item={item}
            items={items}
            aisles={aisles}
            lists={lists}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditItem({
  item,
  items,
  aisles,
  lists,
  onDone,
}: {
  item: ListItem
  items: readonly ListItem[]
  aisles: readonly Aisle[]
  lists: readonly List[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const actions = useListActions()
  const [name, setName] = React.useState(item.name)
  const [amount, setAmount] = React.useState(item.amount)
  const [aisle, setAisle] = React.useState(item.aisle)
  const [list, setList] = React.useState(item.list)
  const [busy, setBusy] = React.useState(false)
  // The household's own foods: the same as another thing, or names it was
  // joined from kept apart.
  const [same, setSame] = React.useState<string | null>(null)
  const [sameSearch, setSameSearch] = React.useState("")
  const [apart, setApart] = React.useState<ReadonlySet<string>>(new Set())
  const { data: joined } = useQuery(joinedNamesQuery(item.id))
  const listOptions = lists.map((option) => ({
    value: option.id,
    label: option.name,
  }))
  // What else is on the list, by what's typed: a few at a time.
  const others = items.filter((other) => other.id !== item.id && !other.checked)
  const search = sameSearch.trim().toLowerCase()
  const sameMatches =
    search && !same
      ? others
          .filter((other) => other.name.toLowerCase().includes(search))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 6)
      : []
  const names = joined?.names ?? []

  async function save() {
    setBusy(true)
    let done = await actions.change(item, {
      ...(name.trim() !== item.name ? { name: name.trim() } : {}),
      ...(amount.trim() !== item.amount ? { amount: amount.trim() } : {}),
      ...(aisle !== item.aisle ? { aisle } : {}),
      ...(list !== item.list ? { list } : {}),
    })
    const other = items.find((one) => one.id === same)
    if (done && other) {
      done = (await actions.sameAs({ ...item, name: done.name }, other))
        ? done
        : null
    }
    if (done && apart.size > 0) {
      done = (await actions.keepApart(item, [...apart])) ? done : null
    }
    setBusy(false)
    if (done) onDone()
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t("list.editItem.title", { name: item.name })}
        </DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="list-item-name">
          {t("list.editItem.name")}
        </FieldLabel>
        <Input
          id="list-item-name"
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="list-item-amount">
          {t("list.editItem.amount")}
        </FieldLabel>
        <Input
          id="list-item-amount"
          value={amount}
          maxLength={60}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldDescription>{t("list.editItem.amountHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="list-item-aisle">
          {t("list.editItem.aisle")}
        </FieldLabel>
        <AisleSelect
          id="list-item-aisle"
          aisles={aisles}
          value={aisle}
          onChange={setAisle}
        />
        <FieldDescription>{t("list.editItem.aisleHint")}</FieldDescription>
      </Field>
      {lists.length > 1 && (
        <Field>
          <FieldLabel htmlFor="list-item-list">
            {t("list.editItem.list")}
          </FieldLabel>
          <Select
            items={listOptions}
            value={list}
            onValueChange={(next) => {
              if (next) setList(next)
            }}
          >
            <SelectTrigger id="list-item-list" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("list.editItem.listHint")}</FieldDescription>
        </Field>
      )}
      {others.length > 0 && (
        <Field>
          <FieldLabel htmlFor="list-item-same">
            {t("list.sameAs.label")}
          </FieldLabel>
          <Input
            id="list-item-same"
            value={sameSearch}
            maxLength={200}
            autoComplete="off"
            placeholder={t("list.sameAs.placeholder")}
            onChange={(event) => {
              setSameSearch(event.target.value)
              setSame(null)
            }}
            onKeyDown={(event) => {
              // Enter picks the first match, rather than saving.
              if (event.key === "Enter" && sameMatches[0]) {
                event.preventDefault()
                setSame(sameMatches[0].id)
                setSameSearch(sameMatches[0].name)
              }
            }}
          />
          {sameMatches.length > 0 && (
            <ul className="grid gap-0.5">
              {sameMatches.map((other) => (
                <li key={other.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setSame(other.id)
                      setSameSearch(other.name)
                    }}
                  >
                    <span className="first-letter:uppercase">{other.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <FieldDescription>
            {same
              ? t("list.sameAs.chosen", { name: item.name, other: sameSearch })
              : t("list.sameAs.hint")}
          </FieldDescription>
        </Field>
      )}
      {names.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">
            {t("list.apart.label")}
          </legend>
          {names.map((joinedName, index) => (
            <Field key={joinedName} orientation="horizontal">
              <Checkbox
                id={`list-item-apart-${index}`}
                checked={apart.has(joinedName)}
                onCheckedChange={(checked) =>
                  setApart((before) => {
                    const next = new Set(before)
                    if (checked) next.add(joinedName)
                    else next.delete(joinedName)
                    return next
                  })
                }
              />
              <FieldLabel
                htmlFor={`list-item-apart-${index}`}
                className="font-normal"
              >
                <span className="first-letter:uppercase">{joinedName}</span>
              </FieldLabel>
            </Field>
          ))}
          <FieldDescription>{t("list.apart.hint")}</FieldDescription>
        </fieldset>
      )}
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            onDone()
            void actions.remove(item)
          }}
        >
          {t("list.editItem.remove")}
        </Button>
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("list.editItem.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Which list selected things go on, remembered for each food. */
export function ListPickDialog({
  count,
  lists,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  lists: readonly List[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (list: List) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("list.listDialog.title", { count })}</DialogTitle>
          <DialogDescription>{t("list.listDialog.hint")}</DialogDescription>
        </DialogHeader>
        <ul className="-mx-2 grid">
          {lists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                onClick={() => onPick(list)}
                className="w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {list.name}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/** Where selected things go: an aisle, remembered for each food. */
export function AisleDialog({
  count,
  aisles,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  aisles: readonly Aisle[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (aisle: Aisle | null) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("list.aisleDialog.title", { count })}</DialogTitle>
          <DialogDescription>{t("list.aisleDialog.hint")}</DialogDescription>
        </DialogHeader>
        <ul className="-mx-2 grid max-h-[60vh] overflow-y-auto">
          {[...aisles, null].map((aisle) => (
            <li key={aisle?.id ?? NONE}>
              <button
                type="button"
                onClick={() => onPick(aisle)}
                className="w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {aisle?.name ?? t("list.noAisle")}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/** What's bought every week whatever's planned: add and remove. */
export function EveryWeekDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery({ ...everyWeekQuery, enabled: open })
  const [name, setName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      await queryClient.invalidateQueries({ queryKey: everyWeekQuery.queryKey })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.weekly.title")}</DialogTitle>
          <DialogDescription>{t("list.weekly.description")}</DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-24" />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("list.weekly.none")}
          </p>
        ) : (
          <ul className="grid divide-y rounded-2xl border">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 py-1.5 pr-1.5 pl-4"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium first-letter:uppercase">
                    {item.name}
                  </span>
                  {item.amount && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.amount}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={t("list.weekly.remove", { name: item.name })}
                  onClick={() =>
                    void run(() =>
                      unwrap(
                        api.DELETE("/api/list/every-week/{weeklyId}", {
                          params: { path: { weeklyId: item.id } },
                        })
                      )
                    )
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void run(async () => {
              await unwrap(
                api.POST("/api/list/every-week", {
                  body: { name: name.trim(), amount: amount.trim() || null },
                })
              )
              setName("")
              setAmount("")
            })
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("list.weekly.namePlaceholder")}
            aria-label={t("list.weekly.name")}
            maxLength={200}
            className="min-w-36 flex-1"
          />
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("list.weekly.amountPlaceholder")}
            aria-label={t("list.weekly.amount")}
            maxLength={60}
            className="w-28"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !name.trim()}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("list.weekly.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** What the household always has, left off lists made from the plan. */
export function OnHandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery({ ...onHandQuery, enabled: open })
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const items = data?.items ?? []

  async function save(next: string[]) {
    setBusy(true)
    try {
      queryClient.setQueryData(
        onHandQuery.queryKey,
        await unwrap(
          api.PUT("/api/households/current/on-hand", { body: { items: next } })
        )
      )
      toast.success(t("list.onHandDialog.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.onHandDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("list.onHandDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-16" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
              >
                <span className="first-letter:uppercase">{item}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("list.onHandDialog.remove", { name: item })}
                  onClick={() =>
                    void save(items.filter((other) => other !== item))
                  }
                  className="flex size-6 items-center justify-center rounded-full hover:bg-foreground/10"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void save([...items, name.trim()]).then(() => setName(""))
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("list.onHandDialog.placeholder")}
            aria-label={t("list.onHandDialog.label")}
            maxLength={60}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !name.trim()}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("list.onHandDialog.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The household's own names for foods, taught on the list with Same as
 * and Not the same: each can be forgotten, and Merran's own name counts
 * again.
 */
export function FoodsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const actions = useListActions()
  const { data } = useQuery({ ...foodAliasesQuery, enabled: open })
  const [busy, setBusy] = React.useState<string | null>(null)
  const aliases = data?.aliases ?? []

  async function forget(id: string) {
    setBusy(id)
    await actions.forget(id)
    setBusy(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.foodsDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("list.foodsDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-16" />
        ) : aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("list.foodsDialog.none")}
          </p>
        ) : (
          <ul className="grid gap-1">
            {aliases.map((alias) => (
              <li
                key={alias.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-card py-1 pr-1 pl-3 text-sm"
              >
                <span className="first-letter:uppercase">
                  {alias.apart
                    ? t("list.foodsDialog.apart", { name: alias.name })
                    : t("list.foodsDialog.same", {
                        name: alias.name,
                        food: alias.food,
                      })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void forget(alias.id)}
                  aria-label={t("list.foodsDialog.forgetName", {
                    name: alias.name,
                  })}
                >
                  {busy === alias.id && <Spinner data-icon="inline-start" />}
                  {t("list.foodsDialog.forget")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
