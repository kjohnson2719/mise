# Stack

The rewrite is a chance to pick each layer again. The REFERENCE app's choices mostly held up, so most stay. The changes are where a library now does safely what we wrote by hand (sign-in, AI providers), where running on SQLite as well as Postgres needs something different (the ORM, jobs), or where open source raises the bar (a public API, many AI providers, contributors, translators).

Versions are what's current in October 2026. Pin exact versions in the lockfile and let Renovate propose updates (see [open-source.md](open-source.md#keeping-dependencies-healthy)).

## At a glance

| Layer | REFERENCE | Merran | Change? |
|---|---|---|---|
| Language | TypeScript (strict) | TypeScript (strict) | Keep |
| Runtime | Node 24, running `.ts` directly | Node 24 LTS, running `.ts` directly | Keep (move to Node 26 once it's LTS and our dependencies support it) |
| Monorepo | npm workspaces | **pnpm workspaces** | Change |
| Server | Hono | Hono, with **`@hono/zod-openapi`** | Keep, add OpenAPI |
| Validation | Zod | Zod 4 | Keep |
| Database | Postgres 18 | **SQLite (the default) or Postgres**, like Mealie | Change |
| ORM | Drizzle (a Postgres schema in TypeScript) + `pg` | **MikroORM 7**: entities defined once in TypeScript, migrations generated for each database | Change |
| Database drivers | `pg` | `better-sqlite3` for SQLite, `pg` for Postgres | Add SQLite |
| Sign-in and accounts | Written by hand (scrypt, sessions, invites, tokens) | **Better Auth** | Change |
| Background jobs | `setInterval` loops and job tables | **A small job runner of our own** on a `jobs` table, with `croner` for schedules | Change |
| Live updates | Server-sent events | Server-sent events from an in-process event stream | Keep |
| AI | Our own interface over `@anthropic-ai/sdk` and `openai` | **AI SDK 7** (`ai`), behind a thin Merran layer | Change |
| Model prices | A table in the shared package | A bundled model catalog, refreshed each release, with overrides | Change |
| Web app | React 19 + Vite | React 19 + Vite | Keep |
| Routing | React Router | **TanStack Router** | Change |
| Server data | TanStack Query | TanStack Query | Keep |
| API client | A hand-written `api()` | **Generated from the OpenAPI spec** (`openapi-typescript` + `openapi-fetch`) | Change |
| Components | shadcn/ui on Radix, Maia style, Tailwind v4 | shadcn/ui on **Base UI**, Maia style, Tailwind v4 | Keep shadcn, change primitives |
| Icons and fonts | Hugeicons; Fraunces and Figtree from Fontsource | Same | Keep |
| Forms | A small `useForm` of our own | **react-hook-form** + Zod, with shadcn's Field components | Change |
| Guided tours | None | **driver.js** | New |
| Translations | None (English in the code) | **i18next** + `react-i18next`, i18next JSON messages, Weblate | New |
| Dates and time zones | Hand-rolled helpers | `date-fns` 4 + `@date-fns/tz` | Change |
| Home-screen app | A hand-written service worker | **`vite-plugin-pwa`** (Workbox, `injectManifest`) | Change |
| Working offline | None | TanStack Query's persister (IndexedDB) and a queue of changes made offline | New |
| Notifications | None | `web-push`, with Merran's own VAPID keys | New |
| Webhooks | None | Signed in the Standard Webhooks format, delivered by the job runner | New |
| MCP server | None | The official MCP TypeScript SDK (`@modelcontextprotocol/sdk`), Streamable HTTP | New |
| Logs | `console` | **pino** | New |
| Error tracking | None | **Sentry SDK**, off unless a DSN is set | New |
| Metrics | None | `prom-client`, off by default | New |
| Email | None | **nodemailer** (SMTP), optional | New |
| Files | A folder under `/data` | A storage interface: a folder (default) or S3-compatible | Change |
| HTML and feeds | cheerio | cheerio | Keep |
| Images | sharp | sharp | Keep |
| PDFs | unpdf | unpdf | Keep |
| Video | yt-dlp + ffmpeg in the image | Same, as an optional module | Keep |
| Browser extension | Vite, by hand, Chrome only | **WXT** (Chrome, Edge and Firefox) | Change |
| Tests | Vitest on PGlite | Vitest on SQLite in memory and on Postgres, MSW, and Playwright | Keep Vitest, add more |
| Lint and format | ESLint + Prettier | ESLint + Prettier, plus knip | Keep |
| Docs site | None | **Starlight** (Astro) | New |
| CI and releases | GitHub Actions; compose builds from the repo | GitHub Actions, release-please, images on GHCR | Change |

## What changes, and why

### SQLite or Postgres

Decided October 15, 2026: like Mealie, Merran runs on either.

- **SQLite is the default.** A fresh install is one container with nothing to fill in, and the whole database is one file in the data folder. That suits a household or two, a Raspberry Pi, and anyone who doesn't want to run a database.
- **Postgres is there for bigger servers:** several households, lots of people using it at once, or someone who already runs Postgres. Setting `DATABASE_URL` to a `postgres://` address is all it takes.
- **Moving from one to the other** is one command, not an export and import (see [operations.md](operations.md#moving-from-sqlite-to-postgres)).
- **Everything works on both.** No feature is Postgres-only. Where the two differ (search, mostly), Merran has one implementation for each behind the same interface, and every test runs on both.
- The rules that keep the schema portable are in [platform.md](platform.md#the-database).

### MikroORM: the schema in TypeScript

The schema is defined in TypeScript, never in SQL (decided October 15, 2026). Supporting two databases makes the choice of library matter:

- **Drizzle,** which the REFERENCE app used, already defines tables in TypeScript, but each table is declared for one database (`pgTable` or `sqliteTable`). Two databases would mean two schemas and two sets of queries.
- **MikroORM 7** (March 2026) defines each entity once with `defineEntity`, in TypeScript with full type inference, and runs it on SQLite or Postgres. It's the closest thing in TypeScript to what Mealie does in Python with SQLAlchemy and Alembic.

How we use it:
- **Entities** live in `apps/server/src/db/entities/`, one file per area. A column's type is written once (`p.string()`, `p.json<Nutrition>()`, `p.datetime()`) and MikroORM picks the right type for each database.
- **Migrations are generated, never written.** Change an entity, run `pnpm db:migration`, and MikroORM compares the entities with the database and writes a migration for SQLite and one for Postgres. They're committed and run at startup. The only hand-written steps are the few that have no entity form, like the search indexes.
- **Queries** go through MikroORM's entity manager and query builder, the same on both databases. For anything unusual there's typed Kysely underneath (`em.getKysely()`), with its types worked out from the entities, so even raw queries never need a type written by hand.
- **Better Auth** works with SQLite and Postgres through its built-in Kysely adapter. Its tables are declared as MikroORM entities too, so one migration history covers everything. Phase 0 confirms the two share a connection cleanly.

**Watch out for:** MikroORM has a smaller community than Drizzle or Prisma, and one lead maintainer. Its unit-of-work style (load, change, `flush()`) is different from Drizzle's query-at-a-time style, so `development.md` will show the patterns we use. Each request gets its own entity manager.

### pnpm instead of npm workspaces

- Faster installs, and strict: a package can only import what it lists, so a missing dependency fails on a contributor's machine instead of in someone's deploy.
- Catalogs keep one version of React, Zod and the rest across every package.
- It's what most open-source TypeScript monorepos use, so contributors will know it.
- No Turborepo to start. With four or five packages, pnpm's own `--filter` and `-r` are enough. Add it if CI gets slow.

### Better Auth instead of our own sign-in

Sign-in is the code most likely to hurt people if we get it wrong, and the code most worth sharing with a bigger project. Better Auth gives us, as plugins over our own database (SQLite or Postgres):

- email or username with a password, sessions, and rate limits
- **organizations**, which become households: members, roles and invitations
- passkeys and two-step sign-in (TOTP), off until someone turns them on
- single sign-on with OIDC (Authentik, Authelia, Keycloak, Pocket ID, Google and the like) through `@better-auth/sso`
- an admin plugin for the server admin

What we keep for ourselves: **API keys**, and **what each role may do.** Better Auth has an API key plugin, but its keys belong to a user or an organization and stand in for a session, while Merran's act as one person in one household. So keys are Merran's own (`services/auth/api-keys.ts`, decided October 15, 2026): a SHA-256 hash, permissions per area, expiry and a per-key rate limit. As for roles: Better Auth says who someone is and which household they're in; Merran's own service layer decides what they can touch, and every query is scoped to the household (see [platform.md](platform.md#keeping-households-apart)).

**Watch out for:** Better Auth moves quickly and had real security fixes in mid-2026 (SSO and invitation issues fixed in 1.6.11). Use 1.6.14 or later, update every `@better-auth/*` package together, and let Renovate flag security releases straight away.

### A job runner of our own instead of hand-rolled schedules

The REFERENCE app runs a dozen `setInterval` checks (autoplan every 5 minutes, prices every 15, feeds every 30, purges every 6 hours) plus its own tables for bulk imports and library runs, and anything only in memory was lost on a restart.

The well-known queues each need one particular store: pg-boss and Graphile Worker only run on Postgres, and BullMQ needs Redis. So Merran has a small runner of its own (a few hundred lines) on a `jobs` table, which works the same on both databases:

- jobs added in the same transaction as the change that needs them
- retries with backoff, a limit per kind ("two library runs at a time"), one at a time per key ("one nutrition run per recipe"), and a fair share per household
- schedules with `croner` (cron expressions in each household's time zone)
- work that survives restarts without each feature writing its own "carry on at startup" code
- on Postgres, jobs are claimed with `SKIP LOCKED`; SQLite has a single writer, so a plain transaction does

Merran runs as one process on either database, so the runner and the live event stream don't need to coordinate across servers. The same table holds what people see: "Importing 6 of 10", a library run's progress, Stop and Try again.

### AI SDK instead of our own provider layer

Households bringing their own keys means far more providers than Claude and OpenAI: Ollama and LM Studio at home, OpenRouter, Mistral, Gemini, anything with an OpenAI-style API. Writing and testing each by hand doesn't scale.

AI SDK 7 (current since June 2026; this said 6 when it was written) gives one way to do structured output from a Zod schema, tools, streaming, vision, image generation, transcription and speech across `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and the rest. Provider-specific features the REFERENCE app relies on are still reachable through provider options and provider tools: Claude's and OpenAI's web search, prompt caching, thinking and effort.

Merran keeps a thin layer on top (`server/src/ai/`) that features call: `extractRecipe()`, `runChat()` and so on. It picks whose key pays, which model runs the task, checks the model can do the job, enforces spending limits and records usage. Features never import the SDK, which also contains the SDK's yearly major-version churn to one folder.

### A model catalog instead of a price table

Each model's price per token, context size, and whether it takes images, tools or structured output, from a catalog generated at release time from a public dataset (such as models.dev), shipped inside the image so nothing is fetched at runtime. The server admin can correct a price. A model the catalog doesn't know (a local Ollama model, say) records its tokens with the cost left blank, and its abilities are found out by a quick test when it's added.

### TanStack Router instead of React Router

Merran keeps a lot in the address: recipe filters, Settings tabs, the week being viewed, `?entry=` in the cook view. TanStack Router validates search parameters with Zod and types every link, so a renamed route or parameter is a type error instead of a dead link. It's built for single-page apps like this one and works hand in hand with TanStack Query.

### A generated API client

The web app and the extension call the API through a client generated from the OpenAPI spec. That keeps us honest: the app uses the same public API anyone else would (see [platform.md](platform.md#the-public-api)), and a change that breaks the spec breaks the build.

### Base UI under shadcn/ui

shadcn/ui stays: we own the components and the Maia look. Since July 2026 shadcn starts new projects on Base UI (from the team behind Radix, Material UI and Floating UI) rather than Radix. Radix isn't going away, but a fresh codebase might as well start on the default the shadcn ecosystem is moving to (decided October 15, 2026). The look carries over; only the primitives underneath change.

### react-hook-form

The REFERENCE app's own `useForm` was small and fine, but contributors already know react-hook-form, and shadcn's form components are documented with it. Validation uses the same Zod schemas as the server.

### driver.js for guided tours

New people get short guided tours of each page, and every Merran term has an explanation a tap away (decided October 15, 2026). driver.js draws the highlight and the step popovers: it's small, MIT-licensed, has no dependencies and doesn't care which framework it runs in. Merran adds what driver.js leaves to the app: which tours exist, who sees which, skipping steps for modules that are off, translation, and remembering what each person has seen. See [platform.md](platform.md#help-and-guided-tours).

### Translations from the start

Retrofitting translations means touching every string in the app. Starting with i18next costs very little: every user-facing string goes through `t()`, messages use i18next's own JSON format (plurals as `_one` and `_other` keys, for "1 recipe" and "3 recipes"), and `t()` is typed from the English file, so the typecheck in CI fails on a string that isn't in it. English is the only language at launch; Weblate (free for open-source projects) opens it to translators once the wording settles. See [platform.md](platform.md#languages-units-and-regions).

### WXT for the extension

WXT builds one extension for Chrome, Edge and Firefox from the same code, handles the manifest per browser, reloads while developing, and zips builds for the stores. The REFERENCE extension's hand-made Vite setup was Chrome only.

### Images on GHCR instead of building from GitHub

The REFERENCE compose file built the app from the repo on every start. For everyone else, prebuilt images are faster, smaller to download, can be pinned to a version and verified. See [operations.md](operations.md#getting-merran).

## Considered and not chosen

| Option | Why not |
|---|---|
| Next.js, TanStack Start or React Router's framework mode | Server rendering doesn't help an app that's behind a sign-in and installed to the home screen. One Node process serving the built app and the API is the simplest thing to self-host. |
| Express | Better known, with more middleware, but built on Node's own request and response. Streaming AI replies and live events, Better Auth, AI SDK and the MCP SDK all speak web-standard `Request` and `Response`, which Hono uses directly and Express needs adapters for. Its types are added on, and an OpenAPI spec would mean describing every route a second time. Express 5 did fix async errors. |
| Fastify | The real alternative: mature, fast, with good OpenAPI and Zod support. It loses for the same reason as Express: Node-based requests and replies, so the same adapters. Hono also runs on Cloudflare Workers, so the telemetry receiver can use it too. |
| tRPC or oRPC | We want a public REST API with an OpenAPI spec for anyone to use. Hono with Zod OpenAPI gives typed routes and the spec in one go. |
| Postgres only | The REFERENCE plan's choice. Changed so a fresh install is one container with nothing to set up, like Mealie. |
| Drizzle | Tables are declared per database (`pgTable`, `sqliteTable`), so two databases would need two schemas and two sets of queries. |
| Prisma | Its schema is in Prisma's own language, not TypeScript, and a schema targets one database. |
| Kysely on its own | Queries carry across databases, but the schema and migrations would be written by hand. MikroORM gives us Kysely underneath anyway. |
| `node:sqlite` instead of `better-sqlite3` | Built into Node, but still a release candidate in Node 24, with a data bug and a security fix in 2026. Worth switching once it's stable. |
| Bun or Deno | Node 24 runs our TypeScript directly now, and it's what every library we use is tested on. |
| Auth.js, Lucia, or keeping our own | Lucia is retired, and Auth.js is weaker on passwords, organizations and API keys. Our own worked but would need passkeys, two-step sign-in, SSO and scoped API keys written and reviewed from scratch. |
| pg-boss or Graphile Worker | Postgres only. |
| BullMQ | Needs Redis, another container for every self-hoster. |
| LangChain or Mastra | Far more than we need. Our assistant is one agent loop over our own tools. |
| Biome | Fast and tidy, but Prettier's Tailwind class sorting and ESLint's React rules are what shadcn projects rely on. Worth another look later. |
