import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import patch from "./patch.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
}
