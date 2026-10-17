import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import get from "./[index]/get.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
}
