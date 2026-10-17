import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import checkRoutes from "./check/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  checkRoutes(router, deps)
  post(router, deps)
}
