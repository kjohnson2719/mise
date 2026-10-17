# Operations

Running Merran: logs, error tracking, analytics, what leaves the server, how it's installed and updated, and backups. The rule throughout: **nothing leaves the server unless the person running it turned it on**, and every switch is documented.

## Logs

- **pino:** JSON lines in production (for Loki, Dozzle or `docker logs`), readable colored lines in development.
- `MERRAN_LOG_LEVEL`: `info` by default; `debug` for troubleshooting.
- **Each request gets an id,** in the log lines it causes and the `X-Request-Id` response header, so a person's error message can be matched to the logs.
- **Redacted automatically:** cookies, `Authorization` headers, API keys, AI keys, passwords and tokens. Recipe text, chat messages and pantry contents are never logged at `info`.

## Health

- `GET /api/health`: is the process up (Docker's health check).
- `GET /api/health/ready`: can it reach the database, have migrations run, are jobs being worked. For uptime monitors like Uptime Kuma.
- Both return no personal data and need no sign-in.

## Error tracking

Two different needs, handled separately.

**1. The operator's own error tracking** (off by default)
- Set `MERRAN_SENTRY_DSN` and both the server and the web app report errors there. It works with Sentry, and with the self-hosted, Sentry-compatible **GlitchTip** and **Bugsink**, so errors can stay on the operator's own hardware.
- The browser gets its DSN from the server at start, so the image doesn't need rebuilding.
- **Scrubbed before sending:** cookies, headers, keys, request and response bodies, and anything that looks like a key. People are identified only by a random id, never a name or email.
- Settings: the environment name (`MERRAN_SENTRY_ENVIRONMENT`) and the share of errors sent (`MERRAN_SENTRY_SAMPLE_RATE`), in Settings → This server too. Performance traces come later.
- The SDK is loaded only when there's a DSN, on the server and in the browser, and sends errors only: no breadcrumbs, no tracing.

**2. A built-in Problems page** (always on, nothing sent anywhere)
- The server keeps the last few hundred errors in the database (message, where, when, request id, how often), with no personal data.
- Settings → This server → **Problems** lists them, grouped, so a server admin without Sentry can still see what's going wrong.
- **Copy diagnostics** puts together what a bug report needs: version, install method, modules on, the database (SQLite, or Postgres and its version), the recent problems. Personal data is left out, and it's shown before copying.
- **Report a problem** opens a new GitHub issue with the diagnostics filled in. Nothing is sent unless the person submits that issue themselves.

**Not in 0.1: crash reports sent to the Merran project.** Running a collector, and the privacy promises that come with it, isn't worth it while the Problems page and prefilled issues cover bug reports.

## Metrics

- `MERRAN_METRICS=true` turns on `/metrics` in Prometheus format: requests, response times, jobs (waiting, running, failed), AI calls and spend by provider, imports.
- Protected by a token (`MERRAN_METRICS_TOKEN`) or reachable only from addresses the operator lists.
- **Later:** OpenTelemetry traces, through the standard `OTEL_*` variables.

## Analytics

"Analytics" means three different things here, and they're kept apart.

### 1. Usage on your own server (for the server admin)

Built in, worked out from the database, never sent anywhere. Settings → This server → **Usage**:
- households, people, and who's been active in the past week and month
- recipes, imports, meals planned and cooked
- AI spend by household, task, model and whose key paid
- jobs run and failed

### 2. Telemetry for the Merran project (opt-in)

Knowing roughly how many servers run Merran, on which versions, and which modules people use helps decide what to build and when an old version can stop being supported. It must be something a self-hoster can trust.

- **Off unless the server admin says yes.** The setup screen asks once ("Help improve Merran by sending an anonymous summary once a day?"), with a link to exactly what's sent. Settings → This server → Telemetry can change it any time.
- `MERRAN_TELEMETRY=off` turns it off for good and hides the question, for people deploying many copies.
- **See what's sent.** Settings shows the exact JSON of the next report.
- **What's sent, once a day:**
  - a random install id (not derived from anything; **Reset** makes a new one)
  - Merran version, install method (Docker image, source), CPU architecture, the database (SQLite, or Postgres and its major version)
  - which modules are on (yes or no each)
  - which kinds of AI provider are set up (Anthropic, OpenAI, OpenAI-compatible, none), not models or keys
  - counts in ranges: households (1, 2–5, 6–20, more), people, recipes (under 100, 100–500...)
  - the server's language and country settings
- **Never sent:** names, usernames, emails, recipes, addresses, keys, IP addresses (the receiver doesn't store them), anything a person typed.
- **Where it goes:** a small receiver the project runs (`telemetry.merran.app`), with its code in this repo (`apps/telemetry`), so anyone can read what's kept. A public page shows the totals (like Home Assistant's analytics page): installs by version, modules in use.
- **Nothing in the web app tracks clicks or pages.** No PostHog, no Google Analytics inside Merran, not even opt-in. That's the line between "an anonymous daily count" and tracking people in their own kitchen.

### 3. The project's own websites

The docs site and the demo can use privacy-friendly page counts (Plausible, Umami or Cloudflare Web Analytics, no cookies). This never touches anyone's Merran.

## What leaves the server

Every outside call Merran can make, when, and how to stop it. This table also goes in `PRIVACY.md`.

| Where | When | What's sent | Off by |
|---|---|---|---|
| The household's or server's AI provider | AI features | The recipe, page, photo or chat at hand, and the household's tastes and pantry when the task needs them | No AI key |
| Recipe sites and feeds | Importing a link; the suggested and followed sites' feeds every 6 hours, their new posts and photos; starter collections' classics weekly; Discover results | A normal page request, with Merran's user agent, following `robots.txt` in the background | Not importing; Recipe sites module off |
| TikTok, YouTube, Instagram, Facebook | Importing a video | Requests made by yt-dlp | Video import module off |
| Kokoro, at the address the server admin gave | Reading cook steps aloud, when it's the server voice | The words of each step, once | Voice set to each device |
| GitHub releases | yt-dlp updating itself, weekly | A download request | `MERRAN_YTDLP_AUTO_UPDATE=false` |
| GitHub releases | The update check, every 6 hours | A request for the latest release | `MERRAN_UPDATE_CHECK=false` |
| USDA | Working out nutrition | Food names | No USDA key |
| Kroger | Prices, product search, sending a cart | Food names, product ids, the linked account's token | No Kroger app |
| Browsers' push services | Sending a notification | An encrypted message only the phone can read | Notifications off |
| Addresses a household chose | Webhooks | Event ids and a short summary, signed | No webhooks; private addresses refused unless the server admin allows |
| SMTP server | Invites, resets | The email | No SMTP |
| SSO provider | Signing in | The usual OIDC exchange | No SSO |
| Sentry or compatible | Errors | Scrubbed error reports | No DSN |
| `telemetry.merran.app` | Daily | The summary above | Off unless opted in |

`MERRAN_OUTBOUND=minimal` turns off everything Merran does on its own (update checks, yt-dlp updates, feed reads, telemetry) and leaves only what someone asks for at the time (importing a link, an AI call).

## Getting Merran

### Images

- **Prebuilt images on GitHub's registry:** `ghcr.io/merran-app/merran`, for `amd64` and `arm64` (so a Raspberry Pi 4 or 5 works).
- **Tags:** the version itself (`0.1.0-alpha.1`, `1.4.2`), which never moves; `next` (the newest release, pre-releases included); for a release that isn't a pre-release, `1.4`, `1` (from 1.0 on) and `latest`; and `edge` (every commit to main, for testers). The compose file uses `next` while Merran is in alpha.
- **Signed and described:** each image is signed with cosign and carries an SBOM and build provenance, so anyone can check it came from this repo's CI.
- **One image with everything,** yt-dlp and ffmpeg included (about 100 MB of the image), and Postgres's `pg_dump` so Merran can back up either database itself. Modules that aren't wanted are turned off rather than built out.
- **Running as a normal user:** the container drops to `PUID`/`PGID` as in the REFERENCE app, or runs as any user set in compose.

### Running it

- **The quickest way is one container, on SQLite,** with nothing to fill in:

  ```bash
  docker run -d --name merran -p 3000:3000 -v ./data:/data ghcr.io/merran-app/merran
  ```

- **The compose file** does the same, with room to grow: `merran` alone by default, plus optional services behind profiles: `postgres` (`postgres:18`), `voice` (Kokoro) and `tunnel` (cloudflared).
- **For Postgres:** `docker compose --profile postgres up -d`, with `POSTGRES_PASSWORD` set in `.env`. The compose file points `DATABASE_URL` at it. An existing Postgres works too: set `DATABASE_URL` and skip the profile.
- `docker compose --profile voice up -d` adds Kokoro; no editing the file.

### Where people run it

| Where | How | When |
|---|---|---|
| Docker Compose (any Linux box, Dockge, Portainer) | The compose file | 0.1 |
| Unraid | A Community Applications template | 0.1 |
| TrueNAS SCALE | The community app catalog | After 0.1 |
| Proxmox | The community helper scripts | After 0.1 |
| Kubernetes | A Helm chart | When someone asks |
| CasaOS, Umbrel, YunoHost | Their app stores | When someone asks |

**What it needs:** about 512 MB of RAM on SQLite, or 1 GB with Postgres alongside; Kokoro adds 1 to 2 GB. Two CPU cores are plenty. On SQLite, the data folder must be on a local disk, not a network share (see [platform.md](platform.md#the-database)).

### Reaching it from outside

Docs for each common way in: a Cloudflare Tunnel (in the compose file), Tailscale, Caddy, Traefik and Nginx Proxy Manager. Each covers `MERRAN_PUBLIC_URL`, `MERRAN_TRUSTED_PROXIES`, and why sign-up should stay off on a public address.

## Releases and updates

- **Semantic versions.** `0.x` while the API and export format may still change; `1.0` once they're promised stable.
- **The Release workflow** (`.github/workflows/release.yml`), run by hand on main with a version: every check again, then the images for amd64 and arm64 with the version baked in (`MERRAN_VERSION`), signed with cosign (keyless, so anyone can check they came from this repo's workflow), the browser extension's zips, and last the GitHub release, tagged `v<version>`. It's published only once the images exist, because every Merran's update check sees it at once. Pre-releases (`0.1.0-alpha.1`) are marked so, and don't move `latest`.
- **Release notes, drafted as pull requests merge** (decided October 17, 2026, like Mealie's): Release Drafter (`.github/release-drafter.yml`) keeps a draft of the next release, with each merged pull request under a heading for its kind, taken from the start of its title: `feat:`, `fix:`, `docs:`, `chore:` (or `refactor:`, `perf:`, `test:`, `build:`, `ci:`), `chore(deps):` for dependencies, and a `!` for a breaking change (`feat!: ...`). The Pull request workflow's Title check holds every pull request to those, and the `skip-changelog` label leaves one out. Commit messages stay plain English; only pull request titles have a type. While Merran is in alpha, each draft is the next alpha (`prerelease-identifier: alpha`, taken out for 0.1.0).
- **Making a release:** write the highlights in the draft on GitHub (what's new, with screenshots) just before running Release, since each merge writes the draft afresh. Release takes the draft's notes as they are when it starts, won't publish one that still has its placeholder, and adds how to get the release and a link to everything since the last one. The first release's draft has nothing to compare with, so its notes are written by hand, and Release won't publish it while Release Drafter's warning about that is still in it. Without a draft, GitHub writes the notes from the pull requests.
- **CI** (`.github/workflows/ci.yml`, with the checks in `check.yml`): every push to main and pull request runs the checks on SQLite and Postgres, builds the extension and the image, and main publishes `edge`, versioned `0.0.0-edge.<commit>`.
- **Database changes run at startup.** Before applying any, Merran backs the database up into `data/backups` (`pre-1.5.0-<date>`), so a bad update can always be undone.
- **Downgrades aren't supported,** and the release notes say when an update can't be undone without that dump.
- **The update check** (the Update check module) asks GitHub for Merran's releases (not commits, as the REFERENCE app did) every 6 hours, and a minute after Merran starts. A server on a pre-release hears about newer pre-releases too; one on a release only about releases; a build that isn't a release (from source, or `edge`) isn't checked. The server admin sees an Update badge in the sidebar and the account menu, and Settings → This server shows the release notes and the commands for their install method, with **Look now**. `MERRAN_UPDATE_CHECK=false` turns it off; only the request for the releases is sent.
- **Support:** the latest minor version gets fixes. Security fixes go to the latest minor of the current major.

## Backups and restore

- **Nightly backups by Merran itself,** on either database, so there's no separate backup container: SQLite's online backup (a consistent copy while Merran keeps running) or `pg_dump` for Postgres, into `data/backups`, kept for `MERRAN_BACKUP_KEEP_DAYS` (14 by default). The time is a setting.
- **Files** (photos, the secret key) are in `data/`, next to the compose file. The docs say plainly: back up the whole `data` folder, and keep `data/app/secret` (or `MERRAN_SECRET`) with it, or saved keys must be entered again.
- **Download a backup** (server admin, Settings → This server): the database and files in one archive.
- **Restoring** is documented step by step, and CI restores a dump into a fresh install on every release to prove the steps work.
- **A household export** (see [platform.md](platform.md#export-and-import)) is the way to move one household, not a backup of the server.

## Moving from SQLite to Postgres

A server that started on SQLite and outgrew it moves with one command, keeping everything:

```bash
docker compose exec merran merran db copy --to postgres://merran:<password>@db:5432/merran
```

- It copies every table, in order, into an empty Postgres at the same schema version, then checks the row counts match.
- Then set `DATABASE_URL` to the Postgres address and restart. The SQLite file is left alone, so going back is just unsetting `DATABASE_URL`.
- It works the other way too (Postgres to SQLite), for anyone shrinking a server.
- CI runs it on every change to the schema, on the sample household, so it can't quietly break.

## A public demo

- `demo.merran.app`: a household full of sample recipes, a planned week and a list, reset every night.
- Sign-up off; everyone shares a demo account, or gets a throwaway household that's deleted after a day.
- AI on a small model with a strict daily limit, or off with a note saying what it would do.
- Store connections and email off.
