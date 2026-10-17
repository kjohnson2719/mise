import type { AppDeps } from "../../core/context.ts"
import type { Router } from "../router.ts"
import assistantRoutes from "./assistant/index.ts"
import authRoutes from "./auth/index.ts"
import capabilitiesRoutes from "./capabilities/index.ts"
import collectionsRoutes from "./collections/index.ts"
import discoverRoutes from "./discover/index.ts"
import eventsRoutes from "./events/index.ts"
import healthRoutes from "./health/index.ts"
import householdsRoutes from "./households/index.ts"
import listRoutes from "./list/index.ts"
import pantryRoutes from "./pantry/index.ts"
import planRoutes from "./plan/index.ts"
import proposalsRoutes from "./proposals/index.ts"
import recipesRoutes from "./recipes/index.ts"
import settingsRoutes from "./settings/index.ts"
import shareRoutes from "./share/index.ts"
import sitesRoutes from "./sites/index.ts"
import storesRoutes from "./stores/index.ts"
import telemetryRoutes from "./telemetry/index.ts"
import voiceRoutes from "./voice/index.ts"

/**
 * Every route under /api. Each part of a route's path is a folder, and
 * its methods are files in it: GET /api/recipes is recipes/get.ts. Index
 * files only register their folder's routes and its folders.
 */
export default (router: Router, deps: AppDeps) => {
  assistantRoutes(router, deps)
  authRoutes(router, deps)
  capabilitiesRoutes(router, deps)
  collectionsRoutes(router, deps)
  discoverRoutes(router, deps)
  eventsRoutes(router, deps)
  healthRoutes(router, deps)
  householdsRoutes(router, deps)
  listRoutes(router, deps)
  pantryRoutes(router, deps)
  planRoutes(router, deps)
  proposalsRoutes(router, deps)
  recipesRoutes(router, deps)
  settingsRoutes(router, deps)
  shareRoutes(router, deps)
  sitesRoutes(router, deps)
  storesRoutes(router, deps)
  telemetryRoutes(router, deps)
  voiceRoutes(router, deps)
}
