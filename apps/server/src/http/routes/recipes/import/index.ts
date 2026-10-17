import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import linksRoutes from "./links/index.ts"
import pageRoutes from "./page/index.ts"
import photosRoutes from "./photos/index.ts"
import post from "./post.ts"
import textRoutes from "./text/index.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  linksRoutes(router, deps)
  pageRoutes(router, deps)
  textRoutes(router, deps)
  photosRoutes(router, deps)
}
