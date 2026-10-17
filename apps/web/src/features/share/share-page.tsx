import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"

import { forgetShared, readShared } from "./shared-files"

/**
 * What Android's share sheet hands over, as the manifest's share target
 * asks: text and a link, or the id the service worker kept photos and PDFs
 * under. `lost` says files came when there was no service worker to keep
 * them.
 */
export type ShareSearch = {
  title?: string
  text?: string
  url?: string
  id?: string
  lost?: true
}

/**
 * Photos go no wider than this, as the receipt scanner sends them: a
 * shared photo is read as a receipt first, and a long one's print has to
 * stay readable.
 */
const MAX_WIDTH = 1600

/** The site a shared link is on, for "Adding the recipe from example.com…". */
function siteOf({ title, text, url }: ShareSearch) {
  const link = [url, text, title].join(" ").match(/https?:\/\/[^\s<>"']+/)?.[0]
  if (!link) return null
  try {
    return new URL(link).hostname.replace(/^(?:www|m)\./, "")
  } catch {
    return null
  }
}

/**
 * Sends on what the service worker kept, made smaller, then forgets it:
 * null when it's gone.
 */
async function sendKept(id: string) {
  const shared = await readShared(id)
  if (!shared || shared.files.length === 0) return null
  const form = new FormData()
  for (const key of ["title", "text", "url"] as const) {
    const value = shared[key]
    if (value) form.append(key, value)
  }
  for (const file of shared.files) {
    const body = file.type.startsWith("image/")
      ? await shrinkPhoto(file, MAX_WIDTH, "width")
      : file
    form.append("file", body, file.name)
  }
  try {
    return await unwrap(
      api.POST("/api/share", {
        body: form as unknown as { title?: string },
      })
    )
  } finally {
    // Dealt with either way, so going back doesn't send it again.
    void forgetShared(id)
  }
}

/**
 * Something shared to Merran from Android's share sheet: added, then on to
 * the recipe, the import or the receipt; or said why not.
 */
export function SharePage({ search }: { search: ShareSearch }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refreshRecipes = useRefreshRecipes()
  const [failed, setFailed] = React.useState<string | null>(null)
  const nothing =
    !search.title && !search.text && !search.url && !search.id && !search.lost

  // Once, even when React runs effects twice.
  const started = React.useRef(false)
  React.useEffect(() => {
    if (nothing || search.lost || started.current) return
    started.current = true
    void (async () => {
      try {
        const result = search.id
          ? await sendKept(search.id)
          : await unwrap(
              api.POST("/api/share", {
                body: {
                  title: search.title,
                  text: search.text,
                  url: search.url,
                },
              })
            )
        if (!result) {
          setFailed(t("share.gone"))
          return
        }
        if (result.outcome === "importing" && result.importId) {
          // Several links: on to their import, going in the background.
          await navigate({
            to: "/recipes/import/$importId",
            params: { importId: result.importId },
            replace: true,
          })
          return
        }
        if (result.outcome === "receipt" && result.receiptId) {
          // A receipt: on to look it over for the pantry.
          await navigate({
            to: "/pantry/receipts/$receiptId",
            params: { receiptId: result.receiptId },
            replace: true,
          })
          return
        }
        if (result.outcome === "failed" || !result.recipe) {
          setFailed(result.message)
          return
        }
        const { name, slug } = result.recipe
        await refreshRecipes()
        toast.success(
          result.outcome === "added"
            ? t("share.added", { name })
            : t("share.already", { name })
        )
        // In place of this page, so going back doesn't share it again.
        await navigate({
          to: "/recipes/$slug",
          params: { slug },
          replace: true,
        })
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
        setFailed(err.message)
      }
    })()
  }, [nothing, search, navigate, refreshRecipes, t])

  const site = siteOf(search)
  const problem = failed ?? (search.lost ? t("share.lost") : null)

  return (
    <>
      <PageHeader title={t("share.title")} />
      {nothing ? (
        <p className="text-muted-foreground">{t("share.nothing")}</p>
      ) : problem ? (
        <div className="grid max-w-xl justify-items-start gap-4">
          <Alert>
            <AlertTitle>{t("share.notAdded")}</AlertTitle>
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/recipes/new" />}>
              {t("share.addRecipe")}
            </Button>
            <Button variant="outline" render={<Link to="/recipes" />}>
              {t("share.toRecipes")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 font-medium" aria-live="polite">
          <Spinner />
          {search.id
            ? t("share.reading")
            : site
              ? t("share.adding", { site })
              : t("share.addingSomething")}
        </p>
      )}
    </>
  )
}
