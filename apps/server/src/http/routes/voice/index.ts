import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import speakRoutes from "./speak/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  speakRoutes(router, deps)
}
