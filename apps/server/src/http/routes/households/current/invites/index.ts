import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import inviteIdRoutes from "./[inviteId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  inviteIdRoutes(router, deps)
}
