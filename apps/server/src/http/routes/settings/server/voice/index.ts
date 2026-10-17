import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import previewRoutes from "./preview/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  previewRoutes(router, deps)
}
