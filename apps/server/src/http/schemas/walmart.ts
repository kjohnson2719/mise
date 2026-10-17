import { z } from "@hono/zod-openapi"
import { BasketLineSchema, ProductSchema } from "./stores.ts"
import { IDS } from "./examples.ts"

// Walmart, through Merran's browser extension: what the extension hands
// back from the person's Walmart tab, checked as anything from outside is.

const WALMART_PRODUCT = {
  id: "10450114",
  upc: null,
  name: "Great Value 2% Reduced Fat Milk, Gallon, 128 fl oz",
  brand: "Great Value",
  size: "128 fl oz",
  image: "https://i5.walmartimages.com/seo/milk.jpeg",
  price: 327,
  salePrice: null,
  saleEnds: null,
  currency: "USD",
  aisle: null,
  inStock: true,
  url: "https://www.walmart.com/ip/10450114",
}

const cents = z.number().int().min(0).max(10_000_000).nullable()

/** A product read from a Walmart page, as the extension sends it. */
export const WalmartProductSchema = z
  .object({
    id: z.string().regex(/^[0-9A-Za-z]{1,64}$/, "Not a Walmart product id."),
    upc: z.string().max(20).nullable(),
    name: z.string().trim().min(1).max(300),
    brand: z.string().max(120).nullable(),
    size: z.string().max(60).nullable(),
    image: z
      .string()
      .max(1000)
      .regex(/^https:\/\//, "Only https pictures.")
      .nullable(),
    price: cents,
    salePrice: cents,
    saleEnds: z.iso.date().nullable().openapi({
      description: "Walmart's pages don't say, so the extension sends null.",
    }),
    currency: z.literal("USD"),
    aisle: z.string().max(60).nullable(),
    inStock: z.boolean(),
    url: z
      .string()
      .max(1000)
      .regex(/^https:\/\/www\.walmart\.com\//, "Only Walmart's own pages.")
      .nullable(),
  })
  .openapi("WalmartProduct", { example: WALMART_PRODUCT })

const LINE = {
  itemId: IDS.listItems[0]!,
  name: "milk",
  amount: "1 gallon",
  product: WALMART_PRODUCT,
  suggested: true,
  packages: 1,
  sure: true,
  sent: false,
  sale: null,
}

export const WalmartBasketSchema = z
  .object({
    store: z.string().openapi({ description: "Walmart." }),
    cartUrl: z
      .string()
      .openapi({ description: "Walmart's cart, to check out." }),
    sentAt: z.iso.datetime().nullable(),
    lines: z.array(BasketLineSchema),
    toFind: z
      .array(
        z.object({
          itemId: z.string(),
          words: z.string().openapi({
            description: "What to search Walmart for: the food as it's bought.",
          }),
        })
      )
      .openapi({
        description:
          "Things without a product yet, one for each food, for the extension to look for at Walmart.",
      }),
  })
  .openapi("WalmartBasket", {
    example: {
      store: "Walmart",
      cartUrl: "https://www.walmart.com/cart",
      sentAt: null,
      lines: [
        LINE,
        {
          ...LINE,
          itemId: IDS.listItems[1]!,
          name: "eggs",
          amount: "12",
          product: null,
        },
      ],
      toFind: [{ itemId: IDS.listItems[1]!, words: "eggs" }],
    },
  })

export const WalmartFoundSchema = z
  .object({
    items: z
      .array(
        z.object({
          itemId: z.string(),
          products: z.array(WalmartProductSchema).max(12),
        })
      )
      .min(1)
      .max(200),
  })
  .openapi("WalmartFound", {
    example: {
      items: [{ itemId: IDS.listItems[1]!, products: [WALMART_PRODUCT] }],
    },
  })

export const WalmartOptionsSchema = z
  .object({
    products: z.array(ProductSchema).openapi({
      description:
        "What Walmart's search had for it when the extension last looked, Walmart's order with ads and what's out of stock last. Empty if it hasn't looked.",
    }),
  })
  .openapi("WalmartOptions", { example: { products: [WALMART_PRODUCT] } })

export const WalmartPickSchema = z
  .object({ product: WalmartProductSchema })
  .openapi("WalmartPick", { example: { product: WALMART_PRODUCT } })

export const WalmartSentSchema = z
  .object({
    lines: z
      .array(
        z.object({
          itemId: z.string(),
          packages: z.number().int().min(1).max(99),
          product: WalmartProductSchema.nullable().optional().openapi({
            description: "The product as its page showed it when it was added.",
          }),
        })
      )
      .min(1)
      .max(300),
  })
  .openapi("WalmartSent", {
    example: {
      lines: [
        { itemId: IDS.listItems[0]!, packages: 1, product: WALMART_PRODUCT },
      ],
    },
  })
