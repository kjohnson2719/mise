import { forgetKrogerTokens } from "../../services/stores/kroger.ts"
import type { Settings } from "../../services/settings/settings.ts"
import type { Module } from "../module.ts"
import { STORE_SETTINGS } from "./settings.ts"

/**
 * Stores Merran works with beyond a link: Kroger (Fry's, Ralphs...), on
 * with the server admin's Kroger developer app, and Walmart through the
 * browser extension, experimental and on only when the admin says.
 * Link-only stores (a search address) need nothing and are always there.
 */
export const stores: Module = {
  id: "stores",
  settings: Object.values(STORE_SETTINGS),

  async capabilities({ settings }) {
    const { kroger, walmart } = await which(settings)
    return [
      ...(kroger ? ["stores.kroger"] : []),
      ...(walmart ? ["stores.walmart"] : []),
    ]
  },

  async status({ settings }) {
    const { kroger, walmart } = await which(settings)
    return kroger || walmart ? { on: true } : { on: false, needs: "krogerApp" }
  },

  /** A new client ID or secret: the old app's tokens are no good. */
  async apply() {
    forgetKrogerTokens()
  },
}

/** Which stores the server has on: Kroger with an app, Walmart when switched on. */
async function which(settings: Settings) {
  const [id, secret, walmart] = await Promise.all([
    settings.server(STORE_SETTINGS.krogerClientId),
    settings.server(STORE_SETTINGS.krogerClientSecret),
    settings.server(STORE_SETTINGS.walmart),
  ])
  return { kroger: Boolean(id && secret), walmart: Boolean(walmart) }
}
