import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import basketRoutes from "./basket/index.ts"
import callbackRoutes from "./callback/index.ts"
import linkRoutes from "./link/index.ts"
import locationsRoutes from "./locations/index.ts"
import pricesRoutes from "./prices/index.ts"
import productsRoutes from "./products/index.ts"
import put from "./put.ts"
import searchRoutes from "./search/index.ts"
import sendRoutes from "./send/index.ts"

export default (router: Router, deps: AppDeps) => {
  put(router, deps)
  locationsRoutes(router, deps)
  linkRoutes(router, deps)
  callbackRoutes(router, deps)
  basketRoutes(router, deps)
  searchRoutes(router, deps)
  productsRoutes(router, deps)
  sendRoutes(router, deps)
  pricesRoutes(router, deps)
}
