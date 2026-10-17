import { Delete02Icon, NoteEditIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import {
  cookNotesQuery,
  useRefreshRecipes,
  type CookNote,
  type Recipe,
} from "./queries"
import { RatingInput, RatingStars } from "./rating-stars"

type Rated = Pick<Recipe, "id" | "name" | "rating">

/**
 * "How did it go?", after cooking or any time: stars and a note for next
 * time. The stars become the recipe's rating.
 */
export function CookNoteDialog({
  recipe,
  open,
  onDone,
}: {
  recipe: Rated
  open: boolean
  /** Saved or skipped. */
  onDone: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDone()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recipes.cookNotes.ask")}</DialogTitle>
          <DialogDescription>
            {t("recipes.cookNotes.askDescription", { name: recipe.name })}
          </DialogDescription>
        </DialogHeader>
        {open && <CookNoteForm recipe={recipe} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  )
}

function CookNoteForm({
  recipe,
  onDone,
}: {
  recipe: Rated
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const [rating, setRating] = React.useState<number | null>(recipe.rating)
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const empty = rating === null && !note.trim()

  async function save() {
    setSaving(true)
    try {
      const added = await unwrap(
        api.POST("/api/recipes/{recipe}/cook-notes", {
          params: { path: { recipe: recipe.id } },
          body: { rating, note: note.trim() || null },
        })
      )
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          queryKey: cookNotesQuery(recipe.id).queryKey,
        }),
      ])
      // A note with AI becomes a suggested change, shown when it's ready.
      toast.success(
        added.suggesting
          ? t("recipes.cookNotes.savedSuggesting")
          : t("recipes.cookNotes.saved")
      )
      onDone()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!empty) void save()
      }}
    >
      <div className="flex justify-center">
        <RatingInput value={rating} onChange={setRating} />
      </div>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("recipes.cookNotes.placeholder")}
        aria-label={t("recipes.cookNotes.noteLabel")}
        maxLength={1000}
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("recipes.cookNotes.skip")}
        </Button>
        <Button type="submit" disabled={empty || saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {t("recipes.cookNotes.save")}
        </Button>
      </div>
    </form>
  )
}

/** The recipe page's notes from each time it was cooked, with a way to add one. */
export function CookNotes({ recipe }: { recipe: Rated }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const notes = useQuery(cookNotesQuery(recipe.id))
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const list = notes.data ?? []

  async function remove(note: CookNote) {
    setRemoving(note.id)
    try {
      await unwrap(
        api.DELETE("/api/recipes/{recipe}/cook-notes/{noteId}", {
          params: { path: { recipe: recipe.id, noteId: note.id } },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: cookNotesQuery(recipe.id).queryKey,
      })
      toast.success(t("recipes.cookNotes.deleted"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="cook-notes-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cook-notes-heading" className="text-xl font-semibold">
          {t("recipes.cookNotes.title")}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <HugeiconsIcon
            icon={NoteEditIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("recipes.cookNotes.add")}
        </Button>
      </div>
      {notes.isSuccess && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("recipes.cookNotes.none")}
        </p>
      ) : (
        <ul className="grid gap-2">
          {list.map((note) => {
            const when = formatRelativeDate(note.createdAt, i18n.language)
            return (
              <li
                key={note.id}
                className="group flex items-start gap-3 rounded-2xl border bg-card p-3 text-sm"
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                    {note.rating !== null && (
                      <RatingStars rating={note.rating} />
                    )}
                    <span>
                      {note.by
                        ? t("recipes.cookNotes.byWhen", {
                            when,
                            name: note.by,
                          })
                        : when}
                    </span>
                  </div>
                  {note.note && (
                    <p className="whitespace-pre-line text-foreground">
                      {note.note}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("recipes.cookNotes.delete")}
                  className="opacity-60 group-hover:opacity-100"
                  disabled={removing === note.id}
                  onClick={() => void remove(note)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <CookNoteDialog
        recipe={recipe}
        open={adding}
        onDone={() => setAdding(false)}
      />
    </section>
  )
}

/** The latest note with words in it, for getting ready to cook: "Last time: needed more salt". */
export function LastCookNote({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation()
  const notes = useQuery(cookNotesQuery(recipeId))
  const last = notes.data?.find((note) => note.note)
  if (!last?.note) return null
  return (
    <p className="rounded-2xl border border-highlight/40 bg-highlight/10 px-4 py-3 text-base">
      <span className="font-semibold">{t("recipes.cookNotes.lastTime")}</span>{" "}
      {last.note}
    </p>
  )
}
