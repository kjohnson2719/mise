import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"

export default (router: Router, deps: AppDeps) => {
  remove(router, deps)
}
