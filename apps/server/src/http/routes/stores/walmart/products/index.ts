import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import itemIdRoutes from "./[itemId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  itemIdRoutes(router, deps)
}
