import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { recipeQuery } from "@/features/recipes/queries"
import { RecipeEditor } from "@/features/recipes/recipe-editor"

export const Route = createFileRoute("/_app/recipes/$slug/edit")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.slug)),
  component: EditRecipe,
})

function EditRecipe() {
  const { slug } = Route.useParams()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  return <RecipeEditor key={recipe.id} recipe={recipe} />
}
