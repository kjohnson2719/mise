import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import jobIdRoutes from "./[jobId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  jobIdRoutes(router, deps)
}
