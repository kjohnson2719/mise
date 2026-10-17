import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import bulkRoutes from "./bulk/index.ts"
import deletedRoutes from "./deleted/index.ts"
import importRoutes from "./import/index.ts"
import nutritionRoutes from "./nutrition/index.ts"
import photosRoutes from "./photos/index.ts"
import tagsRoutes from "./tags/index.ts"
import tidyRoutes from "./tidy/index.ts"
import recipeRoutes from "./[recipe]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  // Fixed paths first, so they aren't taken for {recipe}.
  bulkRoutes(router, deps)
  deletedRoutes(router, deps)
  importRoutes(router, deps)
  nutritionRoutes(router, deps)
  photosRoutes(router, deps)
  tagsRoutes(router, deps)
  tidyRoutes(router, deps)
  recipeRoutes(router, deps)
}
