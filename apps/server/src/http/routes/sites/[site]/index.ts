import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import del from "./delete.ts"

export default (router: Router, deps: AppDeps) => {
  del(router, deps)
}
