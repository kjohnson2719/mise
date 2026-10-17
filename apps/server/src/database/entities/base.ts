import { p } from "@mikro-orm/core"
import { v7 as uuidv7 } from "uuid"

// Building blocks shared by every entity. They stick to what works the same
// on SQLite and Postgres (see docs/platform.md, "The database").

/** A UUIDv7 primary key, made in code so it's the same on both databases. */
export const id = () =>
  p
    .uuid()
    .primary()
    .onCreate(() => uuidv7())

export const createdAt = () => p.datetime().onCreate(() => new Date())

export const updatedAt = () =>
  p
    .datetime()
    .onCreate(() => new Date())
    .onUpdate(() => new Date())

/** A calendar day as "2026-10-15": no time zone, sorts as text. */
export const day = () => p.string().length(10)

/** A food's normalized name ("chicken thigh"), the key that matches it everywhere. */
export const foodKey = () => p.string()

/** An amount: a number when there is one, the words when there isn't ("half a bag"). */
export const amount = () => ({
  quantity: p.double().nullable(),
  unit: p.string().nullable(),
  amountText: p.string().nullable(),
})
