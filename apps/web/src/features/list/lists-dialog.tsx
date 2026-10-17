import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { STORES_BY_KEY, storeNamed, storesFor } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCapability } from "@/features/capabilities/queries"
import { householdQuery } from "@/features/household/queries"
import { storesQuery } from "@/features/stores/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { listQuery, type Aisle, type List } from "./queries"

const MAX_LISTS = 10

/** A list as it's being edited: a new one has a key of its own until saved. */
type Draft = {
  key: string
  id: string | null
  main: boolean
  name: string
  store: string | null
  /**
   * Its store was picked from the list of stores (or it had one already),
   * so naming it doesn't change it.
   */
  storePicked: boolean
  aisles: string[]
}

/**
 * The household's lists, for its admins: any names (Festival, Costco,
 * the corner shop), the store each is for, and the aisles that go on
 * each. Saved as a whole.
 */
export function ListsDialog({
  open,
  onOpenChange,
  lists,
  aisles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: readonly List[]
  aisles: readonly Aisle[]
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("list.lists.title")}</DialogTitle>
          <DialogDescription>{t("list.lists.description")}</DialogDescription>
        </DialogHeader>
        {open && (
          <ListsEditor
            lists={lists}
            aisles={aisles}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListsEditor({
  lists,
  aisles,
  onDone,
}: {
  lists: readonly List[]
  aisles: readonly Aisle[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useQuery(householdQuery)
  const kroger = useCapability("stores.kroger")
  const { data: storesStatus } = useQuery({ ...storesQuery, enabled: kroger })
  const banner = storesStatus?.kroger.location?.banner
  /** The store a list's name is for: "Walmart", or "Fry's" for Kroger. */
  const namedStore = (name: string) =>
    storeNamed(
      name,
      household?.country,
      banner ? [{ key: "kroger", name: banner }] : []
    )
  const [drafts, setDrafts] = React.useState<Draft[]>(() => {
    // A list named for a store and not set to one shows that store, as the
    // list page takes it, unless another list has it.
    const taken = new Set(lists.flatMap((list) => list.store ?? []))
    const kept = lists.map((list) => {
      const named = list.store === null ? namedStore(list.name) : null
      const store = list.store ?? (named && !taken.has(named) ? named : null)
      if (store) taken.add(store)
      return { key: list.id, ...list, store, storePicked: list.store !== null }
    })
    // Splitting starts with a second list to fill in.
    return kept.length > 1 ? kept : [...kept, blank()]
  })
  const [busy, setBusy] = React.useState(false)
  // The household's country's stores, and any a list is for already.
  const stores = [
    ...storesFor(household?.country),
    ...drafts.flatMap((draft) => {
      const store = draft.store ? STORES_BY_KEY.get(draft.store) : undefined
      return store && !storesFor(household?.country).includes(store)
        ? [store]
        : []
    }),
  ]
  const storeItems = [
    { value: "none", label: t("list.lists.anyStore") },
    ...stores.map((store) => ({ value: store.key, label: store.name })),
  ]

  /**
   * Renames a list: one named for a store ("Walmart", or "Fry's" for the
   * household's Kroger store) is that store's, unless a store was picked
   * for it, or another list has it.
   */
  const rename = (key: string, name: string) =>
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.key !== key) return draft
        if (draft.storePicked) return { ...draft, name }
        const named = namedStore(name)
        const taken = current.some(
          (other) => other.key !== key && named && other.store === named
        )
        return { ...draft, name, store: taken ? null : named }
      })
    )

  const change = (key: string, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft
      )
    )

  function blank(): Draft {
    return {
      key: crypto.randomUUID(),
      id: null,
      main: false,
      name: "",
      store: null,
      storePicked: false,
      aisles: [],
    }
  }

  async function save() {
    setBusy(true)
    try {
      await unwrap(
        api.PUT("/api/list/lists", {
          body: {
            lists: drafts.map((draft) => ({
              id: draft.id,
              name: draft.name.trim(),
              store: draft.store,
              aisles: draft.main ? [] : draft.aisles,
            })),
          },
        })
      )
      await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
      toast.success(t("list.lists.saved"))
      onDone()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const takenBy = (aisle: string, key: string) =>
    drafts.find(
      (draft) =>
        draft.key !== key && !draft.main && draft.aisles.includes(aisle)
    )

  return (
    <form
      className="grid min-w-0 gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <ul className="-mx-1 grid max-h-[60vh] gap-4 overflow-y-auto px-1">
        {drafts.map((draft) => (
          <li key={draft.key} className="grid gap-3 rounded-2xl border p-4">
            <div className="flex items-center gap-2">
              <Input
                value={draft.name}
                onChange={(event) => rename(draft.key, event.target.value)}
                placeholder={
                  draft.main
                    ? t("list.lists.mainPlaceholder")
                    : t("list.lists.namePlaceholder")
                }
                aria-label={t("list.lists.name")}
                maxLength={40}
                required
              />
              {!draft.main && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("list.lists.remove", {
                    name: draft.name || t("list.lists.thisList"),
                  })}
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter((other) => other.key !== draft.key)
                    )
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              )}
            </div>
            <Select
              items={storeItems}
              value={draft.store ?? "none"}
              onValueChange={(next) =>
                change(draft.key, {
                  store: !next || next === "none" ? null : String(next),
                  storePicked: true,
                })
              }
            >
              <SelectTrigger
                className="w-full"
                aria-label={t("list.lists.store")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storeItems.map((item) => {
                  const other = drafts.find(
                    (one) => one.key !== draft.key && one.store === item.value
                  )
                  return (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      disabled={Boolean(other)}
                    >
                      {other
                        ? t("list.lists.storeTaken", {
                            store: item.label,
                            name: other.name || t("list.lists.anotherList"),
                          })
                        : item.label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {draft.main ? (
              <p className="text-sm text-muted-foreground">
                {t("list.lists.mainHint")}
              </p>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  {t("list.lists.aisles")}
                </p>
                <ToggleGroup
                  multiple
                  variant="outline"
                  size="sm"
                  value={draft.aisles}
                  onValueChange={(value) =>
                    change(draft.key, { aisles: value as string[] })
                  }
                  className="flex-wrap justify-start"
                >
                  {aisles.map((aisle) => {
                    const other = takenBy(aisle.id, draft.key)
                    return (
                      <ToggleGroupItem
                        key={aisle.id}
                        value={aisle.id}
                        disabled={Boolean(other)}
                        title={
                          other
                            ? t("list.lists.takenBy", {
                                name: other.name || t("list.lists.anotherList"),
                              })
                            : undefined
                        }
                      >
                        {aisle.name}
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
              </div>
            )}
          </li>
        ))}
      </ul>
      {drafts.length < MAX_LISTS && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => setDrafts((current) => [...current, blank()])}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("list.lists.add")}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        {t("list.lists.movesHint")}
      </p>
      <Button type="submit" disabled={busy}>
        {busy && <Spinner data-icon="inline-start" />}
        {t("list.lists.save")}
      </Button>
    </form>
  )
}
