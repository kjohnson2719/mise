import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import aliasIdRoutes from "./[aliasId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  aliasIdRoutes(router, deps)
}
