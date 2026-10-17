import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { AI_PROVIDERS } from "@merran/shared"
import { createdAt, id, updatedAt } from "./base.ts"
import { Household } from "./households.ts"
import { Secret } from "./secrets.ts"
import { User } from "./users.ts"

/**
 * An AI key, or an OpenAI-compatible address (an Ollama, say): the server's
 * own, or a household's. The key itself is sealed in `secrets`; only its
 * last four characters are kept here, to tell keys apart. Keys set in the
 * server's environment aren't here: they're read from there.
 */
export const AiKey = defineEntity({
  name: "AiKey",
  tableName: "ai_keys",
  properties: {
    id: id(),
    /** The household it's for; none for the server's own. */
    household: () =>
      p.manyToOne(Household).ref().nullable().deleteRule("cascade").index(),
    provider: p.enum(AI_PROVIDERS),
    /** An address's name: "Ollama at home". */
    name: p.string().nullable(),
    /** An address: "http://192.168.1.20:11434/v1". */
    baseUrl: p.text().nullable(),
    /** The key, sealed; an address may not need one. */
    secret: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    /** The key's last four characters. */
    hint: p.string().nullable(),
    /** An address's models, from its last test. */
    models: p.json<string[]>().nullable(),
    testedAt: p.datetime().nullable(),
    /**
     * The credit on the key when it was entered, in US dollars, for a
     * rough "about $3 left": the providers don't say.
     */
    credit: p.double().nullable(),
    creditSince: p.datetime().nullable(),
    /** When the provider last said the key is out of credit. */
    outOfCreditAt: p.datetime().nullable(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
})
export type AiKey = InferEntity<typeof AiKey>
