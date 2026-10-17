import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import remove from "./delete.ts"
import bulkRoutes from "./bulk/index.ts"
import recipeIdRoutes from "./[recipeId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  remove(router, deps)
  // Before {recipeId}, so "bulk" isn't taken for one.
  bulkRoutes(router, deps)
  recipeIdRoutes(router, deps)
}
