import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { foodFacts, knownFoods } from "@merran/shared"
import { pino } from "pino"
import { AppError } from "../core/errors.ts"
import { loadConfig } from "../core/config.ts"
import { loadSecret } from "../core/secret.ts"
import { openDatabase } from "../database/orm.ts"
import { NUTRITION } from "../modules/nutrition/settings.ts"
import { createPublicFetcher } from "../services/fetch/public-fetch.ts"
import { createFdcClient } from "../services/nutrition/fdc.ts"
import { guessCandidate } from "../services/nutrition/nutrition.ts"
import { createSettings } from "../services/settings/settings.ts"

/** Candidates kept for each food, for choosing another by hand. */
const CANDIDATES = 20

/** One food's proposal, a line of the file. */
type Proposal = {
  key: string
  fdc: number | null
  description: string | null
  candidates: { fdcId: number; description: string; dataType?: string }[]
}

/**
 * Proposes a USDA FoodData Central food for each food Merran knows without
 * one (docs/foods.md): searches USDA's generic foods for its key, guesses
 * the plain one as nutrition does without AI, and adds a line to a JSON
 * Lines file with the guess and USDA's first 20, for someone to check
 * before any go into the foods' data. It changes nothing else. One search
 * a food, on the server's USDA key; foods already in the file are skipped,
 * so a run stopped by USDA's hourly limit carries on where it was.
 * `--max 300` stops after that many searches.
 */
export async function foodsFdc(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env
): Promise<number> {
  const file = args.find((arg) => !arg.startsWith("--"))
  const maxAt = args.indexOf("--max")
  const max = maxAt >= 0 ? Number(args[maxAt + 1]) : Infinity
  if (!file || !(max > 0)) {
    console.error(
      "Usage: merran foods fdc <proposals.jsonl> [--max <searches>]"
    )
    return 1
  }

  const done = new Set(
    existsSync(file)
      ? readFileSync(file, "utf8")
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => (JSON.parse(line) as Proposal).key)
      : []
  )
  const todo = knownFoods().filter(
    (key) => foodFacts(key)?.fdc === undefined && !done.has(key)
  )
  if (todo.length === 0) {
    console.log("Every food has a USDA food or a proposal already.")
    return 0
  }

  const key = await usdaKey(env)
  if (!key) {
    console.error(
      "There's no USDA key: set MERRAN_USDA_KEY, or add one in Settings, This server, Nutrition."
    )
    return 1
  }
  const config = loadConfig(env)
  const fdc = createFdcClient(
    createPublicFetcher({ version: config.version }),
    key
  )

  let searched = 0
  let guessed = 0
  for (const food of todo) {
    if (searched >= max) break
    let candidates
    try {
      candidates = await fdc.search(food, CANDIDATES)
    } catch (err) {
      if (err instanceof AppError && err.code === "usda_rate_limited") {
        console.log(
          `USDA's limit for the hour was reached after ${searched} searches. Run it again later to carry on.`
        )
        return 1
      }
      throw err
    }
    searched++
    const guess = guessCandidate(food, candidates)
    if (guess) guessed++
    const proposal: Proposal = {
      key: food,
      fdc: guess?.fdcId ?? null,
      description: guess?.description ?? null,
      candidates,
    }
    appendFileSync(file, `${JSON.stringify(proposal)}\n`)
  }
  const left = todo.length - searched
  console.log(
    `Proposed a USDA food for ${guessed} of ${searched} foods, in ${file}.` +
      (left > 0 ? ` ${left} left: run it again to carry on.` : "")
  )
  return 0
}

/** The server's USDA key, from the environment or its settings. */
async function usdaKey(env: Record<string, string | undefined>) {
  const config = loadConfig(env)
  const database = await openDatabase(config.database)
  try {
    const settings = createSettings({
      database,
      logger: pino({ level: "silent" }),
      secret: loadSecret(config),
      definitions: [NUTRITION.usdaKey],
      fromEnv: config.fromEnv,
    })
    return (await settings.server(NUTRITION.usdaKey)) ?? null
  } finally {
    await database.close()
  }
}
