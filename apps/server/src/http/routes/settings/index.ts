import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import householdRoutes from "./household/index.ts"
import serverRoutes from "./server/index.ts"

export default (router: Router, deps: AppDeps) => {
  householdRoutes(router, deps)
  serverRoutes(router, deps)
}
