# Starter collections and suggested sites

One folder per language (`en`, and later `de`, `fr`...), each with two files. Merran reads them at start; a test checks them.

## `sites.json`: suggested sites

Recipe sites offered to follow, and read in the background to fill the starter collections. Each needs a working RSS or Atom feed, and its posts need recipe data (schema.org `Recipe`), which most recipe sites have. Leave out sites that turn servers away.

```json
{
  "name": "RecipeTin Eats",
  "url": "https://www.recipetineats.com/",
  "feedUrl": "https://www.recipetineats.com/feed/",
  "description": "Reliable, well-tested dinners from Sydney, from weeknight to show-off."
}
```

## `collections.json`: starter collections

A collection is a rule, not a list: it shows every recipe Merran has read from the sites that fits the rule, newest first, around a few hand-picked classics.

```json
{
  "id": "soups",
  "title": "Soups & stews",
  "description": "Big pots for cold nights, most of them better the next day.",
  "theme": "Soups and stews for cold nights",
  "rule": { "courses": ["soup"], "words": ["soup", "stew", "chowder"] },
  "classics": [
    {
      "url": "https://www.recipetineats.com/french-onion-soup/",
      "site": "RecipeTin Eats"
    }
  ]
}
```

- `id`: lowercase letters, numbers and dashes. It's in the collection's address.
- `theme`: what **Find more** asks Discover for, with AI.
- `classics`: pages that import cleanly with Merran. Each is opened every week, and one that stops working is hidden until it works again.

The rule (`courses` and `words` are either-or; everything else must hold too):

| Field        | A recipe fits when                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `courses`    | Its site calls it one of these: `main`, `side`, `soup`, `salad`, `dessert`, `baking`, `breakfast`, `snack`, `drink`, `sauce`     |
| `words`      | One of these is in its name, categories, cuisines or keywords, as a whole word (plurals too)                                     |
| `without`    | None of these is                                                                                                                 |
| `diets`      | It has all of these diet labels, as Merran works them out: `vegetarian`, `vegan`...                                              |
| `maxMinutes` | It takes at most this long, all in                                                                                               |
| `seasons`    | The collection only shows in these seasons (`spring`, `summer`, `autumn`, `winter`), six months apart in the southern hemisphere |
| `months`     | The collection only shows in these months (1 is January), wherever the household is                                              |
