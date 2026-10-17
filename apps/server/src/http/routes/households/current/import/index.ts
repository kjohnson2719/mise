import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import filesRoutes from "./files/index.ts"
import mealieRoutes from "./mealie/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  filesRoutes(router, deps)
  mealieRoutes(router, deps)
}
