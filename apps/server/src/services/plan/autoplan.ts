import {
  addDays,
  autoplanWeek,
  clockIn,
  dayOfWeek,
  DEFAULT_AUTOPLAN,
  NO_THEMES,
  nextAutoplanRun,
  plannedMeals,
  type AutoplanRun,
  type AutoplanSettings,
  type Meal,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household, Job, PlanEntry } from "../../database/entities/index.ts"
import type { EventBus } from "../events/events.ts"
import { enqueue } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { addFromPlan } from "../list/meals.ts"
import { budgetForSuggest } from "../stores/costs.ts"
import {
  freshPrices,
  salesForSuggest,
  type PriceDeps,
} from "../stores/prices.ts"
import { addEntries } from "./plan.ts"
import { suggestMeals } from "./suggest.ts"

// The weekly autoplan: on the household's day and hour, in its time zone,
// it fills the week ahead's empty meals the way Fill the week does, saying
// why for each, and can put what they need on the list. Each household's
// next run waits as a job of its own, so a server that was off runs it as
// soon as it's back: for what's left of the week it was meant for, or not
// at all once that week's gone by.

export const AUTOPLAN_JOB = "plan.autoplan"

/** A household's autoplan jobs: one per run, the next waiting. */
const jobKey = (householdId: string, at: Date) =>
  `schedule:autoplan:${householdId}:${at.toISOString()}`

async function settingsOf(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const { last, ...saved } = household.settings?.autoplan ?? {}
  return {
    household,
    settings: { ...DEFAULT_AUTOPLAN, ...saved } satisfies AutoplanSettings,
    last: last ?? null,
  }
}

/** The next run waiting, if there is one. */
async function waiting(em: EntityManager, householdId: string) {
  return em.find(
    Job,
    {
      kind: AUTOPLAN_JOB,
      forHousehold: householdId,
      status: "queued",
    },
    { orderBy: { runAt: "asc" } }
  )
}

/** The autoplan as Settings shows it: when it runs, the next run, the last. */
export async function getAutoplan(em: EntityManager, householdId: string) {
  const { settings, last } = await settingsOf(em, householdId)
  const next = settings.enabled
    ? ((await waiting(em, householdId))[0]?.runAt ?? null)
    : null
  return {
    ...settings,
    next: next?.toISOString() ?? null,
    last,
  }
}

/** Puts the household's next run in the queue, or none when it's off. */
export async function scheduleAutoplan(
  em: EntityManager,
  householdId: string,
  now = new Date()
) {
  // The run waiting never started, so it goes rather than showing on the
  // Jobs page as cancelled each time the settings change.
  await em.nativeDelete(Job, {
    kind: AUTOPLAN_JOB,
    forHousehold: householdId,
    status: "queued",
  })
  const { household, settings } = await settingsOf(em, householdId)
  if (!settings.enabled) return null
  const at = nextAutoplanRun(settings, household.timeZone, now)
  await enqueue(em, {
    kind: AUTOPLAN_JOB,
    householdId,
    key: jobKey(householdId, at),
    // When it was meant to run, for a run that's late.
    payload: { at: at.toISOString() },
    runAt: at,
    maxAttempts: 1,
  })
  return at
}

/**
 * Saves when the autoplan runs and what it fills. Turning it on plans
 * nothing straight away: it waits for its day and hour.
 */
export async function saveAutoplan(
  em: EntityManager,
  householdId: string,
  input: AutoplanSettings
) {
  const { household, last } = await settingsOf(em, householdId)
  household.settings = {
    ...household.settings,
    autoplan: { ...input, last },
  }
  await em.flush()
  await scheduleAutoplan(em, householdId)
  return getAutoplan(em, householdId)
}

/**
 * Fills a week's empty meals, from `from` to `to`, the way Fill the week
 * does (leftovers and eat-out nights stay empty), then puts what they
 * need on the list if asked.
 */
export async function planWeek(
  em: EntityManager,
  householdId: string,
  range: { week: string; from: string; to: string },
  settings: Pick<AutoplanSettings, "meals" | "addToList">,
  /** For the household's deals and budget, when there's a store. */
  deps: Pick<PriceDeps, "settings"> | null = null
): Promise<AutoplanRun> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const themes = household.settings?.themes ?? NO_THEMES
  const meals: Meal[] = plannedMeals(household.settings?.meals).filter((meal) =>
    settings.meals.includes(meal)
  )
  const taken = new Set(
    (
      await em.find(PlanEntry, {
        date: { $gte: range.from, $lte: range.to },
        anyDay: false,
      })
    ).map((entry) => `${entry.date} ${entry.meal}`)
  )
  const slots: { date: string; meal: Meal }[] = []
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (const meal of meals) {
      if (taken.has(`${date} ${meal}`)) continue
      if (meal === "dinner" && themes[dayOfWeek(date)]?.kind === "skip")
        continue
      slots.push({ date, meal })
    }
  }
  const suggestions = await suggestMeals(em, householdId, slots, {
    sales: deps ? await salesForSuggest(deps, em, householdId) : null,
    budget: deps ? await budgetForSuggest(deps, em, householdId, slots) : null,
  })
  if (suggestions.length > 0) {
    await addEntries(
      em,
      householdId,
      suggestions.map((suggestion) => ({
        date: suggestion.date,
        meal: suggestion.meal,
        recipe: suggestion.recipe.id,
        withRecipe: suggestion.withRecipe?.id ?? null,
        why: suggestion.why,
      }))
    )
  }
  const listed = settings.addToList
    ? await addFromPlan(em, householdId, { from: range.from, to: range.to })
    : null
  return {
    week: range.week,
    at: new Date().toISOString(),
    planned: suggestions.length,
    empty: slots.length,
    listed: listed ? listed.added + listed.merged : 0,
  }
}

/** Notes what a run did: its week is done. */
async function noteRun(
  em: EntityManager,
  householdId: string,
  run: AutoplanRun
) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  household.settings = {
    ...household.settings,
    autoplan: {
      ...DEFAULT_AUTOPLAN,
      ...household.settings?.autoplan,
      last: run,
    },
  }
  await em.flush()
}

/** Tells open pages what a run changed. */
function announce(events: EventBus, householdId: string, run: AutoplanRun) {
  if (run.planned > 0)
    for (const area of ["plan", "pantry"] as const)
      events.changed(householdId, { area, by: null, client: null })
  if (run.listed > 0 || run.planned > 0)
    events.changed(householdId, { area: "list", by: null, client: null })
}

/**
 * Plans the week ahead now, Plan the week ahead in Settings: the next week
 * starting today or later, from today. That week counts as done, so its
 * run doesn't plan it again.
 */
export async function planAheadNow(
  em: EntityManager,
  householdId: string,
  deps: Pick<PriceDeps, "settings">,
  events?: EventBus
) {
  const { household, settings } = await settingsOf(em, householdId)
  const { today } = clockIn(household.timeZone)
  const week = autoplanWeek(today, household.weekStartsOn)
  const run = await planWeek(
    em,
    householdId,
    { week, from: week, to: addDays(week, 6) },
    settings,
    deps
  )
  await noteRun(em, householdId, run)
  if (events) announce(events, householdId, run)
  return run
}

/**
 * A household's run: the week starting on or after the day it was meant
 * to run, from today on, unless it's done already or gone by. Then the
 * next run waits.
 */
export const autoplanJob: JobHandler = {
  kind: AUTOPLAN_JOB,
  concurrency: 2,
  async run({ em, householdId, payload, deps, logger }) {
    if (!householdId) return
    const { household, settings, last } = await settingsOf(em, householdId)
    if (!settings.enabled) return { skipped: "off" }
    const meant = typeof payload.at === "string" ? new Date(payload.at) : null
    const { today } = clockIn(household.timeZone)
    const week = autoplanWeek(
      meant ? clockIn(household.timeZone, meant).today : today,
      household.weekStartsOn
    )
    let run: AutoplanRun | null = null
    if (addDays(week, 6) < today) {
      logger.info({ week }, "Too late to plan the week")
    } else if (last?.week !== week) {
      // This week's sales, if the morning check hasn't seen them yet.
      await freshPrices(deps, em, householdId)
      run = await planWeek(
        em,
        householdId,
        { week, from: today > week ? today : week, to: addDays(week, 6) },
        settings,
        deps
      )
      await noteRun(em, householdId, run)
      announce(deps.events, householdId, run)
      logger.info(
        { week, planned: run.planned, empty: run.empty, listed: run.listed },
        "Planned the week"
      )
    }
    // Comes round again next week.
    await scheduleAutoplan(em, householdId, new Date(Date.now() + 60_000))
    return run
      ? { ...run }
      : { skipped: addDays(week, 6) < today ? "gone by" : "planned already" }
  },
}
