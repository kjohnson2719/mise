import { z } from "@hono/zod-openapi"
import { SALE_LEANS, SALE_VERDICTS } from "@merran/shared"
import { STORE_MODALITIES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

const LOCATION = {
  locationId: "70500822",
  name: "Fry's Food Stores - Phoenix",
  banner: "Fry's",
  domain: "frysfood.com",
  address: "4724 N 20th St, Phoenix, AZ",
}

export const StoreLocationSchema = z
  .object({
    locationId: z.string(),
    name: z.string(),
    banner: z.string().openapi({
      description:
        "Kroger's name for the chain: Fry's, Ralphs, King Soopers...",
    }),
    domain: z.string().openapi({ description: "The banner's site." }),
    address: z.string(),
  })
  .openapi("StoreLocation", { example: LOCATION })

export const StoresStatusSchema = z
  .object({
    kroger: z.object({
      ready: z.boolean().openapi({
        description: "The server has a Kroger developer app.",
      }),
      location: z.union([StoreLocationSchema, z.null()]).openapi({
        description: "The household's store, or null.",
      }),
      modality: z.enum(STORE_MODALITIES).openapi({
        description: "Orders are picked up or delivered.",
      }),
      linked: z
        .object({ by: z.string().nullable(), at: z.iso.datetime() })
        .nullable()
        .openapi({ description: "The account whose cart things go to." }),
      needsRelink: z.boolean().openapi({
        description: "Kroger stopped taking the linked account.",
      }),
      pricesCheckedAt: z.iso.datetime().nullable().openapi({
        description: "When its prices and sales were last checked.",
      }),
      leanOnSales: z.enum(SALE_LEANS).openapi({
        description:
          "How much Fill the week and the autoplan lean on deals: the household setting `stores.leanOnSales`.",
      }),
      weeklyBudget: z.number().nullable().openapi({
        description:
          "The household's weekly budget in its store's currency, or null: the household setting `stores.weeklyBudget`.",
      }),
    }),
  })
  .openapi("StoresStatus", {
    example: {
      kroger: {
        ready: true,
        location: LOCATION,
        modality: "PICKUP",
        linked: { by: "Kyle", at: TIMES.created },
        needsRelink: false,
        pricesCheckedAt: null,
        leanOnSales: "some",
        weeklyBudget: 120,
      },
    },
  })

export const LocationsSchema = z
  .object({ locations: z.array(StoreLocationSchema) })
  .openapi("StoreLocations", { example: { locations: [LOCATION] } })

export const ZipQuery = z.object({
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Use a 5-digit ZIP code.")
    .openapi({ param: { name: "zip", in: "query" }, example: "85016" }),
})

export const KrogerStoreChangesSchema = z
  .object({
    locationId: z.string().max(40).optional(),
    modality: z.enum(STORE_MODALITIES).optional(),
  })
  .openapi("KrogerStoreChanges", {
    example: { locationId: "70500822", modality: "PICKUP" },
  })

export const LinkSchema = z
  .object({
    url: z.string().openapi({ description: "Where to send the person." }),
  })
  .openapi("KrogerLink", {
    example: { url: "https://api.kroger.com/v1/connect/oauth2/authorize?..." },
  })

const PRODUCT = {
  id: "0001111041700",
  upc: "0001111041700",
  name: "Kroger 2% Reduced Fat Milk",
  brand: "Kroger",
  size: "1 gal",
  image: "https://www.kroger.com/product/images/medium/front/0001111041700",
  price: 349,
  salePrice: 299,
  saleEnds: "2026-10-21",
  currency: "USD",
  aisle: "Dairy",
  inStock: true,
  url: "https://www.frysfood.com/p/milk/0001111041700",
}

export const ProductSchema = z
  .object({
    id: z.string(),
    upc: z.string().nullable(),
    name: z.string(),
    brand: z.string().nullable(),
    size: z.string().nullable(),
    image: z.string().nullable(),
    price: z.number().int().nullable().openapi({
      description: "In the currency's smallest unit: cents.",
    }),
    salePrice: z.number().int().nullable(),
    saleEnds: z
      .string()
      .nullable()
      .openapi({ description: "The sale's last day." }),
    currency: z.string(),
    aisle: z.string().nullable(),
    inStock: z.boolean(),
    url: z.string().nullable(),
  })
  .openapi("StoreProduct", { example: PRODUCT })

const LINE = {
  itemId: IDS.listItems[0],
  name: "milk",
  amount: "1 gallon",
  product: PRODUCT,
  suggested: true,
  packages: 1,
  sure: true,
  sent: false,
  sale: { verdict: "sale", usual: 349 },
}

const VerdictSchema = z.enum(SALE_VERDICTS).openapi("SaleVerdict", {
  description:
    "How good a sale is, against what the product usually costs: the lowest in a while, a normal sale, or barely off (under a tenth).",
})

export const BasketLineSchema = z
  .object({
    itemId: z.string(),
    name: z.string(),
    amount: z.string(),
    product: z.union([ProductSchema, z.null()]),
    suggested: z.boolean().openapi({
      description: "Merran's pick, not one the household chose.",
    }),
    packages: z.number().int(),
    sure: z.boolean().openapi({
      description:
        "How many is worked out from the product's size, not a guess.",
    }),
    sent: z.boolean().openapi({ description: "Sent to the cart last time." }),
    sale: z
      .object({
        verdict: VerdictSchema,
        usual: z.number().int().nullable().openapi({
          description:
            "What it usually costs, in cents: its most common price over 90 days, else its regular price.",
        }),
      })
      .nullable()
      .openapi({ description: "Its sale today, if it's on one." }),
  })
  .openapi("BasketLine", { example: LINE })

export const BasketSchema = z
  .object({
    store: z.string().openapi({ description: "The banner: Fry's." }),
    location: StoreLocationSchema,
    modality: z.enum(STORE_MODALITIES),
    linked: z.boolean().openapi({
      description: "An account is linked, so it can be sent.",
    }),
    sentAt: z.iso.datetime().nullable(),
    lines: z.array(BasketLineSchema),
  })
  .openapi("Basket", {
    example: {
      store: "Fry's",
      location: LOCATION,
      modality: "PICKUP",
      linked: true,
      sentAt: null,
      lines: [LINE],
    },
  })

export const ProductsSchema = z
  .object({ products: z.array(ProductSchema) })
  .openapi("StoreProducts", { example: { products: [PRODUCT] } })

export const BasketQuery = z.object({
  list: z
    .uuid()
    .optional()
    .openapi({
      param: { name: "list", in: "query" },
      description:
        "Just this list, the one the person's looking at. Without it, the store's own list, else the lists for no store in particular.",
    }),
})

export const SearchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .openapi({ param: { name: "q", in: "query" }, example: "milk" }),
})

export const PickProductSchema = z
  .object({ productId: z.string().min(1).max(40) })
  .openapi("PickProduct", { example: { productId: "0001111041700" } })

export const ItemParam = z.object({
  itemId: z.string().openapi({
    param: { name: "itemId", in: "path" },
    example: IDS.listItems[0],
  }),
})

export const SendBasketSchema = z
  .object({
    lines: z
      .array(
        z.object({
          itemId: z.string(),
          packages: z.number().int().min(1).max(99),
        })
      )
      .min(1)
      .max(300),
  })
  .openapi("SendBasket", {
    example: { lines: [{ itemId: IDS.listItems[0], packages: 1 }] },
  })

export const SentSchema = z
  .object({
    sent: z.number().int(),
    store: z.string(),
    cartUrl: z
      .string()
      .openapi({ description: "The store's cart, to check out." }),
  })
  .openapi("SentBasket", {
    example: {
      sent: 1,
      store: "Fry's",
      cartUrl: "https://www.frysfood.com/cart",
    },
  })

export const CallbackQuery = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
})

export const KrogerAppTestSchema = z
  .object({
    clientId: z.string().trim().min(1).max(200).optional(),
    clientSecret: z.string().trim().min(1).max(200).optional(),
  })
  .openapi("KrogerAppTest", {
    description:
      "A Kroger developer app's client ID and secret to test before saving them. Either left out is the saved one.",
    example: { clientId: "merran-abc123" },
  })

export const KrogerAppTestedSchema = z
  .object({ ok: z.literal(true) })
  .openapi("KrogerAppTested", { example: { ok: true } })

export const DealsSchema = z
  .object({
    store: z.string().nullable().openapi({
      description: "The household's store's banner, or null without one.",
    }),
    checkedAt: z.iso.datetime().nullable(),
    leanOnSales: z.enum(SALE_LEANS),
    deals: z.array(
      z.object({
        food: z.string().openapi({ description: "The food: chicken thigh." }),
        product: ProductSchema,
        verdict: VerdictSchema,
        usual: z.number().int().nullable(),
        off: z.number().openapi({ description: "How much is off: 0.25." }),
      })
    ),
    recipes: z
      .record(
        z.string(),
        z.array(z.object({ name: z.string(), verdict: VerdictSchema }))
      )
      .openapi({
        description:
          "By recipe id, what each recipe uses that's on sale, named as the recipe has it.",
      }),
  })
  .openapi("Deals", {
    example: {
      store: "Fry's",
      checkedAt: TIMES.created,
      leanOnSales: "some",
      deals: [
        {
          food: "milk",
          product: PRODUCT,
          verdict: "sale",
          usual: 349,
          off: 0.14,
        },
      ],
      recipes: { [IDS.lemonChicken]: [{ name: "milk", verdict: "sale" }] },
    },
  })

export const PriceCheckSchema = z
  .object({
    refreshed: z.number().int().openapi({
      description: "Products the household keeps, given today's price.",
    }),
    searched: z.number().int().openapi({
      description: "Foods from its recipes looked up at the store.",
    }),
    deals: z.number().int().openapi({
      description: "Foods in its recipes that are a deal now.",
    }),
  })
  .openapi("PriceCheck", { example: { refreshed: 12, searched: 20, deals: 3 } })

export const CostsSchema = z
  .object({
    currency: z.string(),
    weeklyBudget: z.number().int().nullable().openapi({
      description: "The household's weekly budget, in cents, or null.",
    }),
    recipes: z
      .record(
        z.string(),
        z.object({
          total: z.number().int().openapi({ description: "In cents." }),
          perServing: z.number().int().nullable(),
          priced: z.number().int().openapi({
            description: "Its lines with a price.",
          }),
          counted: z.number().int().openapi({
            description: "Its lines with an amount of something bought.",
          }),
        })
      )
      .openapi({
        description:
          "By recipe id, the recipes with a cost worth showing: three in five of their lines priced.",
      }),
  })
  .openapi("RecipeCosts", {
    example: {
      currency: "USD",
      weeklyBudget: 12000,
      recipes: {
        [IDS.lemonChicken]: {
          total: 1240,
          perServing: 310,
          priced: 5,
          counted: 6,
        },
      },
    },
  })

export const ListPricesSchema = z
  .object({
    store: z.string().nullable().openapi({
      description: "The household's store's banner, or null without one.",
    }),
    currency: z.string(),
    items: z
      .record(
        z.string(),
        z.object({
          total: z.number().int().openapi({
            description:
              "In cents, for the packages needed, at the sale price when there's a sale.",
          }),
          packages: z.number().int(),
          sure: z.boolean().openapi({
            description:
              "How many is worked out from the product's size, not a guess.",
          }),
          sale: z
            .object({
              verdict: z.enum(["lowest", "sale"]),
              saved: z.number().int().openapi({
                description: "What it takes off the packages needed, in cents.",
              }),
              ends: z.iso.date().nullable(),
            })
            .nullable()
            .openapi({
              description:
                "A real deal on it today; one barely off is left out.",
            }),
          usual: z.number().int().nullable().openapi({
            description:
              "What a package usually costs, in cents, when it's on sale.",
          }),
          product: z.string().openapi({ description: "The product priced." }),
          seenOn: z.iso.date().openapi({
            description: "The day the price was seen.",
          }),
        })
      )
      .openapi({
        description:
          "By list item id, what's left to get on the list for the store. Things with no product kept for them, or no price, are left out.",
      }),
  })
  .openapi("ListPrices", {
    example: {
      store: "Fry's",
      currency: "USD",
      items: {
        [IDS.listItems[0]!]: {
          total: 598,
          packages: 2,
          sure: true,
          sale: { verdict: "sale", saved: 100, ends: "2026-10-21" },
          usual: 349,
          product: "Kroger 2% Reduced Fat Milk",
          seenOn: "2026-10-17",
        },
      },
    },
  })
