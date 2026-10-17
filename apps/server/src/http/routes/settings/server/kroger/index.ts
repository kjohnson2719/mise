import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import testRoutes from "./test/index.ts"

export default (router: Router, deps: AppDeps) => {
  testRoutes(router, deps)
}
