import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import patch from "./patch.ts"

export default (router: Router, deps: AppDeps) => {
  remove(router, deps)
  patch(router, deps)
}
