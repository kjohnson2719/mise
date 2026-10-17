import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import autoplanRoutes from "./autoplan/index.ts"
import clearRoutes from "./clear/index.ts"
import entriesRoutes from "./entries/index.ts"
import get from "./get.ts"
import nextRoutes from "./next/index.ts"
import repeatRoutes from "./repeat/index.ts"
import restoreRoutes from "./restore/index.ts"
import suggestRoutes from "./suggest/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  autoplanRoutes(router, deps)
  nextRoutes(router, deps)
  entriesRoutes(router, deps)
  repeatRoutes(router, deps)
  clearRoutes(router, deps)
  restoreRoutes(router, deps)
  suggestRoutes(router, deps)
}
