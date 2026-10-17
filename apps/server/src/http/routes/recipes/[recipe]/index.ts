import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import cookNotesRoutes from "./cook-notes/index.ts"
import remove from "./delete.ts"
import dietsRoutes from "./diets/index.ts"
import get from "./get.ts"
import nutritionRoutes from "./nutrition/index.ts"
import madeRoutes from "./made/index.ts"
import needsRoutes from "./needs/index.ts"
import pairingsRoutes from "./pairings/index.ts"
import photoRoutes from "./photo/index.ts"
import put from "./put.ts"
import ratingRoutes from "./rating/index.ts"
import standInsRoutes from "./stand-ins/index.ts"
import swapRoutes from "./swap/index.ts"
import tidyRoutes from "./tidy/index.ts"
import versionsRoutes from "./versions/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  nutritionRoutes(router, deps)
  put(router, deps)
  remove(router, deps)
  cookNotesRoutes(router, deps)
  dietsRoutes(router, deps)
  madeRoutes(router, deps)
  needsRoutes(router, deps)
  pairingsRoutes(router, deps)
  photoRoutes(router, deps)
  ratingRoutes(router, deps)
  standInsRoutes(router, deps)
  swapRoutes(router, deps)
  tidyRoutes(router, deps)
  versionsRoutes(router, deps)
}
