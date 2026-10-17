import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import installIdRoutes from "./install-id/index.ts"
import reportRoutes from "./report/index.ts"

export default (router: Router, deps: AppDeps) => {
  installIdRoutes(router, deps)
  reportRoutes(router, deps)
}
