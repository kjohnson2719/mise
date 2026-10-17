import { secretSetting } from "../../core/settings.ts"

export const NUTRITION = {
  usdaKey: secretSetting({
    key: "nutrition.usdaKey",
    env: "MERRAN_USDA_KEY",
    description:
      "A key for USDA FoodData Central, free from api.data.gov, to work out recipes' nutrition from their ingredients. Without one, AI estimates it.",
  }),
}
