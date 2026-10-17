import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import basketRoutes from "./basket/index.ts"
import foundRoutes from "./found/index.ts"
import productsRoutes from "./products/index.ts"
import sentRoutes from "./sent/index.ts"

export default (router: Router, deps: AppDeps) => {
  basketRoutes(router, deps)
  foundRoutes(router, deps)
  productsRoutes(router, deps)
  sentRoutes(router, deps)
}
