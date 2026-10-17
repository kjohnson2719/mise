import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import get from "./get.ts"
import messagesRoutes from "./messages/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  remove(router, deps)
  messagesRoutes(router, deps)
}
