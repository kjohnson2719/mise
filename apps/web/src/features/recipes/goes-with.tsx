import {
  Add01Icon,
  Cancel01Icon,
  PencilEdit02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { pairedRecipeLines } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import {
  pairingsQuery,
  tagsQuery,
  useRefreshRecipes,
  type Recipe,
  type RecipePairings,
} from "./queries"

function failed(error: unknown) {
  if (!(error instanceof ApiError)) throw error
  toast.error(error.message)
}

const CHIP =
  "inline-flex h-7 items-center gap-1 rounded-full px-3 text-sm transition-colors"

/**
 * What a recipe goes with, as chips: tap one to see them together. Also the
 * recipes it's offered with ("Pairs with Chicken + Rice"), and a way to
 * change what it goes with.
 */
export function GoesWith({
  recipe,
  selected,
  paired,
  onSelect,
}: {
  recipe: Recipe
  /** The slug shown with it, if any. */
  selected: string | undefined
  /** That recipe, once loaded. */
  paired: Recipe | undefined
  onSelect: (slug: string | undefined) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const pairings = useQuery(pairingsQuery(recipe.id))
  const [managing, setManaging] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const options = pairings.data?.options ?? []
  const pairsWith = pairings.data?.pairsWith ?? []

  /** The two together as a recipe of their own. */
  async function saveAsRecipe() {
    if (!paired) return
    setSaving(true)
    try {
      const saved = await unwrap(
        api.POST("/api/recipes", {
          body: {
            ...pairedRecipeLines(recipe, paired),
            name: t("recipes.pairing.name", {
              base: recipe.name,
              paired: paired.name,
            }),
            tags: recipe.tags,
          },
        })
      )
      await refresh()
      toast.success(t("recipes.pairing.saved", { name: saved.name }))
      await navigate({ to: "/recipes/$slug", params: { slug: saved.slug } })
    } catch (error) {
      failed(error)
    } finally {
      setSaving(false)
    }
  }

  if (pairings.isPending) return null
  return (
    <div className="grid gap-2">
      {options.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">
            {t("recipes.pairing.goesWith")}
          </span>
          {options.map((option) => {
            const on = option.slug === selected
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? undefined : option.slug)}
                className={cn(
                  CHIP,
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                )}
              >
                {on && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                )}
                {option.name}
              </button>
            )
          })}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("recipes.pairing.change")}
            title={t("recipes.pairing.change")}
            onClick={() => setManaging(true)}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          {t("recipes.pairing.add")}
        </button>
      )}

      {selected && paired && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            <Trans
              i18nKey="recipes.pairing.showing"
              values={{ name: paired.name }}
              components={{
                link: (
                  <Link
                    to="/recipes/$slug"
                    params={{ slug: paired.slug }}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  />
                ),
              }}
            />
          </span>
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:opacity-50"
            disabled={saving}
            onClick={() => void saveAsRecipe()}
          >
            {saving
              ? t("recipes.pairing.saving")
              : t("recipes.pairing.saveAsRecipe")}
          </button>
        </p>
      )}

      {pairsWith.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">
            {t("recipes.pairing.pairsWith")}
          </span>
          {pairsWith.map((base) => (
            <Link
              key={base.id}
              to="/recipes/$slug"
              params={{ slug: base.slug }}
              search={{ with: recipe.slug }}
              className={cn(CHIP, "border bg-background hover:bg-secondary/60")}
            >
              {base.name}
            </Link>
          ))}
        </div>
      )}

      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("recipes.pairing.title", { name: recipe.name })}
            </DialogTitle>
            <DialogDescription>
              {t("recipes.pairing.description")}
            </DialogDescription>
          </DialogHeader>
          {managing && <ManagePairings recipe={recipe} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Changes to what it goes with, put straight into the page's copy. */
function usePairingChanges(recipe: Recipe) {
  const queryClient = useQueryClient()
  return (pairings: RecipePairings) =>
    queryClient.setQueryData(pairingsQuery(recipe.id).queryKey, pairings)
}

/** What it goes with as it stands, and ways to add to it. */
function ManagePairings({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()
  const pairings = useQuery(pairingsQuery(recipe.id))
  const changed = usePairingChanges(recipe)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const rules = pairings.data?.pairings ?? []

  async function remove(pairingId: string) {
    setRemoving(pairingId)
    try {
      changed(
        await unwrap(
          api.DELETE("/api/recipes/{recipe}/pairings/{pairingId}", {
            params: { path: { recipe: recipe.id, pairingId } },
          })
        )
      )
    } catch (error) {
      failed(error)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      {rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rules.map((rule) => {
            const name =
              rule.kind === "tag"
                ? t("recipes.pairing.any", { tag: rule.tag })
                : rule.recipe.name
            return (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-3 text-sm text-secondary-foreground"
              >
                {name}
                <button
                  type="button"
                  aria-label={t("recipes.pairing.remove", { name })}
                  className="flex size-5 items-center justify-center rounded-full hover:bg-foreground/10"
                  disabled={removing === rule.id}
                  onClick={() => void remove(rule.id)}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <Tabs defaultValue="recipes">
        <TabsList className="w-full">
          <TabsTrigger value="recipes">
            {t("recipes.pairing.pickRecipes")}
          </TabsTrigger>
          <TabsTrigger value="tag">{t("recipes.pairing.useTag")}</TabsTrigger>
        </TabsList>
        <TabsContent value="recipes">
          <PickRecipes recipe={recipe} />
        </TabsContent>
        <TabsContent value="tag">
          <PickTag recipe={recipe} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Tags that usually mean "goes with something", offered first. */
const COMPANION =
  /sauce|side|dressing|salsa|dip|marinade|salad|bread|condiment/i

function useCompanionTags() {
  const tags = useQuery(tagsQuery)
  return {
    pending: tags.isPending,
    tags: [...(tags.data ?? [])].sort(
      (a, b) =>
        Number(COMPANION.test(b.name)) - Number(COMPANION.test(a.name)) ||
        b.recipes - a.recipes
    ),
  }
}

/** Recipes to pick, found by name on the server, a tag at a time. */
function PickRecipes({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()
  const pairings = useQuery(pairingsQuery(recipe.id))
  const changed = usePairingChanges(recipe)
  const { tags } = useCompanionTags()
  const [words, setWords] = React.useState("")
  const [find, setFind] = React.useState("")
  const [tag, setTag] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())
  const [adding, setAdding] = React.useState(false)

  // Looks a moment after typing stops, not on every key.
  React.useEffect(() => {
    const timer = setTimeout(() => setFind(words.trim()), 250)
    return () => clearTimeout(timer)
  }, [words])

  const found = useQuery({
    queryKey: ["recipes", "pick", find, tag],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes", {
          params: {
            query: {
              ...(find ? { q: find } : {}),
              ...(tag ? { tag: [tag] } : {}),
              sort: "name",
              limit: 50,
            },
          },
        })
      ),
  })

  const already = new Set(
    (pairings.data?.pairings ?? []).flatMap((rule) =>
      rule.kind === "recipe" ? [rule.recipe.id] : []
    )
  )
  const shown = (found.data?.recipes ?? []).filter(
    (option) => option.id !== recipe.id && !already.has(option.id)
  )

  async function add() {
    setAdding(true)
    try {
      changed(
        await unwrap(
          api.POST("/api/recipes/{recipe}/pairings", {
            params: { path: { recipe: recipe.id } },
            body: { recipes: [...picked] },
          })
        )
      )
      toast.success(t("recipes.pairing.added", { count: picked.size }))
      setPicked(new Set())
    } catch (error) {
      failed(error)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="grid gap-3 pt-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 8).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={tag === option.name}
              onClick={() => setTag(tag === option.name ? null : option.name)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                tag === option.name
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t("recipes.pairing.find")}
          aria-label={t("recipes.pairing.find")}
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
      </InputGroup>
      {found.isPending ? (
        <Skeleton className="h-32" />
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("recipes.pairing.noMatches")}
        </p>
      ) : (
        <ul className="grid max-h-64 grid-cols-1 divide-y overflow-x-hidden overflow-y-auto rounded-xl border">
          {shown.map((option) => {
            const on = picked.has(option.id)
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
                  onClick={() =>
                    setPicked((current) => {
                      const next = new Set(current)
                      if (on) next.delete(option.id)
                      else next.add(option.id)
                      return next
                    })
                  }
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      on && "border-primary bg-primary text-primary-foreground"
                    )}
                  >
                    {on && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {option.tags.length > 0 && (
                    <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                      {option.tags.slice(0, 2).join(", ")}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <Button disabled={picked.size === 0 || adding} onClick={() => void add()}>
        {adding && <Spinner data-icon="inline-start" />}
        {picked.size > 0
          ? t("recipes.pairing.addCount", { count: picked.size })
          : t("recipes.pairing.pickSome")}
      </Button>
    </div>
  )
}

/** A whole tag: every recipe with it, now and later. */
function PickTag({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()
  const pairings = useQuery(pairingsQuery(recipe.id))
  const changed = usePairingChanges(recipe)
  const { tags, pending } = useCompanionTags()
  const [adding, setAdding] = React.useState(false)
  const linked = new Set(
    (pairings.data?.pairings ?? []).flatMap((rule) =>
      rule.kind === "tag" ? [rule.tag.toLowerCase()] : []
    )
  )

  async function add(name: string) {
    setAdding(true)
    try {
      changed(
        await unwrap(
          api.POST("/api/recipes/{recipe}/pairings", {
            params: { path: { recipe: recipe.id } },
            body: { tag: name },
          })
        )
      )
      toast.success(
        t("recipes.pairing.tagAdded", { tag: name, name: recipe.name })
      )
    } catch (error) {
      failed(error)
    } finally {
      setAdding(false)
    }
  }

  if (pending) return <Skeleton className="mt-2 h-32" />
  if (tags.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t("recipes.pairing.noTags")}
      </p>
    )
  }
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-sm text-muted-foreground">
        {t("recipes.pairing.tagHint", { name: recipe.name })}
      </p>
      <ul className="grid max-h-64 grid-cols-1 divide-y overflow-x-hidden overflow-y-auto rounded-xl border">
        {tags.map((option) => {
          const on = linked.has(option.name.toLowerCase())
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={on || adding}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 disabled:opacity-60"
                onClick={() => void add(option.name)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {t("recipes.pairing.any", { tag: option.name })}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {on
                    ? t("recipes.pairing.tagLinked")
                    : t("recipes.count", { count: option.recipes })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
