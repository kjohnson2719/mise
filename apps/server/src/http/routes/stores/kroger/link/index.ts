import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  remove(router, deps)
}
