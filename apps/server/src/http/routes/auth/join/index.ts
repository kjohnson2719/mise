import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import tokenRoutes from "./[token]/index.ts"

export default (router: Router, deps: AppDeps) => {
  tokenRoutes(router, deps)
}
