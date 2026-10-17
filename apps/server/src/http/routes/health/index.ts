import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import readyRoutes from "./ready/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  readyRoutes(router, deps)
}
