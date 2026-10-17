import type { Module } from "../module.ts"
import { PHOTOS } from "./settings.ts"

/**
 * AI photos: a photo made for recipes without one, in the household's
 * style. Off until the server admin turns it on, as it spends AI credit;
 * each household then needs an OpenAI or Google key (see ai-photos.ts).
 */
export const photos: Module = {
  id: "photos",
  settings: Object.values(PHOTOS),
  capabilities: ["photos"],

  async status({ settings }) {
    return (await settings.server(PHOTOS.enabled))
      ? { on: true }
      : { on: false, needs: "off" }
  },
}
