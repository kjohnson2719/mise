import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import restoreRoutes from "./restore/index.ts"

export default (router: Router, deps: AppDeps) => {
  restoreRoutes(router, deps)
}
