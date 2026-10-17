import { createFileRoute } from "@tanstack/react-router"

import { RecipeEditor } from "@/features/recipes/recipe-editor"

export const Route = createFileRoute("/_app/recipes/new")({
  component: () => <RecipeEditor />,
})
