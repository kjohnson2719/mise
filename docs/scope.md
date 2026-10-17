# Scope and build order

What comes over from the REFERENCE app, what's new, what changes on the way, and the order to build it in. The features were described in full in the REFERENCE docs (`product.md` and `roadmap.md`, in the repo's history before 0.1.0-alpha.1); this page only says where each one lands.

**The first release, 0.1, has everything the REFERENCE app does, plus new work** (decided October 15, 2026): the platform (SQLite or Postgres, household AI keys, API keys, SSO, export, translations, units both ways, belonging to more than one household, guided tours), the pool of meals (M16), fridge, freezer or cupboard and usual buys (M17), working offline (M17), reminders and the install button (M12), smarter deals and saying why (M15), and webhooks and an MCP server.

Nothing carries over from the REFERENCE app's data, names or schema. Merran starts with a fresh database; migrations matter from 0.1 on.

## Where each feature lands

Everything here is in 0.1 unless it says **Later**.

- **Core:** needs nothing beyond Merran itself, on SQLite or Postgres.
- **AI:** needs an AI key, at the server or the household.
- **Module:** a [module](platform.md#modules-everything-optional), with its own setup.
- **Later:** after 0.1.

### Recipes

| Feature | REFERENCE | Lands in | Changes |
|---|---|---|---|
| Recipes: photos, servings, times, sections, notes, source, rating | M1 | Core | |
| Scaling, fractions | M1 | Core | |
| Units | As written or grams | Core | **As written, US or metric, both ways,** with ml and °C (planned for M17) |
| Versions and restore | M1 | Core | |
| Tags: rename, merge, delete | Built | Core | |
| Search, filters and sorting in the address, cards or a list, endless scroll | Built | Core | Search and filters move to the server, so big libraries stay quick and the API can use them |
| Diet labels from ingredients, with corrections | Built | Core | Ingredient words per language |
| Goes with (pairings) | Built | Core | |
| "I made this", New badge | M14 | Core | |
| How did it go? (stars and notes) | M7 | Core | Turning a note into an edit is AI |
| Select and bulk actions, Recently deleted | M14 | Core | |
| Cook view: get ready, step ingredients, timers, text size, keeping your place, wake lock | M1 | Core | |
| Hands-free with the device's voice | M7, M10 | Core | Commands per language |
| Server voice (Kokoro or OpenAI) | M10 | Module | Kokoro behind a compose profile, not on by default |
| Swap an ingredient | M7 | AI | Also offered for a disliked food that can't just be left out: "zucchini instead of the mushrooms" |
| Tidy up, auto tidy, library runs, Review queue | M1 | AI | Tidy up also marks each ingredient as the main thing, safe to leave out, or swappable, so leaving out a dislike no longer leans on the recipe's name |
| AI photos | Built | Module | A few photo styles to choose from per household; the REFERENCE dark plate on white marble is the default |
| Nutrition from the site | M1 | Core | |
| Nutrition: USDA calculation, AI estimate, plan totals | M5 | Module | |
| Recipe costs and weekly budget | M13 | Module (stores) | Any currency |
| Recipe translations, step photos, meaning-based search | Later, maybe | **Later** | |

### Adding recipes

| Feature | REFERENCE | Lands in | Changes |
|---|---|---|---|
| Link import from recipe data (JSON-LD) | M1 | Core | Honest user agent; sites that block servers are left to the extension |
| Typed in | M1 | Core | |
| Several links at once | M14 | Core | Runs on the job runner |
| Text, photos, pages without recipe data | M1 | AI | Works with any model that can read images |
| Video links | M1 | Module | |
| Imports in your language | New | With translations (0.1) | **A setting** in Settings, You: AI imports are written in the person's language, translated, with the original language in the notes. Until then a recipe keeps the language it was written in |
| Mealie import | M1 | Core | **Also from a Mealie backup file,** so the server needn't reach Mealie |
| Paprika and schema.org imports | New | Core | |
| Tandoor import | New | **Later** | |
| Merran export and import | New | Core | |
| Share to Merran: Android share sheet and the iPhone Shortcut | M13 | Core | The Shortcut uses a key that can only share |
| Starter collections | M8 | Module (recipe sites) | **A rule per collection, not a list of links:** data files per language, open to contributions, each with a few hand-picked classics (checked weekly) and filled from the recipe sites' newest posts that fit; fitted to the household's tastes; Find more with AI |
| Follow recipe sites | M8 | Module (recipe sites) | Honest user agent, `robots.txt` respected; one shelf for the server, so a site is read once for every household |
| Discover with AI, finding recipes online in chat | M7, M8 | AI | Needs a model with web search |
| Browser extension: page import, right-click, list side panel | M6 | Module | WXT; Chrome, Edge and Firefox; connects through `/extension/connect`, which makes it a key with just what it needs; store listings with 0.1 |

### Planning

| Feature | REFERENCE | Lands in | Changes |
|---|---|---|---|
| Week view, meals chosen per household, first day of the week | M3 | Core | |
| What's next (time of day) | Built | Core | |
| Fill the week, re-roll, Something else | M3 | Core | |
| Tastes and rules | M7 | Core | The rules apply without AI; the assistant offering to remember one is AI |
| **Leave it out: dislikes crossed off rather than ruled out** | New | Core | Each avoided food is an allergy, never, or leave it out, with who it's for. A dislike to leave out is crossed off the recipe and in the cook view, not bought, and not used from the pantry, unless it's in the recipe's name or the household says the recipe needs it. Nuts, dairy, gluten, eggs and meat can't be left out. Rules only; AI tidy up and swaps make it smarter later |
| Theme nights | M13 | Core | |
| Weekly autoplan | M8 | Core | |
| Select meals, Repeat last week, Clear the rest | M14 | Core | |
| **A pool of meals for the week** | Planned (M16) | Core | New |
| **Saying why for each suggestion** | Planned (M15) | Core | New. One reason builder for Fill the week, the autoplan, Today, the assistant and sale suggestions: on hand, needs using, a usual buy, not had lately, tastes, the night's theme, and sales when the stores module is on |
| Leaning on sales | M11 | Module (stores) | |
| **Deals worth having** (a sale judged against price history) | Planned (M15) | Module (stores) | New |
| AI-ranked suggestions | Later | **Later** | |

### Shopping and the pantry

| Feature | REFERENCE | Lands in | Changes |
|---|---|---|---|
| List from the plan: combining, converting, pantry subtracted, always on hand left off | M3, M4 | Core | |
| Every-week items, typed items, aisles remembered, check off, put away | M3 | Core | Aisles per country |
| Lists by store | M9 | Core | Stores from the household's country |
| Shopping together: live list, who's on it | M13 | Core | |
| Select on the list and pantry | M14 | Core | |
| Pantry: amounts, use soon, leftovers from skipped meals, cooking uses it up | M4 | Core | |
| **Fridge, freezer or cupboard** | Planned (M17) | Core | New |
| **Ran out of anything?** After cooking, a run through the recipe's ingredients to check off what's used up | New | Core | New. Asked with "How did it go?"; each checked food comes out of the pantry (and can go on the list), so the pantry stays right when cooking used more than the recipe said |
| **Usual buys** ("Milk? You last got some Oct 9") | Planned (M17) | Core | New. Learned from what's put away (a `purchases` record), offered when the list is made |
| Receipts into the pantry | M13 | AI | |
| Kroger: products, cart, prices, sales | M6, M11 | Module (stores) | A store adapter; banner names (Fry's, Ralphs...) come from Kroger, not the code |
| Costco and other link-only stores | M6 | Module (stores) | Any store with a search address, per country |
| **Buying by the package** (what's left of a 2 lb pack goes in the pantry and into suggestions) | Planned (M15) | Module (stores) | New |
| Walmart cart through the extension | M6 | Module (stores) | **Experimental, off by default,** still stopping at Walmart's bot check |
| Barcode scanning | Later, maybe | **Later** | |

### Everywhere

| Feature | REFERENCE | Lands in | Changes |
|---|---|---|---|
| Today | Built | Core | |
| Phone, tablet and desktop layouts, stacked full-width cards | Built | Core | |
| Three palettes, light and dark, per person | M0 | Core | |
| Settings in tabs, a list on phones | Built | Core | Server, household and person levels made clear |
| **Belonging to more than one household, with a switcher** | New | Core | See [platform.md](platform.md#more-than-one-household) |
| The assistant: chat with tools, proposals, page context, saved chats | M2, M7 | AI | Any provider with tools |
| **The install button** | Planned (M12) | Core | New |
| **Notifications and prep reminders** (thawing, marinating, time to start cooking) | Planned (M12) | Module | New. Prep found by rules, and by the small AI model when there is one |
| **Working offline** (recipes opened, this week's plan, the list) | Planned (M17) | Core | New |
| **Webhooks** | Later, maybe | Core | New. See [platform.md](platform.md#webhooks) |
| **MCP server** | Dropped in REFERENCE | Core | New, now that API keys exist. See [platform.md](platform.md#mcp-server) |
| Update badge | Built | Core | From GitHub releases |
| **Guided tours, ⓘ explanations, a glossary and a Help menu** | New | Core | driver.js. See [platform.md](platform.md#help-and-guided-tours) |

## Not coming over

| REFERENCE | Instead |
|---|---|
| Building the image from the repo on every start | Prebuilt, signed images ([operations.md](operations.md#images)) |
| Fetching sites dressed as Chrome to get past bot blocks | An honest user agent, and the extension for sites that block servers |
| Every household on the server's AI keys | Server and household keys, with a policy ([platform.md](platform.md#whose-key-pays)) |
| Tokens with their owner's full rights | API keys with permissions, a household and an expiry ([platform.md](platform.md#api-keys)) |
| Drafts and sign-in states kept in memory | In the database, with an expiry |
| Postgres only, with the schema in Drizzle | SQLite or Postgres, with the schema in MikroORM entities ([stack.md](stack.md#sqlite-or-postgres)) |
| Hand-written sign-in, schedules and AI provider code | Better Auth, a proper job runner, AI SDK ([stack.md](stack.md)) |
| Prices in dollars, US units and aisles, "Fry's" in the code | Currency, units, aisles and stores by country |
| The `mise` and Nourvio names | Merran everywhere |

## Build order

Each phase ends with something that runs and can be tried, on `edge` images. 0.1 is released when all of them are done.

### Phase 0: Foundation

- The repo: pnpm workspace (`apps/server`, `apps/web`, `apps/extension`, `apps/docs`, `apps/telemetry`, `packages/shared`), with REFERENCE kept aside, read-only, until Merran had everything it did
- CI with every check in [open-source.md](open-source.md#keeping-the-code-healthy), Renovate, release notes drafted by Release Drafter, and `edge` images published to GHCR
- The settings schema and the module registry, with `GET /api/capabilities`
- Hono with OpenAPI routes, the generated client, `/api/docs`
- MikroORM entities with migrations generated for SQLite and Postgres, every test on both, and `merran db copy`; the job runner; the storage interface; the one fetch helper; the internal event stream
- pino logs, request ids, health checks, the Problems page, Sentry when a DSN is set
- i18next from the first string; locale, units and currency plumbing
- The web shell: TanStack Router and Query, shadcn on Base UI, the three palettes, `/styleguide`, the phone and desktop layouts
- The tour framework: driver.js styled to the palettes, tours registered per page and per role, steps skipped for modules that are off, what each person has seen saved, the ⓘ explanations and the Help menu. Each later phase adds the tours for its own pages.
- The docs site skeleton, and the compose file

**Done when:** a fresh `docker run` of the `edge` image, with nothing set, shows the setup page on SQLite; the same image does on Postgres; and CI is green with every check running on both.

### Phase 1: Accounts, households and keys

- Better Auth: setup code, sign-in, households with roles, invites, open sign-up and its limits, devices
- Belonging to more than one household, with the switcher
- Passkeys, two-step sign-in and OIDC behind their switches; SMTP for invites and resets; the reset command
- API keys with permissions and a household, and the connect flow the extension and Shortcut will use
- The scoped data layer and the generated isolation test
- The audit log; encrypted secrets with a rotatable master key

**Done when:** two households on one server can't see each other's anything (proved by the generated tests), one person moves between both with the switcher, and a read-only API key works from the API reference page.

### Phase 2: Recipes

- Recipes, ingredients, steps, sections, the parser, scaling, units both ways
- Link import from recipe data, typed in, several links at once
- Photos, versions, tags, diet labels, pairings, New, Recently deleted, select
- Server-side search and filters
- The recipe page and the cook view, timers, and hands-free with the device's voice
- Merran export and import; Mealie (API and backup file) and Paprika imports
- Share to Merran (Android and the Shortcut)

**Done when:** a Mealie library comes in with photos, a recipe is cooked start to finish on a tablet, and a household export imports cleanly into another server.

### Phase 3: Plan, list and pantry

- The week, the pool of meals, what's next, Fill the week with a reason for each pick, theme nights, tastes and rules (dislikes left out rather than ruled out), the autoplan
- The list from the plan, every-week and always-on-hand items, usual buys, aisles, lists by store, live updates
- The pantry with fridge, freezer and cupboard, use soon, leftovers, put away, cooking uses it up
- Today, and the install button

**Done when:** a week plans itself on schedule and says why for each meal, its list leaves off what's in the pantry and offers the usual milk, and two phones shop the same list live. From here the maintainer's household uses Merran day to day.

### Phase 4: AI

- Providers through AI SDK: Anthropic, OpenAI, OpenAI-compatible, Google; the model catalog
- Server and household keys, the server admin's policy, monthly limits, usage by key source
- AI import (text, photos, pages), tidy up and the Review queue, swaps, cooking notes into edits
- Smarter leave it out: tidy up marks which ingredients a recipe can't do without, and swaps offer a stand-in for a dislike
- The assistant with its tools and proposals, web search, Discover
- Receipts

**Done when:** a second household on the server, with no access to the server's keys, adds its own key and uses the assistant, and the server admin's spend page shows only their own household on the server's keys. Import works with Claude, OpenAI and a local Ollama model.

### Phase 5: Modules

In this order:
1. Video import
2. Nutrition (USDA and AI)
3. Recipe sites and starter collections
4. AI photos and the server voice (Kokoro, OpenAI)
5. The browser extension (WXT)
6. Stores: the adapter, Kroger, link-only stores, prices and sales, deals worth having, buying by the package, costs and budget
7. Foods: one vocabulary of foods for recipes, the list, the pantry, nutrition and the stores ([foods.md](foods.md))
8. The Walmart cart (experimental), which searches by the foods' names

**Done when:** every REFERENCE feature works in Merran. The REFERENCE done-whens for M5, M6, M8, M10 and M11 pass, with the Walmart cart turned on.

### Phase 6: Around the house

- Notifications and prep reminders (M12)
- Working offline: recipes opened, this week's plan and the list, with check-offs catching up later (M17)
- Webhooks
- The MCP server

**Done when:** at 8 a.m. a phone says to take the chicken out for tonight, the list works in a store with no signal and catches up after, Home Assistant hears about a change to the list, and Claude Desktop adds milk to the list.

### Phase 7: Release 0.1

- The telemetry question at setup, and the telemetry receiver with its totals page
- The docs site complete, with install, configuration, use, AI and API guides
- The demo, the Unraid template, the restore test in CI, Chrome and Firefox store listings
- The `@merran` npm scope claimed, and the app store names checked (see [README.md](README.md#open-questions))
- `SECURITY.md` and the other project files, then the 0.1 release and announcement

**Done when:** someone who's never seen Merran installs it from the docs, moves their Mealie library over, and plans and shops a week, in under an hour.

## After 0.1

- **On the way to 1.0:** fixes and requests from early users, translations open on Weblate, and the API and export format promised stable.
- **Later:** household-owned API keys; OAuth so the ChatGPT and Claude apps can connect to the MCP server; AI-ranked suggestions; the providers' batch APIs for library runs; meaning-based search with `pgvector`; recipe translations; step photos; barcode scanning; a Tandoor importer; OpenTelemetry; a Helm chart; a limited role for kids.
