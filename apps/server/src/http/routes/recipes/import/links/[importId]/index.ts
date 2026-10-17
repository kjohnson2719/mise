import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import get from "./get.ts"
import stopRoutes from "./stop/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  stopRoutes(router, deps)
}
