import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import exportRoutes from "./export/index.ts"
import get from "./get.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  exportRoutes(router, deps)
}
