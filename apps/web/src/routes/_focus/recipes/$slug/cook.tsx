import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { CookView } from "@/features/cook/cook-view"
import { tastesQuery } from "@/features/household/queries"
import { recipeQuery } from "@/features/recipes/queries"

type CookSearch = {
  /** How many times the recipe, from the servings on its page. */
  scale?: number
  /** A recipe it goes with, cooked with it. */
  with?: string
}

export const Route = createFileRoute("/_focus/recipes/$slug/cook")({
  validateSearch: (search: Record<string, unknown>): CookSearch => {
    const scale = Number(search.scale)
    return {
      ...(scale > 0 && scale <= 100 && scale !== 1 ? { scale } : {}),
      ...(typeof search.with === "string" && search.with
        ? { with: search.with }
        : {}),
    }
  },
  loaderDeps: ({ search }) => ({ with: search.with }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      // What's left out for the household's dislikes.
      context.queryClient.ensureQueryData(tastesQuery).catch(() => null),
      context.queryClient.ensureQueryData(recipeQuery(params.slug)),
      // A pairing that's gone just means cooking the recipe alone.
      deps.with
        ? context.queryClient
            .ensureQueryData(recipeQuery(deps.with))
            .catch(() => null)
        : null,
    ]),
  component: CookPage,
})

function CookPage() {
  const { slug } = Route.useParams()
  const { scale = 1, with: withSlug } = Route.useSearch()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  const { data: paired } = useQuery({
    ...recipeQuery(withSlug ?? ""),
    enabled: Boolean(withSlug),
  })
  const pairing = paired && paired.id !== recipe.id ? paired : undefined
  // Fresh for each recipe, pairing and scale, picking up where that was left.
  return (
    <CookView
      key={`${recipe.id}-${pairing?.id ?? ""}-${scale}`}
      recipe={recipe}
      paired={pairing}
      scale={scale}
    />
  )
}
