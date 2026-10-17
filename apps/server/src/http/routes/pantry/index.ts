import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import clearRoutes from "./clear/index.ts"
import itemsRoutes from "./items/index.ts"
import receiptsRoutes from "./receipts/index.ts"
import restoreRoutes from "./restore/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  clearRoutes(router, deps)
  itemsRoutes(router, deps)
  receiptsRoutes(router, deps)
  restoreRoutes(router, deps)
}
