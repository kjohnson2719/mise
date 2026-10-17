import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { sitesQuery, useRefreshSites, type FollowedSite } from "./queries"
import { ShelfRecipeCard } from "./shelf-recipe-card"

/** Follows a site by an address; true when it worked. */
export function useFollowSite() {
  const { t } = useTranslation()
  const refresh = useRefreshSites()
  return async (url: string) => {
    try {
      const site = await unwrap(api.POST("/api/sites", { body: { url } }))
      await refresh()
      toast.success(t("find.sites.followed", { name: site.name }))
      return true
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return false
    }
  }
}

/**
 * Recipe sites the household follows, with their newest recipes, and
 * following more: by address, or a suggestion.
 */
export function SitesTab({
  site: shown,
  onSite,
}: {
  /** The one site shown, by id; all of them when not given. */
  site?: string
  onSite: (site: string | undefined) => void
}) {
  const { t } = useTranslation()
  const sitesOn = useCapability("sites")
  const { data, isPending } = useQuery(sitesQuery)
  const sites = data?.sites ?? []
  const picked = sites.find((site) => site.id === shown)
  const showing = picked ? [picked] : sites

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <p className="text-muted-foreground">{t("find.sites.description")}</p>
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("find.sites.none")}</EmptyTitle>
              <EmptyDescription>
                {sitesOn ? t("find.sites.noneHint") : t("find.sites.off")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {sites.length > 1 && (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("find.sites.filter")}
              >
                <Button
                  size="sm"
                  variant={picked ? "outline" : "secondary"}
                  aria-pressed={!picked}
                  onClick={() => onSite(undefined)}
                >
                  {t("find.sites.all")}
                </Button>
                {sites.map((site) => (
                  <Button
                    key={site.id}
                    size="sm"
                    variant={site.id === picked?.id ? "secondary" : "outline"}
                    aria-pressed={site.id === picked?.id}
                    onClick={() => onSite(site.id)}
                  >
                    {site.name}
                  </Button>
                ))}
              </div>
            )}
            {showing.map((site) => (
              <SiteSection key={site.id} site={site} />
            ))}
          </>
        )}
      </div>

      {sitesOn && (
        <aside className="grid gap-6 lg:sticky lg:top-6">
          <FollowBox />
          {(data?.suggestions.length ?? 0) > 0 && (
            <Suggestions suggestions={data!.suggestions} />
          )}
        </aside>
      )}
    </div>
  )
}

/** A followed site: its newest recipes, or how reading it is going. */
function SiteSection({ site }: { site: FollowedSite }) {
  const { t, i18n } = useTranslation()
  const refresh = useRefreshSites()
  const [leaving, setLeaving] = React.useState(false)

  async function unfollow() {
    setLeaving(true)
    try {
      await unwrap(
        api.DELETE("/api/sites/{site}", { params: { path: { site: site.id } } })
      )
      await refresh()
      toast.success(t("find.sites.unfollowed", { name: site.name }))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      setLeaving(false)
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby={`site-${site.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="grid gap-0.5">
          <h2
            id={`site-${site.id}`}
            className="font-heading text-xl font-semibold"
          >
            <a
              href={site.url}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:underline"
            >
              {site.name}
            </a>
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {site.reading
              ? t("find.sites.reading")
              : site.waiting > 0
                ? t("find.sites.waiting", { count: site.waiting })
                : site.readAt
                  ? t("find.sites.readAt", {
                      when: formatRelativeDate(site.readAt, i18n.language),
                    })
                  : null}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={leaving}
          onClick={() => void unfollow()}
        >
          {leaving && <Spinner data-icon="inline-start" />}
          {t("find.sites.unfollow")}
        </Button>
      </div>
      {site.error && (
        <p className="text-sm text-destructive" role="status">
          {site.error}
        </p>
      )}
      {site.recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {site.reading || site.waiting > 0
            ? t("find.sites.soon")
            : t("find.sites.noRecipes")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {site.recipes.map((recipe) => (
            <li key={recipe.id}>
              <ShelfRecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Follows any site by pasting its address. */
function FollowBox() {
  const { t } = useTranslation()
  const follow = useFollowSite()
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (url.trim().length < 3) return
        setBusy(true)
        if (await follow(url.trim())) setUrl("")
        setBusy(false)
      }}
    >
      <label htmlFor={id} className="font-medium">
        {t("find.sites.followTitle")}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={url}
          inputMode="url"
          placeholder={t("find.sites.placeholder")}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" disabled={busy || url.trim().length < 3}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("find.sites.follow")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("find.sites.followHint")}
      </p>
    </form>
  )
}

/** Sites that work well with Merran, to follow in a tap. */
export function Suggestions({
  suggestions,
  limit,
}: {
  suggestions: { name: string; url: string; description: string }[]
  limit?: number
}) {
  const { t } = useTranslation()
  const follow = useFollowSite()
  const [busy, setBusy] = React.useState<string | null>(null)

  return (
    <section className="grid gap-3">
      <h2 className="font-medium">{t("find.sites.suggested")}</h2>
      <ul className="grid gap-3">
        {suggestions.slice(0, limit).map((site) => (
          <li key={site.url} className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <a
                href={site.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium hover:underline"
              >
                {site.name}
              </a>
              <p className="text-sm text-muted-foreground">
                {site.description}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              aria-label={t("find.sites.followName", { name: site.name })}
              onClick={async () => {
                setBusy(site.url)
                await follow(site.url)
                setBusy(null)
              }}
            >
              {busy === site.url ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {t("find.sites.follow")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
