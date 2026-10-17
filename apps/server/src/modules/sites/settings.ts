import { switchSetting } from "../../core/settings.ts"

export const SITES = {
  enabled: switchSetting({
    key: "sites.enabled",
    env: "MERRAN_RECIPE_SITES",
    description:
      "Read recipe sites' feeds in the background, for following sites and starter collections: the suggested sites and any a household follows, every few hours, as Merran and following robots.txt.",
    default: true,
  }),
}
