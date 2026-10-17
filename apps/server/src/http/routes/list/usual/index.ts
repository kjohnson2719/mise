import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import addRoutes from "./add/index.ts"
import skipRoutes from "./skip/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  addRoutes(router, deps)
  skipRoutes(router, deps)
}
