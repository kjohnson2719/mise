import { convertTemperatures, type UnitSystem } from "@merran/shared"

import { bySection } from "./ingredient-list"
import type { Recipe } from "./queries"
import { withMarks } from "./swaps/marks"
import { StepSwapNote } from "./swaps/step-swap-note"
import type { SwappedStep } from "./swaps/this-time"

/** The steps, numbered right through, under their sections. */
export function StepList({
  steps,
  system,
  changed,
}: {
  steps: Recipe["steps"]
  system: UnitSystem
  /** Steps a stand-in used this time changes, by id. */
  changed?: ReadonlyMap<string, SwappedStep>
}) {
  let number = 0
  return (
    <div className="grid gap-6">
      {bySection(steps).map((group, index) => (
        <section key={index} className="grid gap-4">
          {group.section && (
            <h3 className="text-lg font-semibold">{group.section}</h3>
          )}
          <ol className="grid gap-5">
            {group.lines.map((step) => {
              number += 1
              return (
                <li key={step.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                  >
                    {number}
                  </span>
                  <div className="grid gap-1 pt-1">
                    <p className="text-lg leading-relaxed">
                      {withMarks(
                        convertTemperatures(step.text, system),
                        changed?.get(step.id)?.names ?? []
                      )}
                    </p>
                    <StepSwapNote
                      swap={changed?.get(step.id)}
                      system={system}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
