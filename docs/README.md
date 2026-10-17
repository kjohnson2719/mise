# Merran: the rewrite

Merran is a self-hosted meal planner for households, with an AI cooking assistant at its center: recipes, weekly plans, a shopping list, a pantry, nutrition and store connections, made for a phone or tablet on the kitchen counter. One server can host several households, and a person can belong to more than one.

It's a full rewrite of the app that was called Mise and then Nourvio, which these docs call the REFERENCE app. That app was a place to try ideas out, and most of them worked; Merran builds them again, properly, as an open-source project anyone can run. It sat in `apps/REFERENCE/` while Merran was built, and was removed once Merran had everything it did (it's in the repo's history before 0.1.0-alpha.1).

**Status:** alpha. Everything the REFERENCE app did is built, with much of the new work; releases start at 0.1.0-alpha.1, and 0.1.0 comes once the rest of [scope.md](scope.md) is done.

## What's different this time

- **Anyone can run it,** not just us: no hard-coded stores, currencies, units or hosting setup.
- **One container, nothing to fill in.** Merran runs on SQLite out of the box, like Mealie, and on Postgres for bigger servers.
- **Everything beyond the basics is optional.** The core needs nothing but Merran itself. AI, video import, nutrition, voice, stores, email, sign-in providers, error tracking, metrics and telemetry are modules that stay off until they're set up, and the app says what's missing instead of breaking.
- **The person running the server doesn't pay for everyone.** Each household can bring its own AI keys; the server admin decides who, if anyone, uses the server's.
- **A real API,** documented and versioned, with API keys that say what they can do. The web app and the browser extension use the same one. Webhooks tell other tools (Home Assistant, n8n) when things change, and an MCP server lets Claude Desktop, Claude Code and other AI apps work with a household's recipes, plan and list.
- **Nothing leaves the server unless the server admin turned it on.** Telemetry is opt-in and shows exactly what it sends; error tracking goes to the operator's own Sentry-compatible service, if any.
- **New people are shown around:** a short guided tour of each page, and an explanation a tap away for every Merran term.
- **Built for contributors and translators** from the first line: adapters for stores, importers and AI providers, translations from day one, one-command setup with sample data and a fake AI.

## Principles

1. **Works with nothing set up.** A fresh install is one container with nothing to fill in, and the core is useful with no keys at all.
2. **Off by default, on by choice.** Anything that costs money, calls out or needs another container is a module.
3. **Keys at the right level.** Server keys for the server; household keys for the household; personal API keys for each person, with only the rights they need.
4. **One API.** If the web app can do it, the API can.
5. **Households never see each other.** Enforced by a scoped data layer and tests generated from the schema, not by remembering.
6. **The AI proposes, people apply.** Carried over unchanged.
7. **Boring to run.** One image, one compose file, migrations on start with a backup first, signed releases.
8. **Honest on the internet.** Merran says who it is when it fetches pages, and doesn't try to get past bot blocks.

## The docs

| Doc | What's in it |
|---|---|
| [stack.md](stack.md) | Every layer reconsidered: what stays, what changes, and why |
| [platform.md](platform.md) | Modules and settings, accounts and households, API keys and the public API, AI keys and policy, jobs, files, export, isolation, security, languages |
| [export-format.md](export-format.md) | The household export: what's in the zip, and how an import treats what's there |
| [operations.md](operations.md) | Logs, error tracking, analytics and telemetry, what leaves the server, images, releases, backups, the demo |
| [open-source.md](open-source.md) | Name and license, contributing, CI, dependencies, security reports, docs site, funding, launch |
| [features.md](features.md) | Every feature with its importance and status, for the marketing and docs sites |
| [scope.md](scope.md) | Where each REFERENCE feature lands, what's not coming over, and the build order |
| [foods.md](foods.md) | One vocabulary of foods: names in every language, kinds of, brands, what Merran knows about each, and matching a line to its food |

The REFERENCE app's docs described each feature in detail; they're in the repo's history with it.

## Decisions so far

| Decision | Choice | Why |
|---|---|---|
| Name | Merran | Chosen October 15, 2026 |
| Rewrite or refactor | Rewrite, using REFERENCE for ideas | It was built to try things; open source needs cleaner foundations |
| Compatibility with REFERENCE | None needed | No data, names or schema carry over |
| License | AGPL-3.0-or-later | Kept from REFERENCE |
| Language and runtime | TypeScript on Node 24 LTS | Kept |
| Server | Hono with OpenAPI from Zod | Kept, plus a public API spec |
| Database | SQLite (the default) or Postgres 16+, like Mealie | A fresh install needs nothing; bigger servers can use Postgres |
| Schema | Defined in TypeScript with MikroORM 7 entities; migrations generated for both databases | One schema for both databases, never written in SQL |
| Sign-in | Better Auth (households as organizations, API keys, passkeys, 2FA, OIDC) | Security-critical code shared with a bigger project |
| Background work | A small job runner of our own on a `jobs` table, with `croner` schedules | Durable jobs on either database; pg-boss is Postgres only |
| AI | AI SDK 6 behind a thin Merran layer; Anthropic, OpenAI, OpenAI-compatible, Google | Households bring many kinds of keys |
| Web | React 19, Vite, TanStack Router and Query, shadcn/ui on Base UI, Tailwind v4 | Mostly kept; typed routes and the current shadcn default |
| Translations | i18next from the first string, Weblate later | Far cheaper than retrofitting |
| Extension | WXT, for Chrome, Edge and Firefox | One codebase for every browser |
| Guided tours | driver.js, with tours per page and role, ⓘ explanations and a glossary | New people learn what everything is and means |
| Distribution | Signed multi-arch images on GHCR, a compose file | Replaces building from the repo |
| Releases | Semantic versions; notes drafted by Release Drafter from typed pull request titles | Notes and images from every release, like Mealie's |
| Telemetry | Opt-in, a daily anonymous summary, shown before it's sent, to a small receiver the project runs | Useful to the project, safe for self-hosters |
| Error tracking | The operator's own Sentry-compatible DSN, plus a built-in Problems page | Nothing sent to the project |
| Starter collections | A rule per collection plus a few classics, filled from the recipe sites' feeds; shipped with releases, never fetched from the project | Decided October 16, 2026: they stay fresh without hardcoded links or calling home |

Decided with the user on October 15, 2026, from the plan's open questions:

| Decision | Choice |
|---|---|
| Who uses the server's AI keys on a fresh install | Only the server admin's own household. The admin can give other households access, with a monthly limit; everyone else brings their own key. |
| The first public release (0.1) | **Everything the REFERENCE app has, plus new work:** the platform (household AI keys, API keys, SSO, export, translations, units both ways), the pool of meals (M16), fridge, freezer or cupboard and usual buys (M17), working offline (M17), reminders and the install button (M12), smarter deals and saying why (M15), and webhooks and an MCP server. It's the first release; until then there are only `edge` images. |
| A paid hosted version or a proprietary edition | No. Contributions use a **DCO** (signed-off commits), not a CLA. |
| Filling the Walmart cart through the extension | In the public build as an **experimental** part of the stores module, **off by default**, still stopping at Walmart's bot check |
| Belonging to more than one household | **Yes, with a household switcher in 0.1** (say, your household and your parents') |
| Primitives under shadcn/ui | Base UI |
| AI-written contributions | Welcome, with the parts an AI wrote named in the pull request, and the contributor answerable for every line |
| A telemetry receiver | Yes: small, opt-in, its code public, with a public totals page |
| The REFERENCE app and its docs | Kept in `apps/REFERENCE/` while Merran was built, removed once Merran had everything it did |
| The database | SQLite or Postgres, like Mealie, with SQLite the default |
| The schema | Defined in TypeScript, not SQL |
| Showing new people around | Guided tours with driver.js |

## Open questions

| # | Question | Recommendation | Affects |
|---|---|---|---|
| 1 | Is the name free, and where does Merran live? | **Checked October 15, 2026:** no MERRAN trademark in the US or EU registers and no product by that name. GitHub `merran` is a dormant personal account, so the org is **`merran-app`** (repo `merran-app/merran`, images `ghcr.io/merran-app/merran`), and the domain is **`merran.app`**. Still to do: claim the `@merran` npm scope (free), and use `merran.app` as the Bluesky handle. The one near match is a pending US application for MERRIN (one letter off, software, an AI parenting app); worth a real trademark check before filing a mark of our own. | Phase 7 |
