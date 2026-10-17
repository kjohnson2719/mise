import { SALE_LEANS, STORES_BY_KEY } from "@merran/shared"
import { z } from "zod"
import {
  choiceSetting,
  listSetting,
  numberSetting,
  secretSetting,
  switchSetting,
  textSetting,
} from "../../core/settings.ts"

export const STORE_SETTINGS = {
  krogerClientId: textSetting({
    key: "stores.krogerClientId",
    env: "MERRAN_KROGER_CLIENT_ID",
    description:
      "Your Kroger developer app's client ID, from developer.kroger.com: for Kroger's stores (Fry's, Ralphs, King Soopers...), their products, prices and sales, and sending a list to the cart.",
  }),
  krogerClientSecret: secretSetting({
    key: "stores.krogerClientSecret",
    env: "MERRAN_KROGER_CLIENT_SECRET",
    description: "Your Kroger developer app's client secret.",
  }),
  walmart: switchSetting({
    key: "stores.walmart",
    env: "MERRAN_WALMART",
    description:
      "Experimental: Walmart through Merran's browser extension, in each person's own Walmart tab. It finds each thing on the list, Merran picks a product, and it fills their Walmart cart. It stops at Walmart's check that it's a person and asks them, and it may need fixing whenever Walmart changes its site.",
    default: false,
  }),
  yours: listSetting<string[]>({
    key: "stores.yours",
    level: "household",
    item: z
      .string()
      .refine(
        (key) => STORES_BY_KEY.has(key),
        "Merran doesn't know that store."
      ),
    description:
      'The stores the household shops at, by key ("costco", "target"), for Find on the list. Its Kroger store, and Walmart when the server has it on, count without being here.',
    default: [],
  }),
  leanOnSales: choiceSetting({
    key: "stores.leanOnSales",
    level: "household",
    choices: SALE_LEANS,
    description:
      "How much Fill the week and the weekly autoplan lean on what's on sale at the household's store: off, some, or lots. Only real deals count, not sales barely off the usual price.",
    default: "some",
  }),
  weeklyBudget: numberSetting({
    key: "stores.weeklyBudget",
    level: "household",
    schema: z.number().positive().max(100_000),
    description:
      "What the household means to spend on food in a week, in its store's currency (dollars at Kroger). Fill the week and the weekly autoplan pick recipes that fit what's left of it more often. Empty for none.",
  }),
}
