import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import batchRoutes from "./batch/index.ts"
import bulkRoutes from "./bulk/index.ts"
import entryIdRoutes from "./[entryId]/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  batchRoutes(router, deps)
  bulkRoutes(router, deps)
  entryIdRoutes(router, deps)
}
