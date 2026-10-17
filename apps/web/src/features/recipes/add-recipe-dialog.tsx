import {
  Add01Icon,
  Camera01Icon,
  Link01Icon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { FromPhotos } from "./import/from-photos"
import { PasteText } from "./import/paste-text"
import { useRefreshRecipes, type Recipe } from "./queries"
import { SeveralLinks } from "./several-links"

type Form = { url: string }

/** What the dialog shows: one link, several, pasted text, or photos. */
type View = "link" | "several" | "text" | "photos"

/** TikTok, YouTube, Instagram and Facebook: read as videos, which takes longer. */
const VIDEO_LINK =
  /^\s*(https?:\/\/)?([\w-]+\.)*(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)\b/i

/**
 * Adding a recipe: from a link, which reads the recipe off the page or the
 * video; from text or photos, which AI reads; or by typing it in.
 */
export function AddRecipeDialog({ trigger }: { trigger?: React.ReactElement }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>("link")
  // Text and photos are read by AI, offered once there's AI on the server.
  const aiOn = useCapability("ai")
  const videoOn = useCapability("video")
  // Still open when AI has finished reading, which can take a while.
  const stillOpen = React.useRef(open)
  stillOpen.current = open
  const [already, setAlready] = React.useState<{
    recipe: Recipe
    url: string
  } | null>(null)
  const form = useForm<Form>({ defaultValues: { url: "" } })
  const { errors, isSubmitting } = form.formState

  async function importLink(url: string, force = false) {
    const result = await unwrap(
      api.POST("/api/recipes/import", { body: { url, force } })
    )
    if (result.duplicate) {
      setAlready({ recipe: result.recipe, url })
      return
    }
    await refresh()
    setOpen(false)
    toast.success(t("recipes.import.added", { name: result.recipe.name }))
    await navigate({
      to: "/recipes/$slug",
      params: { slug: result.recipe.slug },
    })
  }

  /** Read by AI: opened, unless the dialog was closed while it read. */
  async function addedByAi(recipe: Recipe) {
    await refresh()
    toast.success(t("recipes.import.ai.added", { name: recipe.name }))
    if (!stillOpen.current) return
    setOpen(false)
    setView("link")
    await navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
  }

  const onSubmit = form.handleSubmit(async ({ url }) => {
    try {
      await importLink(url.trim())
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      form.setError("url", { message: error.message })
    }
  })

  const [again, setAgain] = React.useState(false)
  async function importAgain() {
    if (!already) return
    setAgain(true)
    try {
      await importLink(already.url, true)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setAgain(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setAlready(null)
          setView("link")
          form.reset()
        }
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              {t("recipes.add")}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        {view === "text" ? (
          <PasteText
            onBack={() => setView("link")}
            onAdded={(recipe) => void addedByAi(recipe)}
            onNavigate={() => setOpen(false)}
          />
        ) : view === "photos" ? (
          <FromPhotos
            onBack={() => setView("link")}
            onAdded={(recipe) => void addedByAi(recipe)}
            onNavigate={() => setOpen(false)}
          />
        ) : view === "several" ? (
          <SeveralLinks
            onBack={() => setView("link")}
            onStarted={(importId) => {
              setOpen(false)
              setView("link")
              void navigate({
                to: "/recipes/import/$importId",
                params: { importId },
              })
            }}
          />
        ) : already ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("recipes.import.alreadyTitle")}</DialogTitle>
              <DialogDescription>
                {t("recipes.import.alreadyDescription", {
                  name: already.recipe.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={importAgain} disabled={again}>
                {again && <Spinner />}
                {t("recipes.import.again")}
              </Button>
              <Button
                render={
                  <Link
                    to="/recipes/$slug"
                    params={{ slug: already.recipe.slug }}
                    onClick={() => setOpen(false)}
                  />
                }
              >
                {t("recipes.import.open")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            <DialogHeader>
              <DialogTitle>{t("recipes.add")}</DialogTitle>
              <DialogDescription>
                {videoOn
                  ? t("recipes.import.descriptionVideo")
                  : t("recipes.import.description")}
              </DialogDescription>
            </DialogHeader>
            <TextField
              label={t("recipes.import.link")}
              type="url"
              inputMode="url"
              placeholder="https://"
              autoFocus
              error={errors.url?.message}
              {...form.register("url", {
                validate: (value) =>
                  value.trim() !== "" || t("recipes.import.linkNeeded"),
              })}
            />
            {isSubmitting && VIDEO_LINK.test(form.getValues("url")) && (
              <p
                className="-mt-3 text-sm text-muted-foreground"
                aria-live="polite"
              >
                {t("recipes.import.readingVideo")}
              </p>
            )}
            <Button
              type="button"
              variant="link"
              className="-mt-3 justify-self-start px-0"
              onClick={() => setView("several")}
            >
              {t("recipes.import.several")}
            </Button>
            {aiOn && (
              <div className="grid gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  {t("recipes.import.noLink")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setView("text")}
                  >
                    <HugeiconsIcon
                      icon={TextIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("recipes.import.fromText")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setView("photos")}
                  >
                    <HugeiconsIcon
                      icon={Camera01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("recipes.import.fromPhotos")}
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter className="items-center sm:justify-between">
              <Button
                variant="link"
                className="px-0"
                render={
                  <Link to="/recipes/new" onClick={() => setOpen(false)} />
                }
              >
                {t("recipes.import.typeIt")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
                )}
                {isSubmitting
                  ? VIDEO_LINK.test(form.getValues("url"))
                    ? t("recipes.import.readingVideoShort")
                    : t("recipes.import.reading")
                  : t("recipes.import.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
