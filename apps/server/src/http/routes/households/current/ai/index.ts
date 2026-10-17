import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import put from "./put.ts"
import keysRoutes from "./keys/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  put(router, deps)
  keysRoutes(router, deps)
}
