import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import keysRoutes from "./keys/index.ts"
import policyRoutes from "./policy/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  keysRoutes(router, deps)
  policyRoutes(router, deps)
}
