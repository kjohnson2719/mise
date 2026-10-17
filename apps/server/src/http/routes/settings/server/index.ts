import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import aiRoutes from "./ai/index.ts"
import get from "./get.ts"
import jobsRoutes from "./jobs/index.ts"
import krogerRoutes from "./kroger/index.ts"
import nutritionRoutes from "./nutrition/index.ts"
import patch from "./patch.ts"
import updatesRoutes from "./updates/index.ts"
import voiceRoutes from "./voice/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
  aiRoutes(router, deps)
  jobsRoutes(router, deps)
  krogerRoutes(router, deps)
  nutritionRoutes(router, deps)
  updatesRoutes(router, deps)
  voiceRoutes(router, deps)
}
