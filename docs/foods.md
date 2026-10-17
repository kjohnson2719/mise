# Foods

A plan for one shared vocabulary of foods: what each one is called (in every language Merran speaks, and the ways recipes and regions say it), what it belongs to, and what Merran knows about it. Recipes, the list, the pantry, nutrition and the stores all ask it the same question: which food is this line about?

Status: slice 1 built (October 17, 2026): about 450 foods, matching, brands, the corpus and the coverage report. Slices 2 to 4 are planned. It comes after the stores' costs and budget and before the Walmart cart, which searches by the same names. See [scope.md](scope.md).

## Why

Today Merran knows about food through about fifteen word lists spread over the shared package, each kept by hand:

| Where | What it knows |
|---|---|
| `list/synonyms.ts` | Plain flour is all-purpose flour, a lemon wedge is a lemon |
| `list/food.ts` | Prep and size words, what's sold that way, choices, containers |
| `list/aisles.ts` | Which aisle a food is in, by pattern |
| `list/amounts.ts` | A food's own units: a head of garlic is ten cloves |
| `list/costs.ts` | What one of something sold by weight weighs |
| `units/weights.ts` | Baking staples' grams per cup |
| `pantry/pantry.ts` | Words that don't make it a different thing to have; what keeps out of the fridge; what keeps for weeks |
| `list/on-hand.ts` | What's always at home |
| `nutrition/grams.ts` | Portion volumes, tiny amounts |
| `ingredients/parse.ts` | Measures without a number, sizes before a unit |
| `plan/tastes.ts`, `plan/themes.ts`, `diets/diets.ts` | Which foods break a diet, which are fish |
| Server: `food_matches` | The USDA food for each food, and what a unit of it weighs, learned |

Trying the list with a household's real recipes showed what that costs:

- **Every fix touches two or three lists.** Teaching it that a garlic clove is garlic meant a synonym, a food unit, a measure word and a test.
- **Rules strip words; they can't find the food.** "King Arthur Unbleached All-Purpose Flour" stays as written, because nothing says which words are the food. "Diamond Crystal" (a salt) can't become kosher salt at all.
- **It's English only,** though [platform.md](platform.md) promises parsing for other languages "added as data, not code".
- **There's no "kind of".** A recipe's "bell pepper" can't be met by the green bell pepper in the pantry, because one key can't say one is a kind of the other.

## What it isn't

Looked at and decided against, with the reasons, so it isn't proposed again without new ones:

- **Not an import of FoodOn or USDA FoodData Central.** FoodOn is a food-science ontology of over 100,000 terms ("Allium sativum bulb"); FoodData Central names read "Chicken, broilers or fryers, thigh, meat only, raw". Neither knows "capsicum", "coriander leaves" or "can chickpeas", which is the part that matters, so curating them down would be most of the work and still miss it. FoodData Central ids are kept on foods where they help nutrition (they're public domain).
- **Not Open Food Facts' taxonomy either,** though it's closer to how cooks write and has many languages: it's under the ODbL, whose share-alike applies to a database built from it, which doesn't sit well inside an AGPL app's own data. Merran's vocabulary is written for Merran, under its own license.
- **Not thousands of entries.** Recipe ingredients are lopsided: a few hundred foods make up most lines. A small vocabulary that's right beats a big one nobody checks. It grows from lines that don't match, not from a catalog.
- **No numeric ids.** A food's key ("all-purpose flour") is its identity, as now. Foods outside the vocabulary are always there (gochugaru, mijiu, a grandmother's spice mix), and they need keys from their text anyway; one kind of key keeps it one system. `FOOD_KEYS_VERSION` and the `foods.rekey` job already move stored keys when the vocabulary changes.
- **No store product ids.** They differ by store, region and week; they're a household's (`store_products`), not the vocabulary's.
- **No AI learning that changes matching by itself.** A wrong mapping learned once spreads everywhere (a search for tomatoes found a lipstick). AI suggests; a person accepts, for their household. And Merran never calls home, so nothing learned on one server reaches another.
- **Diets aren't moved into it.** Allergy and diet labels stay with their own word lists ([diets.ts](../packages/shared/src/diets/diets.ts)), which look at the whole line on purpose. The vocabulary can add what it knows about a food (pesto has nuts), but it can never take a flag away.

## A food

Foods live in the shared package beside the code that reads them, as typed data modules: `foods/data/foods.ts` for what's true of a food in every language, `foods/data/en.ts` for its English names, and `foods/data/brands-en.ts` for brands. Modules rather than JSON files: they're checked by TypeScript, can have comments (each aisle's foods under a heading), and need no JSON-import settings in the server, the web app and the extension, which build them three different ways. They're read once when the package loads, and they ship with releases, like the starter collections.

```ts
// foods.ts: what's true of a food, by its key
"all-purpose flour": { aisle: "pantry", parent: "flour" },
egg: { aisle: "dairy-eggs", keepSize: true },
"whole chicken": { aisle: "meat-seafood", parent: "chicken" },
```

```ts
// en.ts: the names it goes by besides its key
"all-purpose flour": ["plain flour", "ap flour", "plain purpose flour", "white flour"],
cilantro: ["coriander leaf", "fresh coriander", "cilantro leaf"],
"red chili": ["red chilli", "red chillies", "red chilies"],
```

```ts
// brands-en.ts: dropped before looking, or naming a food
drop: ["king arthur", "bob's red mill", "simple truth", "morton"],
means: { "diamond crystal": "salt", maldon: "flaky sea salt" },
```

Names are matched without case, accents, apostrophes or hyphens, each word singular, so a food needs no names for "All-Purpose Flours". Plurals that don't end in a plain "s" are names of their own ("chillies", "chilies").

What a food can say, each optional except its key and aisle:

| Field | What it's for | Replaces | Slice |
|---|---|---|---|
| key | Its identity: English, lowercase, the last word singular, like every food key | | 1 |
| names (per language) | What it's called besides its key | `synonyms.ts`, the pantry's same-thing words | 1 |
| aisle | Where it's shelved | `AISLE_WORDS` (kept for foods outside the vocabulary) | 1, read in 2 |
| parent | What it's a kind of: green bell pepper → bell pepper | | 1, read in 3 |
| keepSize | A size that's a different thing to buy: large eggs, jumbo shrimp | the size rules' exceptions | 1 |
| gramsPerCup | Its density, so cups and grams add up | `GRAMS_PER_CUP` | 2 |
| gramsEach | What one weighs, so "2 onions" can be priced by the pound | `EACH_GRAMS` | 2 |
| units | Its own units: a head of garlic, a stick of butter | `FOOD_UNITS` | 2 |
| sold | By weight, by count, or by the pack | the cost rules' guesses | later: packs go by unit (box, bag, bottle, envelope are units) |
| keeps | Out of the fridge, or for weeks | `KEEPS_OUT`, `LONG_KEEPING` | 2 |
| onHand | Usually at home | `DEFAULT_ON_HAND` | dropped: that's a household's own list, in the words it shows ("salt, pepper"), and on-hand matching already goes by the vocabulary |
| search | What to search a store for, when the name isn't it | the search's word swaps | 2 |
| fdc | Its USDA FoodData Central food, generic and as bought: raw onions, canned beans | seeds `food_matches`: nutrition uses it, over what was matched before, without searching | 2 |

A brand that's the product, with no food under it (Sriracha, Old Bay), is a food. Brands that name a food ("Diamond Crystal" is salt) are in `means`; the rest are dropped before looking.

A food's `fdc` is checked by hand. `pnpm merran foods fdc proposals.jsonl` (or `merran foods fdc` in the Docker image) searches USDA's generic foods (Foundation and SR Legacy) for each food without one, on the server's USDA key, and writes a guess and USDA's first 20 answers to the file; nothing else changes. It's one search a food, and it carries on from the file when USDA's hourly limit stops it. SR Legacy comes first where both fit, since its household portions weigh "1 onion" without AI. A near match is fine when it's the same to eat (broccolini as broccoli, a red onion as an onion); blends, curry pastes and the like that USDA doesn't have get none, and are searched for as before.

## Finding the food in a line

The parser does the amount, unit and notes as before (brackets, nested or left open, are notes too; so is a pack size without them, "1 10.5 oz. can soup"). Describing words set apart by commas stay with the food they lead to, when they name no food themselves and a food Merran knows ends the part: "creamy, emulsified peanut butter" is peanut butter, "red, green, or yellow bell pepper" red bell pepper. The tidy-up that follows (`shoppingName`) takes off a label ("Egg wash:"), what's done to it after it ("cut into chunks", "beaten with milk"), how it's used ("to serve"), a measure without a number, what it comes in ("can", "envelope", "sleeve"), and a second choice. Then `findFood` looks in what's left:

1. **Brands:** one that names a food is that food; the others are skipped.
2. **The known name that ends last, and of those the longest.** English puts the food last, so "vanilla ice cream" is ice cream, "chicken sausage" sausage and "whole-milk ricotta" ricotta, while overlapping names go to the longer ("cream cheese", "King Arthur Unbleached All-Purpose Flour" is all-purpose flour).
3. **Not past "with", "in" or "from"** once a food is named, since what follows is about it: "diced tomatoes with green chiles" is diced tomatoes, "tuna in oil" tuna, "lemon juice from 1 lemon" lemon juice. A name that runs past the word ("chipotles in adobo") still counts.
4. **A kind said with what it's a kind of** is the kind: "provolone cheese" is provolone, "kielbasa sausage" kielbasa.
5. **Nothing, when the word after it makes it something else:** seasoning, sauce, mix, paste, soup, syrup, extract, powder, seed, stock, cereal, wrapper and the like. "Salt and vinegar seasoning" isn't vinegar, "celery seed" isn't celery, "egg roll wrappers" aren't eggs, so they're foods it doesn't know (or foods of their own) rather than the wrong food. Unless the word only says it again: "sriracha sauce", "miso paste", "taco seasoning mix".
6. **The word before it, when it makes a different thing to buy:** dried, frozen, smoked, ground, powdered, pickled, roasted, sweet, hot, dark, light, vegan ("dried oregano", "dark brown sugar"); a color, for fruit and vegetables ("red grape"); dairy-free, gluten-free and the like, which matter for allergies ("dairy-free milk" isn't milk). These make the key, like "dried oregano". A size stays in the name for a food sold by size ("large eggs") but not in its key. "Peppers", more than one, are bell peppers: black pepper never is.
7. **Otherwise** the tidied words and their plain form, as before. These are the lines the coverage report lists.

A choice shares its food when that's a food Merran knows and the first choice is part of it, or isn't a food at all: "sunflower or vegetable oil" is sunflower oil, "low-sodium chicken or vegetable broth" chicken broth, "fresh or frozen blueberries" blueberries, but "mayonnaise or plain Greek yogurt" is mayonnaise and "honey or golden syrup" honey. Two whole names are the first ("thickened cream / heavy cream"), and "canola or other neutral oil" is canola oil.

A line can name more than one food (`lineFoods`): "salt and pepper" is salt and pepper, "½ tsp each dried thyme and oregano" ½ tsp of each, "2 tbsp olive oil and 1 tbsp butter" each its own amount. It's parted only when each part is a food Merran knows that ends the part, so "black and white sesame seeds", "half and half" and "salt and vinegar seasoning" stay one. The list, costs, prices and "uses up" each take every food a line names.

What comes out (`foodInLine`):

```ts
{ key: "all-purpose flour", name: "All-Purpose Flour", known: true }
```

The name is the words that named it, as the recipe wrote them ("plain flour" stays "plain flour" for a British household), so lines of the same food join under the first one's name. `foodKey`, `lineFood` and `shoppingName` keep their signatures and use it, so callers didn't change.

## Kinds of

A parent is for matching what's at home and what's needed, never for joining lines on the list:

- **The list keeps kinds apart:** red and green bell peppers are two lines, and their own products at the store.
- **The pantry can cover a parent with a kind:** a recipe's "bell pepper" uses the green bell pepper at home, and "uses up" counts it. Not the other way: a recipe's green bell pepper isn't met by a red one.
- **Prices and costs use the food's own product,** then its parent's when it has none.

## A household's own

Each household can teach it, as it does aisles now (`food_placements`):

- **"Same as…"** on a list line: these unsalted butter sticks are butter, for this household. Kept by key, in a `food_aliases` table.
- **"Not the same":** two lines it joined that the household wants apart.

These win over the vocabulary, for that household only.

## Where AI helps

Only where a person sees what it did:

- **At import and in the tidy-up,** a line the vocabulary doesn't know can get a suggested food, shown on the Review page with the other suggestions. Accepted, it's kept on the recipe line.
- **Never while making the list or a cost.** Those are deterministic: the same lines give the same list on every server.

Recipe lines keep a food someone chose for them (`recipe_ingredients.food_key`, and whether a person or AI said it: `food_source`), carried through edits as marks are, and it wins over the vocabulary when the list is made. A food the vocabulary finds isn't kept: reading the line again is quick, and always as current as the vocabulary.

## Knowing it works

- **A corpus of lines,** `packages/shared/src/foods/corpus/en.txt`: ingredient lines in the styles sites write them (WP Recipe Maker's "(, drained)", RecipeTin's "((Note 4))", British and Australian names, brands, ranges, choices), written for the project rather than copied, each as `line => food key` (`?` before a key for a food it doesn't know yet). The tests check every one, and that a key is its own key. They also check that every food is found by its key and by each of its names.
- **A coverage target:** the share of corpus lines that are foods it knows, checked in the tests so it can't quietly drop. 95% to start.
- **A report for a real library:** `pnpm merran foods` (or `merran foods` in the Docker image) runs a server's recipes and recipe sites through it and lists the foods it didn't know, most common first, with a line for each. Given a file it reads that instead: a text file (`merran foods lines.txt`, one ingredient to a line) or a JSON Lines file (`merran foods recipes.jsonl`, a recipe to a line with an `ingredients` list), which is how a big set of lines collected elsewhere is used: for finding what to add, never committed as it is. It only reads.
- **Adding a food is one entry and one corpus line,** described in the contributing guide.

## Slices

Each slice ends with the tests passing and `FOOD_KEYS_VERSION` bumped, so what's stored follows.

1. **The vocabulary and finding foods.** The data files and their loader; brands; the matcher; `foodKey`, `lineFood` and `shoppingName` using it, with today's lists as the fallback for unknown foods; the first few hundred foods, from the corpus and the dev households' recipes; the corpus, golden file and coverage check.
   *Done when:* the corpus is 95% matched, and a week of the dev household's recipes added from the plan has no line named by a brand, a bracket or a measure.
   *Built:* 671 foods; the corpus (384 lines) is 98.4% foods it knows, every line as expected; the dev server's 2,479 lines are 98.7%, and 14,390 lines collected from recipe sites (kept out of the repo) 98.5%, their matches checked for wrong foods.
2. **One place for what Merran knows about food.** Densities, weights each, food units, aisles, keeping, always-on-hand and store search words read from the vocabulary; `food_matches` starts from its USDA ids; the old lists are deleted, except the aisle patterns for foods it doesn't know.
   *Done when:* `synonyms.ts`, `GRAMS_PER_CUP`, `EACH_GRAMS`, `FOOD_UNITS`, `KEEPS_OUT`, `LONG_KEEPING` and the pantry's same-thing words are gone, and nothing else changed in the tests' results.
   *Built:* grams per cup, grams each, a food's own units, how it keeps and store search words are facts on the foods; a kind takes its parent's weight and keeping when they share an aisle (a red onion weighs an onion, lemon juice doesn't). Aisles come from the vocabulary for foods it knows, read the way a line is (the first choice), with the word patterns for the rest. The old lists are gone, and so are the search's word swaps; `pantryKey` is `foodKey`. What changed in the tests: kosher, sea and Morton kosher salt are foods of their own, since a cup of each weighs 135, 160 and 230 g against table salt's 292; Parmigiano turns into cups as parmesan does. Also new: so many of a food and a weight of it are one line by what one weighs (6 carrots and 450 g are 13 carrots). Not yet: `sold` (above). Then (October 17, 2026) `fdc`: 625 of the 705 foods have a USDA food, each checked by hand against USDA's 8,187 generic foods (canned beans as canned, since dried weigh about four times the calories; butter unsalted, as recipe lines mostly say), agreeing with every food the dev server had matched; the rest have none. Checked against 17,000 lines from recipe sites: their amounts ("1-1/2" is 1½, not 1 to ½; "1 3-pound turkey", boxes, bags and envelopes), and a hand-checked random 300, about 94% the right food and amount and 2.7% a wrong food, each fixed. 705 foods.
3. **Kinds of.** Parents in the pantry, "uses up" and costs.
   *Done when:* a recipe's bell pepper is covered by the pantry's green bell pepper, and the list still has red and green apart.
   *Built:* `kindOf` and `covers` (`foods/kinds.ts`): what's at home, bought or priced stands in for a food it's a kind of, only from a parent shelved with it (dried apricots aren't fresh ones), and not when the kind is made another way (dried limes aren't limes). The pantry covers the list and cooking that way, the food itself first; "uses up" and receipts count it; a recipe's cost takes the food's own product, else its parent's. Lemon and lime juice and Ro-Tel lost their parents: made from a lemon, or with chiles in, rather than kinds.
4. **A household's own, and AI's suggestions.** `food_aliases` with "Same as…" and "Not the same" on the list; `recipe_ingredients.food_key`; suggested foods for unknown lines in the tidy-up.
   *Done when:* a household marks a line the same as another and the next list joins them, and a line no one knew gets a food from the Review page.
   *Built:* on the list, changing something has Same as (search what else is on the list) and, for a line joined from several names, Not the same (tick the names to keep apart); the list's menu has Your own foods, to forget one. Same as joins the lines at once and re-keys the household's list, pantry, aisles and store products; Not the same applies from the next list. The household's names apply wherever the list and pantry make a key. Tidy up has a foods section: for lines Merran doesn't know, AI picks a food from the vocabulary or none, anything else dropped; applied from the Review page, it's kept on the line. Not yet: a person choosing a recipe line's food directly (`food_source` "person").

Other languages come after 0.1 with translations: a language is its names file, its brands, its words for measures and how-much, and its corpus.

## Risks

- **Joining what shouldn't be:** coriander seed and coriander leaf, bread and all-purpose flour, light and dark brown sugar. Keys stay specific, kinds go in `parent`, and the corpus has the pairs that must stay apart.
- **The vocabulary going stale:** it grows only from lines that don't match, with a corpus line for each food, so every entry has a reason and a test.
- **Allergies:** the diet word lists keep the final say ([diets.ts](../packages/shared/src/diets/diets.ts)); the vocabulary can only add to what they find.
- **Speed:** a few hundred foods' names go into one lookup at load; finding a food is a few map lookups per line.
