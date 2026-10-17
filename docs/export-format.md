# The Merran export format

A household export is how a household moves between Merran servers, or out of Merran altogether. It's a zip of JSON files and photos, so it can be read without Merran. The format is versioned: while Merran is `0.x` it may change, and `1.0` promises it stable (see [operations.md](operations.md#releases-and-updates)). An import always reads exports from older versions.

The schemas in [`apps/server/src/services/transfer/format.ts`](../apps/server/src/services/transfer/format.ts) are the format: exports are written from them and imports are checked against them.

## Getting one

- **Export a household:** Settings → Import and export → Export, for the household's owners and admins. The API is `GET /api/households/current/export`.
- **Import one:** Settings → Import and export → Import, into the household in use, or (for the server admin) as a new household. The API is `POST /api/households/current/import` or `POST /api/households/import`, with the zip as the body. The import runs as a job, with its progress at `GET /api/households/current/jobs/{jobId}`.
- **Your own data:** Settings → You → Your data downloads your account, the households you're in, the cooking notes you wrote and your API keys' names and permissions (never the keys) as `merran-my-data-<date>.json`. The API is `GET /api/auth/me/export`.

## What's in the zip

| File | What it holds |
|---|---|
| `merran-export.json` | The manifest: what this is, which version, when, and how much is in it |
| `household.json` | The household's details and settings |
| `recipes.json` | Every recipe, with everything that belongs to it |
| `photos/<recipe id>.webp` | Each recipe's photo, at full size |

### `merran-export.json`

```json
{
  "format": "merran.household",
  "version": 1,
  "exportedAt": "2026-10-16T05:12:00.000Z",
  "merranVersion": "0.1.0",
  "household": { "name": "The Johnsons" },
  "counts": { "recipes": 52, "photos": 48 }
}
```

`format` is always `merran.household`. An import refuses a `version` newer than it knows, and says to update Merran first.

### `household.json`

| Field | |
|---|---|
| `name` | The household's name |
| `timeZone`, `country`, `currency`, `weekStartsOn` | Where it is and how its week runs (`weekStartsOn`: 0 is Sunday, 1 is Monday) |
| `planning` | Its planning settings, as it keeps them, or null |
| `settings` | Module settings it set, by key. Never secrets: AI keys and the like stay behind |

These are only used when an export is imported as a new household. Imported into a household that already exists, its own details stay as they are.

### `recipes.json`

An array of recipes. Recipes in Recently deleted aren't exported.

| Field | |
|---|---|
| `id` | Its id: a UUIDv7 |
| `slug` | Its address, as in `/recipes/tomato-soup` |
| `name`, `description`, `notes`, `sourceUrl`, `yieldText` | As shown on the recipe |
| `servings`, `prepMinutes`, `cookMinutes`, `totalMinutes` | Numbers, or null. `totalMinutes` is null when it's prep and cook added up |
| `rating` | 1 to 5, or null |
| `nutrition` | Per serving, or null |
| `dietOverrides` | The household's corrections to the diet labels worked out from the ingredients: `{ "gluten-free": false }`. The labels themselves are worked out again on import |
| `origin` | Where it first came from: `link`, `manual`, `mealie`... |
| `importedFrom` | What it was in the app it was imported from, like `mealie:<id>`, so importing from that app again skips it. Null, or missing in exports from before it was added |
| `lastMadeAt`, `createdAt`, `updatedAt` | Times, as ISO 8601 |
| `createdBy` | The email of who added it, or null |
| `tags` | Tag names |
| `ingredients`, `steps` | Lines in order: `{ "section": "For the sauce", "text": "2 tbsp butter" }`, with `section` null outside a section |
| `photo` | Its photo's path in the zip, or null |
| `versions` | Earlier copies, oldest first: `{ source, snapshot, createdAt, createdBy }`. A snapshot is the recipe as the editor had it |
| `cookNotes` | How cooking it went: `{ rating, note, createdAt, by }` |
| `pairings` | What it goes with: `{ "recipe": "<id>" }` for one recipe, `{ "tag": "Sauce" }` for every recipe with a tag |

## How an import treats what's there

- **People aren't moved.** Accounts belong to a server. Anywhere the export names a person (who added a recipe, who wrote a note), it's by email, and the import finds them among the household's members. Anyone not there is left blank.
- **Recipes keep their ids** where no other household on the server has them, so a second import of the same export skips the recipes already in. A recipe whose id another household has gets a new one, with its pairings following.
- **Addresses:** a recipe keeps its slug unless another recipe in the household has it, then it gets `-2`, `-3` and so on.
- **Photos** are made again at both sizes from the full-size photo. A photo that can't be read is left off; the recipe still comes in.
- **One recipe at a time:** an import that stops (cancelled, or Merran restarting) keeps what it brought in, and running it again picks up the rest.
