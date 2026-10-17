import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import costsRoutes from "./costs/index.ts"
import dealsRoutes from "./deals/index.ts"
import get from "./get.ts"
import krogerRoutes from "./kroger/index.ts"
import listPricesRoutes from "./list-prices/index.ts"
import walmartRoutes from "./walmart/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  dealsRoutes(router, deps)
  costsRoutes(router, deps)
  listPricesRoutes(router, deps)
  krogerRoutes(router, deps)
  walmartRoutes(router, deps)
}
