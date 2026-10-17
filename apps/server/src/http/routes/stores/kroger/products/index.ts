import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import itemRoutes from "./[itemId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  itemRoutes(router, deps)
}
