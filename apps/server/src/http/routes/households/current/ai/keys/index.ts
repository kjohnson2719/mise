import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import post from "./post.ts"
import keyRoutes from "./[keyId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  keyRoutes(router, deps)
}
