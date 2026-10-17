import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import weeklyIdRoutes from "./[weeklyId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  weeklyIdRoutes(router, deps)
}
