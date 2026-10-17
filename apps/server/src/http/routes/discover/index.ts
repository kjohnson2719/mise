import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import discoveryIdRoutes from "./[discoveryId]/index.ts"
import get from "./get.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  discoveryIdRoutes(router, deps)
}
