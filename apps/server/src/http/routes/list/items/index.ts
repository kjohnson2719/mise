import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import post from "./post.ts"
import bulkRoutes from "./bulk/index.ts"
import itemIdRoutes from "./[itemId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  bulkRoutes(router, deps)
  itemIdRoutes(router, deps)
}
