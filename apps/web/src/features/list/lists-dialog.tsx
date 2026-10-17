import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
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
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { listQuery, type Aisle, type List } from "./queries"

const MAX_LISTS = 10

/** A list as it's being edited: a new one has a key of its own until saved. */
type Draft = {
  key: string
  id: string | null
  main: boolean
  name: string
  aisles: string[]
}

/**
 * The household's lists, for its admins: any names (Festival, Costco,
 * the corner shop) and the aisles that go on each. Saved as a whole.
 * Stores are chosen for each thing, with Find and Send.
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
  const [drafts, setDrafts] = React.useState<Draft[]>(() => {
    const kept = lists.map((list) => ({ key: list.id, ...list }))
    // Splitting starts with a second list to fill in.
    return kept.length > 1 ? kept : [...kept, blank()]
  })
  const [busy, setBusy] = React.useState(false)
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
                onChange={(event) =>
                  change(draft.key, { name: event.target.value })
                }
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
