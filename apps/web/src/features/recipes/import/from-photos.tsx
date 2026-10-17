import {
  Add01Icon,
  Camera01Icon,
  Cancel01Icon,
  File02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldDescription, FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"
import { cn } from "@/lib/utils"

import type { Recipe } from "../queries"

/** The most photos one recipe is read from. */
const MAX_PHOTOS = 4

/** AI reads photos at 1600 pixels, so they're sent no bigger than this. */
const MAX_SIDE = 2000

type Photo = { id: string; blob: Blob; url: string; pdf: boolean }

/**
 * Photos of a recipe, for the Add a recipe dialog: a cookbook page or two,
 * a card or a screenshot, read by AI as one recipe.
 */
export function FromPhotos({
  onBack,
  onAdded,
  onNavigate,
}: {
  onBack: () => void
  onAdded: (recipe: Recipe) => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const ai = useAiFor("import")
  const input = React.useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = React.useState<Photo[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)

  // Their previews go when they do.
  const shown = React.useRef(photos)
  shown.current = photos
  React.useEffect(
    () => () => {
      for (const photo of shown.current) URL.revokeObjectURL(photo.url)
    },
    []
  )

  async function add(files: File[]) {
    const images = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type === "application/pdf"
    )
    if (images.length === 0) return
    const room = MAX_PHOTOS - photos.length
    setError(images.length > room ? t("recipes.import.photos.tooMany") : null)
    const added = await Promise.all(
      images.slice(0, Math.max(room, 0)).map(async (file) => {
        // A PDF goes as it is: AI reads its pages.
        const pdf = file.type === "application/pdf"
        const blob = pdf ? file : await shrinkPhoto(file, MAX_SIDE)
        return {
          id: crypto.randomUUID(),
          blob,
          url: URL.createObjectURL(blob),
          pdf,
        }
      })
    )
    setPhotos((now) => [...now, ...added].slice(0, MAX_PHOTOS))
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id)
    if (photo) URL.revokeObjectURL(photo.url)
    setPhotos((now) => now.filter((p) => p.id !== id))
    setError(null)
  }

  async function read() {
    if (photos.length === 0) {
      setError(t("recipes.import.photos.needed"))
      return
    }
    setBusy(true)
    setError(null)
    const form = new FormData()
    photos.forEach((photo, i) =>
      form.append(
        "photos",
        photo.blob,
        photo.pdf ? `page-${i + 1}.pdf` : `photo-${i + 1}.jpg`
      )
    )
    try {
      onAdded(
        await unwrap(
          api.POST("/api/recipes/import/photos", {
            body: form as unknown as { photos?: string[] },
          })
        )
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.fields.photos ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  const choose = () => input.current?.click()
  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      setOver(false)
      if (!busy) void add([...event.dataTransfer.files])
    },
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("recipes.import.photos.title")}</DialogTitle>
        <DialogDescription>
          {t("recipes.import.photos.description")}
        </DialogDescription>
      </DialogHeader>
      {ai.why && <NeedsAi task="import" why={ai.why} onNavigate={onNavigate} />}
      <form
        className="grid min-w-0 gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void read()
        }}
      >
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(event) => {
            void add([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
        <div className="grid gap-2">
          {photos.length === 0 ? (
            <button
              type="button"
              autoFocus
              onClick={choose}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-10 text-sm text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                over && "border-primary bg-muted/50",
                error && "border-destructive"
              )}
              {...dropProps}
            >
              <HugeiconsIcon
                icon={Camera01Icon}
                strokeWidth={2}
                className="size-6"
              />
              {t("recipes.import.photos.choose")}
            </button>
          ) : (
            <ol
              className={cn(
                "grid grid-cols-4 gap-2 rounded-2xl",
                over && "ring-2 ring-primary"
              )}
              {...dropProps}
            >
              {photos.map((photo, i) => (
                <li
                  key={photo.id}
                  className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted"
                >
                  {photo.pdf ? (
                    <span className="grid size-full place-items-center text-destructive">
                      <HugeiconsIcon icon={File02Icon} strokeWidth={2} />
                      <span className="sr-only">
                        {t("recipes.import.photos.photo", { n: i + 1 })}
                      </span>
                    </span>
                  ) : (
                    <img
                      src={photo.url}
                      alt={t("recipes.import.photos.photo", { n: i + 1 })}
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute top-1 left-1 rounded-full bg-background/90 px-1.5 text-xs font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="absolute top-1 right-1 rounded-full"
                    aria-label={t("recipes.import.photos.remove", { n: i + 1 })}
                    disabled={busy}
                    onClick={() => remove(photo.id)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </li>
              ))}
              {photos.length < MAX_PHOTOS && (
                <li>
                  <button
                    type="button"
                    onClick={choose}
                    disabled={busy}
                    className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  >
                    <HugeiconsIcon
                      icon={Add01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    {t("recipes.import.photos.more")}
                  </button>
                </li>
              )}
            </ol>
          )}
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            busy && (
              <FieldDescription aria-live="polite">
                {t("recipes.import.ai.slow")}
              </FieldDescription>
            )
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t("recipes.import.ai.back")}
          </Button>
          <Button
            type="submit"
            disabled={busy || photos.length === 0 || ai.ready === false}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {busy
              ? t("recipes.import.ai.reading")
              : t("recipes.import.photos.submit", {
                  count: Math.max(photos.length, 1),
                })}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
