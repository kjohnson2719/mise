import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import addRoutes from "./add/index.ts"
import remove from "./delete.ts"
import filesRoutes from "./files/index.ts"
import get from "./get.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  remove(router, deps)
  addRoutes(router, deps)
  filesRoutes(router, deps)
}
