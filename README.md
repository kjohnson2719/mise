# Merran

A self-hosted meal planner for households, with an AI cooking assistant at its center: recipes, a weekly plan, a shopping list, a pantry, nutrition and store connections, made for a phone or tablet on the kitchen counter. One server can host several households, kept apart, and a person can belong to more than one.

**Status:** alpha. Releases start at `0.1.0-alpha.1`, and `0.1.0` comes once the rest of what's planned for it is done (see [docs/scope.md](docs/scope.md)). It's used day to day, but expect changes, and back up your data folder.

## What it does

- **Recipes:** import from a link, many links at once, a video (TikTok, YouTube, Instagram, Facebook), text, photos or a PDF; move over from Mealie or Paprika. Scaling, units as written or US or metric, diet labels from the ingredients, nutrition, what each recipe costs, and a cook view for the counter with timers and hands-free steps read aloud.
- **AI, with your own key:** Anthropic, OpenAI, Google or anything OpenAI-compatible (Ollama). It tidies recipes (you review each change), swaps ingredients you're out of, finds new recipes, reads receipts into the pantry, and an assistant can work with your recipes, plan and list. AI is optional; everything else works without it.
- **Planning:** a week of meals, or a pool to cook in any order; Fill the week from your tastes and rules, with the reason for each pick; theme nights; a week that plans itself on a schedule.
- **Shopping and the pantry:** a list from the plan, combined and converted, with what's at home taken off; sorted by aisle; live on every phone; usual buys; a pantry that cooking uses up.
- **Stores:** find anything at the stores you shop at; send the list to Kroger's stores (Fry's, Ralphs, King Soopers...) with prices, sales and a weekly budget; and, experimentally, fill a Walmart cart through the browser extension.
- **Everywhere:** a browser extension (import any page, the list in a side panel), Share to Merran from Android or an iPhone Shortcut, and a documented API with keys that say what they can do.
- **Yours:** one container on SQLite with nothing to fill in, or Postgres. Everything beyond the basics is an optional module, nothing leaves the server unless you turn it on, and telemetry is opt-in and shows exactly what it sends.

The full list, with what's built and what's planned, is in [docs/features.md](docs/features.md).

## Run it

One container, on SQLite, with everything in `./data`:

```bash
docker run -d --name merran -p 3000:3000 -v ./data:/data ghcr.io/merran-app/merran:next
```

Or with Docker Compose (Dockge, Portainer and the like work too), which also has Postgres, Kokoro (a voice for the cook view) and a Cloudflare tunnel ready behind profiles:

```bash
mkdir merran && cd merran
```

```bash
curl -fsSLO https://raw.githubusercontent.com/merran-app/merran/main/compose.yaml
```

```bash
curl -fsSL -o .env https://raw.githubusercontent.com/merran-app/merran/main/.env.example
```

```bash
docker compose up -d
```

Nothing in `.env` needs filling in: it's there to change the port, set the address people reach Merran at (`MERRAN_PUBLIC_URL`), or move to Postgres (`docker compose --profile postgres up -d`, after setting `POSTGRES_PASSWORD` and `DATABASE_URL`).

### The first time

Open `http://<your-server>:3000`. Merran asks for a **setup code**, printed in its log so a stranger can't claim a fresh install:

```bash
docker compose logs merran
```

Then make your account and your household. Settings → This server is where AI keys, modules (video import, nutrition, stores, recipe sites...) and the rest are set up; Settings → Household is where invites, tastes and your stores are.

### Images

`ghcr.io/merran-app/merran`, for amd64 and arm64 (a Raspberry Pi 4 or 5 works):

| Tag | What it is |
|---|---|
| `0.1.0-alpha.1`, `0.4.2` | That release, which never changes |
| `next` | The newest release, pre-releases included |
| `latest` | The newest release from 0.1.0 on (none yet) |
| `0.4` | The newest release in 0.4 |
| `edge` | Every commit to main, for testers |

Each image is signed with cosign and carries its SBOM and build provenance:

```bash
cosign verify ghcr.io/merran-app/merran:next --certificate-identity-regexp 'https://github.com/merran-app/merran/' --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

### Updating

Merran looks for a newer release every 6 hours (`MERRAN_UPDATE_CHECK=false` turns that off) and tells the server admin, with its notes, in the sidebar and Settings → This server. To update:

```bash
docker compose pull && docker compose up -d
```

Your data stays in `./data`. Merran changes the database itself at startup, and downgrades aren't supported, so keep a copy of `./data` from before an update.

### Your data

Everything Merran keeps is in the data folder: the SQLite database (unless you use Postgres), photos, and the key it seals saved secrets with (`secret`). Back up the whole folder. A household can also be exported on its own, to keep or to move to another Merran.

## The browser extension

For Chrome, Edge and Firefox: add a recipe from any page (even ones that turn servers away or need a sign-in), right-click a link or selected text, keep the shopping list in a side panel while you shop, and fill a Walmart cart. The zips are attached to each [release](https://github.com/merran-app/merran/releases); [apps/extension/README.md](apps/extension/README.md) says how to load and connect it.

## Working on it

Node 24 and pnpm (through corepack):

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm dev
```

The web app is on http://localhost:5173 and the API on :3000, on SQLite in `apps/server/data`; the setup code prints in the same terminal.

- `pnpm typecheck` and `pnpm format:check` (or `pnpm format`) for every package.
- `pnpm --filter @merran/server test:all` runs the server's tests on SQLite and on Postgres (`pnpm --filter @merran/server db:test-postgres` starts a throwaway Postgres in Docker); `pnpm --filter @merran/shared test` the shared code's.
- `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api`, after changing the API.
- `pnpm --filter @merran/server db:migration <name>` after changing the database's entities.

The repo: `apps/server` (Hono, MikroORM, the jobs), `apps/web` (React, TanStack Router and Query, shadcn/ui on Base UI), `apps/extension` (WXT) and `packages/shared` (what the server and the apps share: the ingredient parser, units, foods, planning). The plan and the reasoning behind it are in [docs/](docs/README.md).

### Releases

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs every check on each push and pull request, and publishes `edge` from main. A release is made by running **Release** in GitHub Actions on main with its version (`0.1.0-alpha.2`): it runs the checks again, builds and signs the images, zips the extension, and writes the GitHub release, tagged `v0.1.0-alpha.2`, with notes from the commits since the last one.

## License

Copyright (C) 2026 Kyle Johnson. Merran is free software under the [GNU Affero General Public License v3.0](LICENSE) or later: run it, change it and share it. If you run a changed copy for other people over a network, offer them its source too.
