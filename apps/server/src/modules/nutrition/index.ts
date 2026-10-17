import type { Module } from "../module.ts"
import { NUTRITION } from "./settings.ts"

/**
 * Nutrition worked out from USDA FoodData Central: on with a USDA key.
 * Without one, households with AI still get an estimate (the AI module's).
 */
export const nutrition: Module = {
  id: "nutrition",
  settings: Object.values(NUTRITION),
  capabilities: ["nutrition"],

  async status({ settings }) {
    return (await settings.server(NUTRITION.usdaKey))
      ? { on: true }
      : { on: false, needs: "key" }
  },
}
