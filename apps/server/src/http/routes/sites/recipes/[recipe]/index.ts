import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import photoRoutes from "./photo/index.ts"

export default (router: Router, deps: AppDeps) => {
  photoRoutes(router, deps)
}
