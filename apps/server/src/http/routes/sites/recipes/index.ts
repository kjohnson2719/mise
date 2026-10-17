import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import recipeRoutes from "./[recipe]/index.ts"
import get from "./get.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  recipeRoutes(router, deps)
}
