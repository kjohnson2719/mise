import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import currentRoutes from "./current/index.ts"
import keyIdRoutes from "./[keyId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  // Fixed paths first, so they aren't taken for {keyId}.
  currentRoutes(router, deps)
  keyIdRoutes(router, deps)
}
