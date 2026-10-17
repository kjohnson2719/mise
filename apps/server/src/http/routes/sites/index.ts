import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import siteRoutes from "./[site]/index.ts"
import get from "./get.ts"
import post from "./post.ts"
import recipesRoutes from "./recipes/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  recipesRoutes(router, deps)
  siteRoutes(router, deps)
}
