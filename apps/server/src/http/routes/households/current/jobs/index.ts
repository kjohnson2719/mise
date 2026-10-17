import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import jobIdRoutes from "./[jobId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  jobIdRoutes(router, deps)
}
