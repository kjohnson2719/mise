import { AiKey } from "../../database/entities/index.ts"
import type { Module } from "../module.ts"
import { AI, ENV_KEYS } from "./settings.ts"

/**
 * AI: the assistant, AI import, tidy up and the rest. On when there's a key
 * anywhere, the server's or a household's; which households can use which
 * is the AI policy's (see services/ai).
 */
export const ai: Module = {
  id: "ai",
  settings: Object.values(AI),
  capabilities: ["ai"],

  async status({ settings, database }) {
    for (const setting of Object.values(ENV_KEYS)) {
      if (await settings.server(setting)) return { on: true }
    }
    const keys = await database.em.fork().count(AiKey, {})
    return keys > 0 ? { on: true } : { on: false, needs: "key" }
  },
}
