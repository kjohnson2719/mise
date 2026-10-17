# Open source

What it takes to run Merran as a public project: the name and license, how people contribute, keeping the code and its dependencies healthy, docs, and launch.

## Name, license and brand

- **Name:** Merran. A check on October 15, 2026 found no MERRAN trademark in the US or EU registers and no product by that name; the closest is a pending US application for MERRIN (software, an AI parenting app), worth a real trademark check before filing a mark of our own.
- **Where it lives:** the GitHub organization `merran-app` (`merran` is a dormant personal account), the repo `merran-app/merran`, images at `ghcr.io/merran-app/merran`, the site at `merran.app`, and the `@merran` npm scope (free, still to claim).
- **License:** AGPL-3.0-or-later, as the REFERENCE app chose. Anyone can run, change and share it; anyone running a changed copy for others over a network must offer its source. The browser extension and the telemetry receiver use the same license.
- **Docs:** CC BY 4.0, so others can reuse them with credit.
- **The name and logo aren't covered by the AGPL.** A short `TRADEMARK.md` says forks are welcome but shouldn't be published as "Merran" in a way that confuses people.

## Contributions

- **A DCO, not a CLA** (decided October 15, 2026): each commit is signed off ("I have the right to contribute this", `git commit -s`), checked by a DCO bot. A CLA would only matter for relicensing, and there's no paid hosted version or proprietary edition planned. The AGPL still lets anyone, the maintainer included, run Merran for others.
- **Files in the repo:**

| File | What it covers |
|---|---|
| `README.md` | What Merran is, screenshots, a two-minute install, links to the docs |
| `CONTRIBUTING.md` | Setting up, the commands, how to send a change, commit messages, the DCO |
| `CODE_OF_CONDUCT.md` | Contributor Covenant |
| `SECURITY.md` | How to report a vulnerability privately, and what happens next |
| `SUPPORT.md` | Where to ask questions (Discussions), and what issues are for |
| `GOVERNANCE.md` | Who decides: the maintainer for now, and how that could change |
| `PRIVACY.md` | What Merran sends where (from [operations.md](operations.md#what-leaves-the-server)) |
| `TRADEMARK.md` | Using the name and logo |
| `CHANGELOG.md` | Written by release-please |
| `.github/` | Issue forms (bug with diagnostics, store request, importer request), a pull request template, `CODEOWNERS`, `FUNDING.yml`, Renovate and workflow files |

- **Issues are for bugs; ideas go to Discussions,** with a template that asks what problem it solves. Popular ideas move to the public roadmap.
- **A public roadmap** on a GitHub Project board, and labels by area (`area:recipes`, `module:stores`) and for newcomers (`good first issue`, `help wanted`).
- **AI-written contributions** (decided October 15, 2026): Merran itself is built with Claude, so they're welcome, but the contributor must understand and stand behind every line, and the pull request template asks which parts an AI wrote.

## A good first hour for contributors

- **One command to start:** `pnpm install`, then `pnpm dev`, which starts the app on SQLite (no Docker needed) with a sample household (recipes, a week planned, a list) already signed in. `pnpm dev:postgres` does the same on Postgres in Docker.
- **No keys needed:** a fake AI provider gives canned but realistic answers, so the assistant, import and tidy-up can be worked on for free. Real keys are optional.
- **A dev container** for VS Code and Codespaces, for people who'd rather not install Node.
- **Guides for the common additions:** a store, an importer, an AI provider, a language, a guided tour. Each comes with a test template.
- **`/styleguide`** stays, showing every component in every palette.

## Keeping the code healthy

CI runs on every pull request:

| Check | Why |
|---|---|
| Typecheck, lint, format | The basics |
| knip | No unused files, exports or dependencies |
| Unit and route tests on SQLite in memory | Fast, on every push |
| The same tests on Postgres 16 and 18 | Everything works on both databases |
| Household isolation test, generated from the schema | No household-owned table without one (see [platform.md](platform.md#keeping-households-apart)) |
| Migration check | The entities and both databases' generated migrations agree, the migrations apply to a copy of the last release's database on each, and `merran db copy` moves the sample household from SQLite to Postgres |
| OpenAPI diff | No unannounced breaking change to the public API |
| Translation check | No user-facing string missing from the English file |
| Contrast check | Every palette still passes WCAG (carried over) |
| Playwright | A few real flows against the built image: set up, import a recipe, plan a week, make the list, cook; and every guided tour's steps find their element, on a phone and a desktop layout |
| Image build | The Docker image builds and starts healthy |
| Bundle size | The web app doesn't quietly double |

## Keeping dependencies healthy

- **Renovate:** weekly grouped updates, security updates at once, and auth packages (`better-auth`, `@better-auth/*`) always updated together.
- **GitHub's dependency review** flags risky new packages in pull requests; **CodeQL** scans the code.
- **Secret scanning with push protection** is on, and `mrn_` keys are registered as a custom pattern.
- **Workflows pin actions by commit hash.**
- **OpenSSF Scorecard** runs weekly and its badge goes in the README.
- The yt-dlp and ffmpeg downloads in the Dockerfile stay checksum-checked, as in the REFERENCE app.

## Security reports

- GitHub's private vulnerability reporting is on, and `SECURITY.md` explains it.
- A reply within a few days, a fix and release as soon as practical, and a published advisory crediting the reporter.
- The docs keep a short **threat model**: what Merran protects (households from each other, keys, the home network from imports) and what it doesn't (a server admin with shell access can read everything).

## Docs

The repo's `docs/` keeps the decision records (like this plan). The docs site is for people using Merran, running it and building on it, and it's where most of them will meet Merran first.

### The site

- **One site at `merran.app`, built with Starlight** (Astro). The landing page (the REFERENCE roadmap's "site that shows it off") is at `/` and the docs are under `/docs`. The landing page is a custom Astro page, not Starlight's splash template, built from the landing page mock-up: live demos of each screen, the three palettes, light and dark, and install in one command.
- **In the monorepo, as `apps/docs`,** so a pull request that changes behavior changes the docs in the same pull request. The pull request template asks whether it did.
- **Reference pages are generated, never written by hand:** settings, the CLI, the API, webhook events, MCP tools and the glossary all come from the code, so they can't drift from it.
- **A static site,** on Cloudflare Pages or GitHub Pages, with page counts and no cookies (see [operations.md](operations.md#3-the-projects-own-websites)).
- **CC BY 4.0,** said in the footer, with an **Edit this page** link on every page.
- **When:** the skeleton in phase 0, each phase adding the pages for what it built, and the complete site with 0.1 (see [scope.md](scope.md#build-order)).

### Sections

| Section | What's in it | Where it comes from |
|---|---|---|
| **Get started** | What Merran is and what it needs; installing it (Compose, `docker run`, Dockge or Portainer, Unraid); the setup code on first run; inviting people | Written |
| **Run it** | SQLite or Postgres, and moving between them; reaching it from outside (Cloudflare Tunnel, Tailscale, Caddy, Traefik, Nginx Proxy Manager); updating; backups and restore; what leaves the server; error tracking; the Problems page and troubleshooting | Written, from [operations.md](operations.md) |
| **Configure** | Every setting: its key, its env var, its default, what it does, and whether setting it in `.env` locks it in the app | Generated from `BOOT_SETTINGS` in `apps/server/src/core/config.ts` and each module's settings |
| **CLI** | `merran rotate-secret`, `merran db copy` and the rest, with how to run them in Docker | Generated from the command list in `apps/server/src/cli/index.ts` |
| **Use** | A guide per area: recipes, the plan, the list, the pantry, cooking, the assistant, stores, households | Written, with screenshots |
| **AI** | Getting keys, whose key pays and monthly limits, what things cost, which local models work | Written, from [platform.md](platform.md#ai) |
| **API and integrations** | Below | Mostly generated |
| **Contribute** | Architecture; the conventions (route folders, one route per file); adding a store, importer, AI provider or language; the DCO | Written |
| **Reference** | The glossary, the changelog, the threat model, privacy | The glossary from the ⓘ explanations (see [platform.md](platform.md#help-and-guided-tours)); the changelog from release-please |

### The API section

For anyone building on Merran: scripts, Home Assistant, n8n, the iPhone Shortcut and AI apps. The API itself is in [platform.md](platform.md#the-public-api).

1. **Start here:** one page from nothing to a working call. Make a key (Settings → You → API keys), send it as `Authorization: Bearer mrn_…`, and check it with `GET /api/auth/api-keys/current`. Then what holds everywhere:
   - permissions by area, read or read and write
   - a key works in one household
   - 300 requests a minute per key
   - every error is `{ error: { code, message, fields? } }`
   - lists are paged with cursors, and long work returns a job to follow
   - the promise: no version in the address, changes allowed during 0.x, and from 1.0 nothing is removed without a deprecation first
2. **Reference:** generated from `apps/server/src/http/openapi/openapi.json` by the `starlight-openapi` plugin, so it matches the site and shows up in its search. It's grouped by the spec's tags, and each route shows the key permission it needs. The **Try it** button stays on each server's own `/api/docs` (Scalar), since the docs site has no Merran to call; the reference links there, and to the demo's.
3. **Webhooks:** every event with a sample payload; checking a delivery's signature in the Standard Webhooks format, with short JavaScript and Python examples; retries, pausing and **Send a test**; and why private addresses need the server admin's OK. The events go in the spec's `webhooks` section (OpenAPI 3.1), so their pages are generated like the routes'.
4. **Live events:** `/api/events`: what arrives, reconnecting, and the permission it needs.
5. **MCP:** connecting Claude Desktop, Claude Code and other clients with a key (the **Use with an AI app** setup); what proposals and the Review queue mean for changes an outside AI makes; and the list of tools, generated from the MCP server's tool definitions.
6. **Examples to copy:** Home Assistant (a sensor for tonight's dinner, adding to the list from an automation, reacting to a webhook), curl from a shell, an n8n flow, and the iPhone Shortcut. If a typed client is published on npm under `@merran`, it gets a page here too.

### Keeping the spec complete

The generated reference is only as good as the spec. A check on October 15, 2026 found 76 operations with gaps: 7 had an operation id (all Better Auth's), 17 had examples, key permissions were only written in prose and checked separately in each handler, and Better Auth's 11 routes kept its own wording. They were fixed the same day, and tests keep them fixed, so a new route can't skip any of it.

| Rule | How | Checked by |
|---|---|---|
| Every route has a summary, and an `operationId` of its own (`listRecipes`, `createApiKey`), for stable links in the reference and method names in a generated client | Set on each route | `apps/server/src/http/routes.test.ts`, and `apps/server/src/http/openapi/document.test.ts` for the whole published file |
| Every JSON body and success answer has an example | Set on the shared schemas, from one sample household in `apps/server/src/http/schemas/examples.ts` (the Riveras: Sam, Lemon Chicken, a Home Assistant key) | `routes.test.ts` checks each example against the route's own schema; the compiler checks them too |
| A route open to API keys says which permission they need | `...openToKeys("recipes", "read")` on the route sets its `security`, puts `x-merran-permission: recipes:read` in the spec, and hands the same permission to `inHousehold()`, so the two can't disagree. The sentence in each description is written from it, for reference pages that don't show extensions. Routes without it refuse keys; `GET /api/auth/api-keys/current` is the one open to any key. | `routes.test.ts`; and `apps/server/src/http/middleware/auth.test.ts` sends a key with no permissions to every such route, which must refuse it by name |
| Better Auth's routes are described in Merran's words (`setActiveOrganization` is `switchHousehold`) | `BETTER_AUTH_ENDPOINTS` in `apps/server/src/http/routes/auth/better-auth.ts`, over what Better Auth says | `document.test.ts` |
| Webhook events are in the spec's `webhooks` section | Added as webhooks are built | Not yet: the section is empty until then |

### Across the site

- **Search** with Pagefind, which comes with Starlight.
- **Screenshots** taken by a Playwright script from the demo household (see [operations.md](operations.md#a-public-demo)), in light and dark, and taken again each release, so no page shows an old screen.
- **One version** of the docs until 1.0, following the latest release; anything only on `edge` says so. Versioned docs can come with 1.0, if old majors need them.
- **CI** builds the site on every pull request, checks every link, and fails when a generated page is out of date, as it already does for `openapi.json`.

## Funding

- GitHub Sponsors (and Open Collective, if others join as maintainers) to cover the domain, the demo and the telemetry receiver.
- No paid features, no paid hosted version and no proprietary edition.

## Launch

1. **While building:** only `edge` images, no releases and no announcement. The maintainer's own household uses Merran day to day as soon as phase 3 works, starting fresh.
2. **0.1, the first release:** everything the REFERENCE app does plus the new work in [scope.md](scope.md), with the docs site and the demo. Announced in r/selfhosted and the selfh.st newsletter.
3. **0.x releases** fix what early users find and add what they ask for.
4. **1.0:** the API and export format are promised stable, translations open on Weblate, and Merran goes on the awesome-selfhosted list (which wants a project's first release to be at least four months old).
