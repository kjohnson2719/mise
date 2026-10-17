# Features

Every Merran feature in one list, for the marketing site and the docs site. Each one has an importance and a status, so the site can lead with what matters and only claim what's built.

Keep this page current: when a feature is built, changed, planned or dropped, update its row here in the same change. [scope.md](scope.md) says where each feature lands and when; this page says what it is in words a visitor would use.

**Importance**

- **Headline:** a reason to pick Merran. Leads the home page.
- **Key:** worth its own section or screenshot on a feature page.
- **Detail:** belongs in a feature list or the docs, not a headline.

**Status** (as of October 16, 2026)

- **Built:** works in the rewrite today.
- **Building:** started in the rewrite, not finished.
- **Planned:** coming in 0.1, not started.
- **Later:** after 0.1.

## Running it

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Self-hosted and open source (AGPL-3.0) | Headline | Built | Your recipes stay on your server |
| One container, nothing to fill in, SQLite by default | Headline | Built | `docker run` and the setup page appears |
| Postgres for bigger servers | Detail | Built | Same image |
| Move a server from SQLite to Postgres (`merran db copy`) | Detail | Planned | |
| Everything beyond the basics is an optional module | Key | Built | Off until set up; the app says what's missing instead of breaking |
| Health checks for Docker and uptime monitors | Detail | Built | |
| Error tracking to your own Sentry, GlitchTip or Bugsink | Detail | Built | Off unless a DSN is set |
| Opt-in telemetry that shows exactly what it sends | Key | Built | Nothing leaves the server unless the admin turns it on |
| The telemetry receiver and public totals page | Detail | Planned | |
| Background jobs that survive restarts, with a jobs page | Detail | Built | |
| Problems page for the server admin | Detail | Planned | |
| Update badge when a new release is out | Detail | Planned | |
| Prebuilt, signed images; releases with notes | Detail | Planned | Only `edge` images so far |
| Backups before migrations, and a restore test | Detail | Planned | |
| Unraid template, docs site, public demo | Key | Planned | |

## Accounts and households

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Several households on one server, kept fully apart | Headline | Built | Proved by tests generated from the schema |
| Belonging to more than one household, with a switcher | Key | Built | |
| First-run setup with a code from the log | Detail | Built | |
| Invite links, roles, open sign-up (off by default) | Key | Built | |
| Export your own account's data | Detail | Built | |
| Passkeys | Key | Planned | |
| Two-step sign-in | Detail | Planned | |
| Single sign-on (OIDC) | Key | Planned | |
| Email for invites and password resets (SMTP) | Detail | Planned | |
| Audit log; secrets encrypted with a rotatable key | Detail | Planned | Settings' secrets are already sealed |
| A limited role for kids | Detail | Later | |

## Recipes

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A recipe library: photos, servings, times, sections, notes, source, rating | Headline | Built | |
| Scaling | Key | Built | |
| Units as written, US or metric, both ways | Key | Built | Per device |
| Versions, with restore | Detail | Built | |
| Tags: rename, merge, delete | Detail | Built | |
| Fast search, filters and sorting, even in big libraries | Key | Built | On the server; tags picked from a searchable list (a bottom sheet on a phone), filters on one row |
| Diet labels worked out from the ingredients, with corrections | Key | Built | |
| Goes with: pair recipes, like chicken with any of your sauces | Key | Built | |
| "I made this", and a New badge for ones you haven't cooked | Detail | Built | |
| How did it go? Stars and notes after cooking | Key | Built | |
| Select and act on many recipes; Recently deleted for 30 days | Detail | Built | |
| Nutrition from the recipe's site | Detail | Built | |
| Nutrition worked out from USDA data or by AI, with plan totals | Key | Built | Module: a free USDA key; AI estimates without one. Worked out by itself when a recipe's saved, and for the whole library. The foods Merran knows have their USDA food checked by hand, so they aren't searched for |
| What recipes cost, and a weekly budget, in any currency | Key | Built | Module (stores): each line's share of its product's price at the household's Kroger store (by weight or volume, a baking staple's density, or a can as one can), shown on recipes and cards when three in five lines have a price; the Plan page says what the week comes to against the budget, and Fill the week and the autoplan pick recipes that fit what's left of it more |
| AI photos in a consistent style for recipes without one | Key | Built | Module, off by default; an OpenAI or Google key; four styles per household, one by itself for each new recipe, or the whole library |
| Recipe translations, step photos, meaning-based search | Detail | Later | |

## Cooking

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Cook view for the kitchen counter: get ready, ingredients per step, big text | Headline | Built | |
| Kitchen timers from the steps | Key | Built | |
| Screen stays on, and your place is kept | Detail | Built | |
| Hands-free: steps read aloud, voice commands | Key | Built | Uses the device's voice |
| A better server voice (Kokoro or OpenAI) | Detail | Built | Module; each step read once and kept; the device's own voice when it can't |
| Swap an ingredient you're out of | Key | Built | AI; for this time or saved to the recipe, with the steps rewritten to match, in cook view too |
| Turn a cooking note into a suggested edit | Detail | Built | AI |

## Adding recipes

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Import from a link | Headline | Built | Honest user agent |
| Type one in | Detail | Built | |
| Paste many links at once | Key | Built | Runs in the background |
| Import from text, photos, PDFs, or pages with no recipe data | Headline | Built | AI; any model that reads images and PDFs |
| Move from Mealie: a backup file, an export, or connecting to it | Headline | Built | |
| Import from Paprika | Key | Built | |
| Merran export and import of a whole household | Key | Built | |
| Share to Merran from Android's share sheet or an iPhone Shortcut | Key | Built | Links, pages, photos, screenshots and PDFs; on Android, once installed from Merran's https address |
| Tidy up: AI fixes a recipe, you review each change | Key | Built | AI; also marks which ingredients a recipe can do without, and names the food of lines Merran doesn't know, for the list |
| Video links (TikTok, YouTube, Instagram, Facebook) | Headline | Built | Module, on by default: yt-dlp and ffmpeg (in the image) and AI; listens to videos without captions on an OpenAI key |
| Follow recipe sites and see their newest recipes | Key | Built | Module, on by default; respects `robots.txt`; on Recipes and Today too |
| Starter collections that fill themselves from recipe sites, fitted to your tastes | Key | Built | Module, on by default; a rule and a few classics per collection, in data files per language; Find more with AI |
| Imports in your language: a recipe from another language translated as it comes in | Key | Planned | AI; a setting, with the app's translations |
| Discover: find recipes for any theme with AI | Key | Built | AI, with web search; each page is opened first, so they all import |
| Browser extension: import a page, right-click, the list in a side panel | Key | Built | Chrome, Edge, Firefox; even sites that turn servers away or need a sign-in; in the stores with 0.1 |
| Tandoor import | Detail | Later | |

## Planning

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A week of meals, with the meals your household eats | Headline | Built | Breakfast, lunch and dinner each optional |
| A pool of meals for the week, cooked in any order | Key | Built | |
| What's next: tonight's dinner, this afternoon's lunch | Key | Built | |
| Fill the week, re-roll, Something else | Headline | Built | No AI needed |
| Saying why for each pick: on hand, needs using, not had lately... | Headline | Built | With the stores module, what's on sale too |
| Tastes and rules | Key | Built | A recipe Merran can't read, like one kept in Arabic, isn't suggested to a household with allergies, and says why |
| Leave it out: dislikes crossed off a recipe instead of ruling it out | Headline | Built | Allergies are never left to chance |
| Theme nights: tacos on Tuesday, eat out on Friday | Key | Built | |
| A week that plans itself on a schedule | Headline | Built | |
| Select meals, repeat last week, clear the rest | Detail | Built | |
| Leaning on sales | Key | Built | Module (stores): Fill the week and the weekly autoplan pick recipes with real deals at the household's Kroger store more, as much as its Lean on sales says (off, a little, a lot), and say so; Recipes has an On sale filter |
| Deals worth having: a sale judged against price history | Key | Built | Module (stores): prices checked each morning and kept by day; each sale is the lowest in a while, a normal sale, or barely off what it usually costs, and only real deals count |
| AI-ranked suggestions | Detail | Later | |

## Shopping and the pantry

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A shopping list from the plan: combined, converted, pantry taken off | Headline | Built | One line per food however recipes name it (plain flour is all-purpose flour, chopped parsley is parsley, lemon wedges are lemons) and measure it (a head of garlic is ten cloves, a stick of butter half a cup, a cup of flour 120 g); names without how it's used or prepped ("to serve", "or vegetable oil", "large" on vegetables); a line naming more than one food is each of them ("salt and pepper", "½ tsp each thyme and oregano") |
| Every-week items and always-on-hand staples | Key | Built | |
| Sorted by aisle, and it remembers where things go | Key | Built | |
| A list for each place you shop | Key | Built | Lists are names and aisles, however the household sorts what it buys; the store is chosen for each thing (the two rows below) |
| Find any thing at any of your stores | Key | Built | Find on every thing on every list opens a menu of the household's stores (picked once in Settings, Household, Your stores): Fry's or Walmart's product picker, kept for that food there, or any other store's search; the extension's side panel has a Find at picker of them |
| One Send that splits the list across your stores | Key | Built | Module (stores): each thing goes to the store it's mapped to, asks when it's mapped to more than one, and the rest go to one store; then Fry's and Walmart each review and send their part |
| Shopping together: the list updates live on every phone | Headline | Built | |
| Usual buys: "Milk? You last got some Oct 9" | Key | Built | |
| A pantry: amounts, use soon, leftovers, cooking uses it up | Headline | Built | |
| Ran out of anything? Check off what you used up after cooking | Key | Planned | With "How did it go?": the recipe's ingredients in a list, each one checked comes out of the pantry and can go on the list |
| Put away what you bought in one tap | Detail | Built | |
| Select and act on many list or pantry items | Detail | Built | |
| Fridge, freezer or cupboard | Detail | Planned | |
| Receipts into the pantry: looked over, then off the list | Key | Built | AI; a photo, screenshots, a PDF or pasted text, shared from Android or an iPhone, or sent to the assistant |
| Kroger stores (Fry's, Ralphs...): products, send the cart, prices, sales | Key | Built | Module (stores), with the server admin's Kroger developer app: a store by ZIP code, one linked account for the household, Merran's pick and how many for each thing, today's price and sale, sent to the cart by barcode |
| What the list costs, and the deals on it | Key | Built | Module (stores): each thing left on the list for Kroger priced for the packs needed (~ when how many is a guess), from the product kept for it and the last price seen; what a real deal saves under its price, and what it's for on one line under the name; each list's card says about what it comes to and what the sales save |
| Costco and any store with a search page | Detail | Built | Find any thing on its site, in the app and the extension, from the household's stores; stores by country |
| Buying by the package: the rest of a 2 lb pack goes in the pantry | Key | Built | Module (stores): what was sent to the Kroger cart is put away as the packs bought, with the meals' share set aside and the rest there to use |
| Every food known by any of its names: brands, regional names (plain flour, coriander leaves), kinds of (a green bell pepper is a bell pepper), a household's own "same as" | Key | Built | [foods.md](foods.md); one vocabulary for recipes, the list, the pantry, nutrition and the stores; 705 foods so far, with what a cup and one of each weighs, how each keeps, what the store calls it and (for 625) its USDA food; a kind covers its food at home (green bell peppers for a bell pepper); Same as and Not the same on the list |
| Fill a Walmart cart through the extension | Detail | Built | Module (stores), experimental and off until the server admin turns it on: Walmart's part of Send on the list; the extension finds each thing and fills the cart in a Walmart tab of the person's own, Merran picks a product for each and keeps every price and what Walmart had, so Change offers other brands and sizes at once; it stops at Walmart's check that it's a person for them to finish, and carries on by itself after; a setup card for the extension that ticks itself off |
| Barcode scanning | Detail | Later | |

## The assistant and AI

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Bring your own AI key: Anthropic, OpenAI, Google, or OpenAI-compatible (Ollama) | Headline | Built | |
| The server admin doesn't pay for everyone: household keys, a policy, monthly limits | Headline | Built | |
| Usage and cost by key; warnings when a key runs low | Detail | Built | |
| A suggested model for each task | Detail | Built | |
| The AI proposes, people apply: a Review queue | Key | Built | |
| A cooking assistant to chat with, that can plan and edit with your OK | Headline | Built | AI; knows the recipe or week on screen, and offers changes as cards to apply |
| Show the assistant a photo: is it done, is the sauce thick enough? | Key | Built | AI; any model that reads images; take one with a phone's camera or a computer's webcam |
| Send the assistant a recipe as a PDF or photo, and it drafts it for your library | Key | Built | AI; any model that reads PDFs or images |
| Ask what to use instead, and get a swap to use this time or save | Detail | Built | AI |
| Finding recipes online in chat | Key | Built | AI, with web search |

## Everywhere

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Today: the next meal, the rest of the week, ideas for tonight | Headline | Built | |
| Made for phone, tablet and desktop | Key | Built | |
| Install to the home screen | Detail | Built | |
| Three palettes, light and dark, per person | Detail | Built | |
| Settings for the server, the household and you, kept apart | Detail | Built | |
| Notifications and prep reminders: thaw the chicken, start the marinade | Key | Planned | Module |
| Works offline: recipes you've opened, this week's plan, the list | Key | Planned | |
| Guided tours, ⓘ explanations, a glossary and a Help menu | Key | Planned | |
| Translations, with units, aisles, stores and currency by country | Key | Planned | |

## For developers and integrations

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A documented public API (OpenAPI), with a reference page | Headline | Built | The web app uses the same API |
| API keys with permissions, one household, rate limits | Key | Built | |
| Live events stream | Detail | Built | |
| Webhooks for Home Assistant, n8n and others | Key | Planned | |
| MCP server for Claude Desktop, Claude Code and other AI apps | Headline | Planned | |
| OAuth so the ChatGPT and Claude apps can connect | Detail | Later | |
| Household-owned API keys; OpenTelemetry; a Helm chart | Detail | Later | |
