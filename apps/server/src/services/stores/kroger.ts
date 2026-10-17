import { searchWords, type StoreProduct as Product } from "@merran/shared"
import { AppError } from "../../core/errors.ts"
import type { StoreLocation } from "../../database/entities/index.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import type { Settings } from "../settings/settings.ts"

// Kroger's public API (developer.kroger.com): its stores, their products
// with prices and sales, and adding to a person's cart. One developer app
// for the server; each household links one account, whose cart it sends
// to. Kroger's API can only add to a cart, not read it or check out.

export const KROGER_API = "https://api.kroger.com/v1"

/** What a person's link lets Merran do: add to their cart. */
const USER_SCOPES = "cart.basic:write profile.compact product.compact"

export type KrogerApp = { clientId: string; clientSecret: string }

/** The server admin's Kroger developer app, or null. */
export async function krogerApp(settings: Settings): Promise<KrogerApp | null> {
  const [clientId, clientSecret] = await Promise.all([
    settings.server(STORE_SETTINGS.krogerClientId),
    settings.server(STORE_SETTINGS.krogerClientSecret),
  ])
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Kroger's chains, by its code: their names and sites. */
const BANNERS: Record<string, { name: string; domain: string }> = {
  KROGER: { name: "Kroger", domain: "kroger.com" },
  FRYS: { name: "Fry's", domain: "frysfood.com" },
  RALPHS: { name: "Ralphs", domain: "ralphs.com" },
  KINGSOOPERS: { name: "King Soopers", domain: "kingsoopers.com" },
  SMITHS: { name: "Smith's", domain: "smithsfoodanddrug.com" },
  FREDMEYER: { name: "Fred Meyer", domain: "fredmeyer.com" },
  QFC: { name: "QFC", domain: "qfc.com" },
  HARRISTEETER: { name: "Harris Teeter", domain: "harristeeter.com" },
  DILLONS: { name: "Dillons", domain: "dillons.com" },
  MARIANOS: { name: "Mariano's", domain: "marianos.com" },
  PICKNSAVE: { name: "Pick 'n Save", domain: "picknsave.com" },
  CITYMARKET: { name: "City Market", domain: "citymarket.com" },
  BAKERS: { name: "Baker's", domain: "bakersplus.com" },
  GERBES: { name: "Gerbes", domain: "gerbes.com" },
  JAYC: { name: "Jay C", domain: "jaycfoods.com" },
  PAYLESS: { name: "Pay Less", domain: "pay-less.com" },
  METROMARKET: { name: "Metro Market", domain: "metromarket.net" },
  FOODSCO: { name: "Foods Co", domain: "foodsco.net" },
  FOOD4LESS: { name: "Food 4 Less", domain: "food4less.com" },
  RULER: { name: "Ruler", domain: "rulerfoods.com" },
}

export function bannerOf(chain: string | null | undefined) {
  return BANNERS[(chain ?? "").toUpperCase()] ?? BANNERS.KROGER!
}

type TokenAnswer = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

/** Thrown when a person's link no longer works: they link again. */
export class KrogerSignInError extends AppError {
  constructor() {
    super(
      "conflict",
      "kroger_relink",
      "Kroger stopped taking the linked account. Link it again in Settings, Household, Stores."
    )
  }
}

const refused = () =>
  new AppError(
    "unprocessable",
    "kroger_app_refused",
    "Kroger didn't accept the developer app's client ID and secret. Check them in Settings, This server."
  )

const unreachable = () =>
  new AppError("upstream", "kroger_unreachable", "Kroger didn't answer.")

function json<T>(body: Buffer): T | null {
  try {
    return JSON.parse(body.toString("utf8")) as T
  } catch {
    return null
  }
}

async function tokenCall(
  fetcher: Fetcher,
  app: KrogerApp,
  form: Record<string, string>
) {
  let answer
  try {
    answer = await fetcher(`${KROGER_API}/connect/oauth2/token`, {
      form,
      accept: "application/json",
      keepErrors: true,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
      },
    })
  } catch {
    throw unreachable()
  }
  const body = json<TokenAnswer>(answer.body) ?? {}
  return { status: answer.status, body }
}

/** App tokens, kept until a minute before they run out. */
const appTokens = new Map<string, { token: string; until: number }>()

/** A token for the app itself: enough to look at stores and products. */
export async function appToken(fetcher: Fetcher, app: KrogerApp) {
  const kept = appTokens.get(app.clientId)
  if (kept && kept.until > Date.now()) return kept.token
  const { status, body } = await tokenCall(fetcher, app, {
    grant_type: "client_credentials",
    scope: "product.compact",
  })
  if (status === 401 || body.error === "invalid_client") throw refused()
  if (!body.access_token) throw unreachable()
  appTokens.set(app.clientId, {
    token: body.access_token,
    until: Date.now() + ((body.expires_in ?? 1800) - 60) * 1000,
  })
  return body.access_token
}

/** Forgets the app's tokens, as when its client ID or secret change. */
export function forgetKrogerTokens() {
  appTokens.clear()
}

/** Where a person goes to let Merran add to their Kroger cart. */
export function authorizeUrl(
  app: KrogerApp,
  options: { redirectUri: string; state: string; challenge: string }
) {
  const url = new URL(`${KROGER_API}/connect/oauth2/authorize`)
  url.search = new URLSearchParams({
    scope: USER_SCOPES,
    response_type: "code",
    client_id: app.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: "S256",
  }).toString()
  return url.toString()
}

export type UserTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

function userTokens(body: TokenAnswer, refreshToken?: string): UserTokens {
  if (!body.access_token) throw new KrogerSignInError()
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken ?? "",
    expiresAt: new Date(Date.now() + ((body.expires_in ?? 1800) - 60) * 1000),
  }
}

/** The tokens for a person who just let Merran in. */
export async function exchangeCode(
  fetcher: Fetcher,
  app: KrogerApp,
  options: { code: string; verifier: string; redirectUri: string }
) {
  const { status, body } = await tokenCall(fetcher, app, {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.verifier,
  })
  if (status === 401 || body.error === "invalid_client") throw refused()
  return userTokens(body)
}

/** Fresh tokens for a linked account; KrogerSignInError when it's gone. */
export async function refreshTokens(
  fetcher: Fetcher,
  app: KrogerApp,
  refreshToken: string
) {
  const { status, body } = await tokenCall(fetcher, app, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  if (status === 401 && body.error === "invalid_client") throw refused()
  return userTokens(body, refreshToken)
}

/** A call to Kroger's API with a token. */
async function call<T>(
  fetcher: Fetcher,
  token: string,
  path: string,
  options: { method?: "PUT"; json?: unknown } = {}
) {
  let answer
  try {
    answer = await fetcher(`${KROGER_API}${path}`, {
      accept: "application/json",
      keepErrors: true,
      headers: { authorization: `Bearer ${token}` },
      ...(options.json === undefined
        ? {}
        : { json: options.json, method: options.method }),
    })
  } catch {
    throw unreachable()
  }
  if (answer.status === 401) throw new KrogerSignInError()
  // A store or product by id that Kroger doesn't have.
  if (answer.status === 404) return null
  if (answer.status === 429) {
    throw new AppError(
      "rate_limited",
      "kroger_limit",
      "Kroger's daily limit for the app is used up. It's back tomorrow."
    )
  }
  if (answer.status >= 400) {
    throw new AppError(
      "upstream",
      "kroger_error",
      `Kroger answered with an error (${answer.status}).`
    )
  }
  return answer.status === 204 ? null : json<T>(answer.body)
}

type KrogerLocationAnswer = {
  locationId?: string
  chain?: string
  name?: string
  address?: {
    addressLine1?: string
    city?: string
    state?: string
    zipCode?: string
  }
}

function toLocation(found: KrogerLocationAnswer): StoreLocation | null {
  if (!found.locationId) return null
  const banner = bannerOf(found.chain)
  const address = found.address ?? {}
  return {
    locationId: found.locationId,
    name: found.name ?? banner.name,
    banner: banner.name,
    domain: banner.domain,
    address: [address.addressLine1, address.city, address.state]
      .filter(Boolean)
      .join(", "),
  }
}

/** Kroger's stores near a ZIP code. */
export async function locationsNear(
  fetcher: Fetcher,
  app: KrogerApp,
  zip: string
) {
  const token = await appToken(fetcher, app)
  const answer = await call<{ data?: KrogerLocationAnswer[] }>(
    fetcher,
    token,
    `/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=12`
  )
  return (answer?.data ?? []).map(toLocation).filter((found) => found !== null)
}

/** One of Kroger's stores. */
export async function locationById(
  fetcher: Fetcher,
  app: KrogerApp,
  locationId: string
) {
  const token = await appToken(fetcher, app)
  const answer = await call<{ data?: KrogerLocationAnswer }>(
    fetcher,
    token,
    `/locations/${encodeURIComponent(locationId)}`
  )
  const found = answer?.data ? toLocation(answer.data) : null
  if (!found) {
    throw new AppError(
      "not_found",
      "kroger_store_not_found",
      "There's no such Kroger store."
    )
  }
  return found
}

type KrogerProductAnswer = {
  productId?: string
  upc?: string
  brand?: string
  description?: string
  /** Kroger's departments for it: "Canned & Packaged", "Beauty". */
  categories?: string[]
  productPageURI?: string
  aisleLocations?: { description?: string; number?: string }[]
  images?: {
    perspective?: string
    sizes?: { size?: string; url?: string }[]
  }[]
  items?: {
    size?: string
    price?: {
      regular?: number
      promo?: number
      expirationDate?: { value?: string }
    }
    inventory?: { stockLevel?: string }
  }[]
}

const cents = (dollars: number | undefined) =>
  dollars && dollars > 0 ? Math.round(dollars * 100) : null

/** A Kroger product as Merran keeps it. */
export function toProduct(
  found: KrogerProductAnswer,
  domain: string
): Product | null {
  if (!found.productId || !found.description) return null
  const item = found.items?.[0]
  const regular = cents(item?.price?.regular)
  const promo = cents(item?.price?.promo)
  const onSale = promo !== null && regular !== null && promo < regular
  const front =
    found.images?.find((image) => image.perspective === "front") ??
    found.images?.[0]
  const image =
    front?.sizes?.find((size) => size.size === "medium")?.url ??
    front?.sizes?.[0]?.url ??
    null
  return {
    id: found.productId,
    upc: found.upc ?? null,
    name: found.description,
    brand: found.brand ?? null,
    size: item?.size ?? null,
    image,
    price: regular ?? promo,
    salePrice: onSale ? promo : null,
    saleEnds: onSale
      ? (item?.price?.expirationDate?.value?.slice(0, 10) ?? null)
      : null,
    currency: "USD",
    aisle: found.aisleLocations?.[0]?.description ?? null,
    inStock: item?.inventory?.stockLevel !== "TEMPORARILY_OUT_OF_STOCK",
    url: found.productPageURI
      ? `https://www.${domain}${found.productPageURI}`
      : null,
  }
}

/** Kroger's departments that aren't food, whatever the name says. */
const NOT_FOOD =
  /\b(beauty|personal care|health|pharmacy|household|cleaning|laundry|paper|pet|baby|kitchen|home|electronics|office|school|party|toys?|apparel|clothing|automotive|garden|outdoor|hardware|tobacco|floral|seasonal décor)\b/i

/**
 * Something to eat or drink: not a lipstick called "Tomato Girl" found by
 * a search for tomatoes. A product without departments counts as food.
 */
function isFood(found: KrogerProductAnswer) {
  const categories = found.categories ?? []
  return (
    categories.length === 0 ||
    categories.some((category) => !NOT_FOOD.test(category))
  )
}

/** Searches a store's products for some words. */
export async function searchProducts(
  fetcher: Fetcher,
  app: KrogerApp,
  options: { term: string; location: StoreLocation; limit?: number }
) {
  // What the store calls it: "thickened cream" is heavy cream.
  const term = searchWords(options.term)
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
  if (term.length < 3) return []
  const token = await appToken(fetcher, app)
  const query = new URLSearchParams({
    "filter.term": term,
    "filter.locationId": options.location.locationId,
    "filter.limit": String(options.limit ?? 8),
  })
  const answer = await call<{ data?: KrogerProductAnswer[] }>(
    fetcher,
    token,
    `/products?${query}`
  )
  return (answer?.data ?? [])
    .filter(isFood)
    .map((found) => toProduct(found, options.location.domain))
    .filter((found) => found !== null)
}

/** Products by their ids, at a store: their prices today. */
export async function productsById(
  fetcher: Fetcher,
  app: KrogerApp,
  options: { ids: string[]; location: StoreLocation }
) {
  const token = await appToken(fetcher, app)
  const products: Product[] = []
  for (let i = 0; i < options.ids.length; i += 50) {
    const query = new URLSearchParams({
      "filter.productId": options.ids.slice(i, i + 50).join(","),
      "filter.locationId": options.location.locationId,
    })
    const answer = await call<{ data?: KrogerProductAnswer[] }>(
      fetcher,
      token,
      `/products?${query}`
    )
    for (const found of answer?.data ?? []) {
      if (!isFood(found)) continue
      const product = toProduct(found, options.location.domain)
      if (product) products.push(product)
    }
  }
  return products
}

/** Adds products to the linked account's cart, by barcode. */
export async function addToCart(
  fetcher: Fetcher,
  accessToken: string,
  items: { upc: string; quantity: number; modality: "PICKUP" | "DELIVERY" }[]
) {
  for (let i = 0; i < items.length; i += 25) {
    await call(fetcher, accessToken, "/cart/add", {
      method: "PUT",
      json: { items: items.slice(i, i + 25) },
    })
  }
}
