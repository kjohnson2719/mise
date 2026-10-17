import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

type Discovery = Schemas["Discovery"]
type Found = Discovery["recipes"][number]

// Under ["recipes"], so live updates bring a finished search in.
export const searchesQuery = queryOptions({
  queryKey: ["recipes", "discover"],
  queryFn: () => unwrap(api.GET("/api/discover")),
  refetchInterval: (query) =>
    query.state.data?.searches.some((search) => search.status === "searching")
      ? 2000
      : false,
})

const IDEAS = ["soups", "pasta", "sheetPan", "chicken", "vegetarian"] as const

/** New recipes online for a theme, found with AI, ready to import. */
export function DiscoverTab() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const ai = useAiFor("discover")
  const { data } = useQuery(searchesQuery)
  const [theme, setTheme] = React.useState("")
  const [shown, setShown] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const searches = data?.searches ?? []
  const search = searches.find((s) => s.id === shown) ?? searches[0]
  const searching = searches.some((s) => s.status === "searching")

  async function start(asked: string) {
    const trimmed = asked.trim()
    if (trimmed.length < 2) return
    setStarting(true)
    try {
      const started = await unwrap(
        api.POST("/api/discover", { body: { theme: trimmed } })
      )
      setShown(started.id)
      setTheme("")
      await queryClient.invalidateQueries({ queryKey: searchesQuery.queryKey })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <p className="text-muted-foreground">{t("discover.description")}</p>
      <div className="grid gap-6">
        {ai.why ? (
          <NeedsAi task="discover" why={ai.why} />
        ) : (
          <div className="grid gap-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void start(theme)
              }}
            >
              <Input
                value={theme}
                maxLength={200}
                placeholder={t("discover.placeholder")}
                aria-label={t("discover.placeholder")}
                onChange={(event) => setTheme(event.target.value)}
              />
              <Button
                type="submit"
                disabled={starting || searching || theme.trim().length < 2}
              >
                {starting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("discover.find")}
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <Button
                  key={idea}
                  variant="outline"
                  size="sm"
                  disabled={starting || searching}
                  onClick={() => void start(t(`discover.ideas.${idea}`))}
                >
                  {t(`discover.ideas.${idea}`)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {search && <Search search={search} />}

        {searches.length > 1 && (
          <section className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("discover.earlier")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {searches.map((s) => (
                <Button
                  key={s.id}
                  variant={s.id === search?.id ? "secondary" : "ghost"}
                  size="sm"
                  className="max-w-full"
                  onClick={() => setShown(s.id)}
                >
                  <span className="truncate">{s.theme}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatRelativeDate(s.createdAt, i18n.language)}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

/** A search: going, what it found, or why it found nothing. */
export function Search({
  search,
  hideTheme = false,
}: {
  search: Discovery
  /** Its theme goes without saying, as on a collection's page. */
  hideTheme?: boolean
}) {
  const { t } = useTranslation()
  if (search.status === "searching") {
    return (
      <section className="grid gap-4">
        <p
          className="flex items-center gap-2 text-muted-foreground"
          aria-live="polite"
        >
          <Spinner />
          {t("discover.searching", { theme: search.theme })}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-3xl" />
          ))}
        </div>
      </section>
    )
  }
  return (
    <section className="grid gap-4">
      {!hideTheme && (
        <h2 className="text-xl font-semibold break-words">{search.theme}</h2>
      )}
      {search.error && (
        <p className="text-muted-foreground" role="status">
          {search.error}
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {search.recipes.map((found) => (
          <li key={found.url}>
            <FoundCard found={found} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A recipe found online: its photo, site and time, why, and Import. */
function FoundCard({ found }: { found: Found }) {
  const { t } = useTranslation()
  const refresh = useRefreshRecipes()
  const [busy, setBusy] = React.useState(false)
  const [imported, setImported] = React.useState<string | null>(null)

  async function importIt() {
    setBusy(true)
    try {
      const result = await unwrap(
        api.POST("/api/recipes/import", { body: { url: found.url } })
      )
      setImported(result.recipe.slug)
      await refresh()
      toast.success(t("recipes.import.added", { name: result.recipe.name }))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-3xl border bg-card">
      <div className="aspect-[4/3] bg-muted">
        {found.photo && (
          <img
            src={found.photo}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="grid content-between gap-3 p-4">
        <div className="grid gap-1">
          <a
            href={found.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold hover:underline"
          >
            {found.name}
          </a>
          <p className="text-sm text-muted-foreground">
            {[
              found.site,
              found.minutes &&
                t("discover.minutes", { minutes: found.minutes }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-sm">{found.why}</p>
        </div>
        {imported ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/recipes/$slug" params={{ slug: imported }} />}
          >
            {t("discover.open")}
          </Button>
        ) : (
          <Button
            size="sm"
            className={cn(busy && "opacity-80")}
            disabled={busy}
            onClick={() => void importIt()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {t("discover.import")}
          </Button>
        )}
      </div>
    </article>
  )
}
