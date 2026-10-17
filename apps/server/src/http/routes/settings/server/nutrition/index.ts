import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import test from "./test/post.ts"

export default (router: Router, deps: AppDeps) => {
  test(router, deps)
}
