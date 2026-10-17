import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import clearRoutes from "./clear/index.ts"
import everyWeekRoutes from "./every-week/index.ts"
import foodsRoutes from "./foods/index.ts"
import fromPlanRoutes from "./from-plan/index.ts"
import itemsRoutes from "./items/index.ts"
import listsRoutes from "./lists/index.ts"
import putAwayRoutes from "./put-away/index.ts"
import restoreRoutes from "./restore/index.ts"
import usualRoutes from "./usual/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  clearRoutes(router, deps)
  everyWeekRoutes(router, deps)
  foodsRoutes(router, deps)
  fromPlanRoutes(router, deps)
  itemsRoutes(router, deps)
  listsRoutes(router, deps)
  putAwayRoutes(router, deps)
  restoreRoutes(router, deps)
  usualRoutes(router, deps)
}
