import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import tagIdRoutes from "./[tagId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  tagIdRoutes(router, deps)
}
