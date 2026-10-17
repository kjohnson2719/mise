import type { AppDeps } from "../../../../../../../core/context.ts"
import type { Router } from "../../../../../../router.ts"
import startRoutes from "./start/index.ts"

export default (router: Router, deps: AppDeps) => {
  startRoutes(router, deps)
}
