import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import cancelRoutes from "./cancel/index.ts"
import retryRoutes from "./retry/index.ts"

export default (router: Router, deps: AppDeps) => {
  cancelRoutes(router, deps)
  retryRoutes(router, deps)
}
