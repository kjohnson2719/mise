import { AiMagicIcon, ImageAdd02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { useAiPhotos } from "./ai-photos"
import { recipeQuery, useRefreshRecipes, type Recipe } from "./queries"

/** Photos people can pick: what browsers show and Merran can read. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif"

/**
 * Adding, changing and taking away a recipe's photo. `choose` opens the
 * file picker; `input` is the hidden picker to render once.
 */
export function usePhotoActions(recipe: Recipe) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const picker = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [making, setMaking] = React.useState(false)
  const aiPhotos = useAiPhotos()

  async function run(work: () => Promise<Recipe>, done: string) {
    setBusy(true)
    try {
      queryClient.setQueryData(recipeQuery(recipe.slug).queryKey, await work())
      await refresh()
      toast.success(done)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const upload = (file: File) =>
    run(
      () =>
        unwrap(
          api.PUT("/api/recipes/{recipe}/photo", {
            params: { path: { recipe: recipe.id } },
            // The photo itself is the body, not JSON.
            body: file as unknown as string,
            bodySerializer: (body) => body as unknown as BodyInit,
            headers: { "content-type": file.type || "image/jpeg" },
          })
        ),
      recipe.photo ? t("recipes.photo.changed") : t("recipes.photo.added")
    )

  const remove = () =>
    run(
      () =>
        unwrap(
          api.DELETE("/api/recipes/{recipe}/photo", {
            params: { path: { recipe: recipe.id } },
          })
        ),
      t("recipes.photo.removed")
    )

  /** A photo made by AI, for a recipe without one or in place of an AI one. */
  async function make() {
    setMaking(true)
    await run(
      () =>
        unwrap(
          api.POST("/api/recipes/{recipe}/photo/make", {
            params: { path: { recipe: recipe.id } },
          })
        ),
      t("recipes.photo.made")
    )
    setMaking(false)
  }

  const input = (
    <input
      ref={picker}
      type="file"
      accept={ACCEPT}
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) void upload(file)
      }}
    />
  )

  return {
    busy,
    making,
    /** Whether AI can make it a photo: none yet, or one made by AI. */
    canMake: aiPhotos && (!recipe.photo || recipe.photoByAi),
    make: () => void make(),
    choose: () => picker.current?.click(),
    remove,
    input,
  }
}

export type PhotoActions = ReturnType<typeof usePhotoActions>

/** The recipe's photo at the top of its page, or a place to add one. */
export function RecipePhoto({
  recipe,
  actions,
  className,
}: {
  recipe: Recipe
  actions: PhotoActions
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-muted",
        // Without a photo, the place to add one stays small on phones.
        recipe.photo ? "aspect-[4/3]" : "aspect-[5/2] md:aspect-[4/3]",
        className
      )}
    >
      {recipe.photo ? (
        <>
          <img
            src={recipe.photo.full}
            alt={t("recipes.photo.alt", { name: recipe.name })}
            className="size-full object-cover"
          />
          {recipe.photoByAi && (
            <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
              <HugeiconsIcon
                icon={AiMagicIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("recipes.photo.byAi")}
            </span>
          )}
        </>
      ) : (
        <div className="relative size-full">
          <button
            type="button"
            onClick={actions.choose}
            disabled={actions.busy}
            className="flex size-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={ImageAdd02Icon}
              strokeWidth={1.5}
              className="size-8"
            />
            <span className="text-sm font-medium">
              {t("recipes.photo.add")}
            </span>
          </button>
          {actions.canMake && (
            <Button
              size="sm"
              variant="secondary"
              disabled={actions.busy}
              onClick={actions.make}
              className="absolute bottom-3 left-1/2 -translate-x-1/2"
            >
              <HugeiconsIcon
                icon={AiMagicIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("recipes.photo.make")}
            </Button>
          )}
        </div>
      )}
      {actions.busy && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60"
          aria-live="polite"
        >
          <Spinner className="size-6" />
          {actions.making && (
            <span className="text-sm font-medium">
              {t("recipes.photo.making")}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
