import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import patch from "./patch.ts"
import apartRoutes from "./apart/index.ts"
import namesRoutes from "./names/index.ts"
import sameAsRoutes from "./same-as/index.ts"

export default (router: Router, deps: AppDeps) => {
  patch(router, deps)
  remove(router, deps)
  apartRoutes(router, deps)
  namesRoutes(router, deps)
  sameAsRoutes(router, deps)
}
