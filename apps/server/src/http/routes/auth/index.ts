import type { AppDeps } from "../../../core/context.ts"
import { mountBetterAuth } from "./better-auth.ts"
import type { Router } from "../../router.ts"
import apiKeysRoutes from "./api-keys/index.ts"
import joinRoutes from "./join/index.ts"
import meRoutes from "./me/index.ts"
import setupRoutes from "./setup/index.ts"

export default (router: Router, deps: AppDeps) => {
  apiKeysRoutes(router, deps)
  joinRoutes(router, deps)
  meRoutes(router, deps)
  setupRoutes(router, deps)
  // Better Auth's own endpoints, the ones Merran uses (see better-auth.ts).
  mountBetterAuth(router, deps.auth)
}
