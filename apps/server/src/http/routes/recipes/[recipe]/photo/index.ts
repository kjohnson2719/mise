import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import get from "./get.ts"
import makeRoutes from "./make/index.ts"
import put from "./put.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  put(router, deps)
  remove(router, deps)
  makeRoutes(router, deps)
}
