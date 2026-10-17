import { foodFacts, foodParents, knownKey } from "./vocabulary.ts"

// Kinds of foods (docs/foods.md): what's at home, bought or priced can
// stand in for a food it's a kind of. A recipe's bell pepper is met by
// the green bell pepper at home; a recipe's green bell pepper isn't met by
// a red one, or by "bell pepper". The list keeps kinds apart.

/** Words before a food that make it something else to cook with. */
const MADE_ANOTHER_WAY =
  /\b(dried|frozen|smoked|pickled|roasted|powdered|ground)\b/

/**
 * What a food is a kind of, nearest first: the food Merran knows in its
 * key ("yellow corn" is corn, but dried limes aren't limes), then what
 * that's a kind of, while they're shelved together. Dried apricots aren't
 * fresh ones, nor frozen corn fresh corn, as far as what's at home goes.
 */
export function kindOf(key: string): string[] {
  const known = knownKey(key)
  if (!known) return []
  const said = key.slice(0, key.length - known.length)
  if (MADE_ANOTHER_WAY.test(said)) return []
  const kinds = known === key ? [] : [known]
  let aisle = foodFacts(known)!.aisle
  for (const parent of foodParents(known)) {
    const facts = foodFacts(parent)
    if (facts?.aisle !== aisle) break
    kinds.push(parent)
    aisle = facts.aisle
  }
  return kinds
}

/**
 * Whether something had (at home, bought, priced) is the food needed: the
 * same food, or a kind of it.
 */
export function covers(have: string, need: string): boolean {
  return have === need || kindOf(have).includes(need)
}
