import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import checkRoutes from "./check/index.ts"
import get from "./get.ts"
import importIdRoutes from "./[importId]/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  checkRoutes(router, deps)
  importIdRoutes(router, deps)
}
