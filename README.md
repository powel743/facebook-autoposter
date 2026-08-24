# TenderIQ Facebook Auto-Poster

A zero-server, near-zero-dependency Facebook Page auto-poster. **GitHub Actions is the scheduler and runtime, and the repo itself is the database** — after each post, `poster.js` commits the updated `posts.json` back to the repo so it remembers where it left off between runs.

## How it works

- A GitHub Actions cron fires daily at **03:00 UTC (06:00 AM EAT)**, spins up a fresh Ubuntu machine, runs `node poster.js`, then destroys the machine. Nothing runs between posts.
- `poster.js` reads `posts.json`, picks the post at `last_posted_index`:
  - If that day has an `image` field, it uploads the local poster file as a **photo post** (`POST /{page-id}/photos`) with the day's `content` as the caption.
  - Otherwise it publishes a **text-only post** to the Page feed (`POST /{page-id}/feed`).
- Before posting, it runs a **token health check** (`/debug_token`) and warns loudly if the Page token is expired, invalid, or expiring soon.
- It then increments `last_posted_index` and commits `posts.json` back to the repo via the GitHub Contents API.
- After **Day 30** the index resets to `0`, so the 30-day campaign loops forever.
- If a day's `content` still contains the word **`PLACEHOLDER`**, the run logs a warning and exits **without posting**.
- Uses only Node.js **global built-ins** (`fetch`, `FormData`, `Blob`, `fs`, `path` — all available since Node 18, no `npm install` required).

## Setup

### 1. Create a Meta developer app (if you don't have one)

You need a Facebook App (not just a Page) to get an `App ID` / `App Secret` for the long-lived token exchange. Create one at [developers.facebook.com/apps](https://developers.facebook.com/apps/).

### 2. Add GitHub secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Required? | Description |
| --- | --- | --- |
| `FACEBOOK_PAGE_ID` | Yes | The numeric ID of the "TenderIQ Kenya" Page. |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Yes | A Page Access Token — see step 3 for how to get a **long-lived** one. |
| `FACEBOOK_APP_ID` | Recommended | Enables the pre-flight token expiry check and is needed for `exchange-token.js`. |
| `FACEBOOK_APP_SECRET` | Recommended | Same as above. |

You do **not** need to add `GITHUB_TOKEN` — GitHub Actions provides it automatically.

### 3. Get a long-lived Page Access Token

Short-lived tokens from the Graph API Explorer expire in hours to ~60 days, and the workflow will silently start failing when that happens. Instead, generate a token that doesn't expire:

1. Go to the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), select your app, click **Get Token → Get User Access Token**, and grant `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`. Copy the token it gives you (this is short-lived — that's fine, you're about to exchange it).
2. Run the exchange script locally:
   ```bash
   FACEBOOK_APP_ID=<your app id> \
   FACEBOOK_APP_SECRET=<your app secret> \
   node exchange-token.js <short_lived_user_token>
   ```
3. It prints a Page Access Token for every Page you admin, flagging the one matching `FACEBOOK_PAGE_ID` if you set that env var too. This token has no `expires_at` and keeps working indefinitely (as long as the granting user stays a Page admin and doesn't revoke the app).
4. Paste that token into the `FACEBOOK_PAGE_ACCESS_TOKEN` GitHub secret.

`FACEBOOK_PAGE_ID` — find it by querying `me/accounts` in the Explorer, or from the Page's **About** section.

### 4. Fill in your content

Edit `posts.json` and replace every `PLACEHOLDER` string with the real post copy for each of the 30 days. The campaign theme arc is:

| Days | Theme |
| --- | --- |
| 1–5 | Founder story |
| 6–10 | Problem awareness |
| 11–15 | Product reveal |
| 16–20 | Education and tips |
| 21–25 | Social proof |
| 26–30 | Launch urgency |

Any day still containing `PLACEHOLDER` is skipped (not posted) when its turn comes up.

### 5. Add poster images (optional, per day)

To attach a Fable-generated poster concept to a day's post:

1. Save the image file under `posters/` (e.g. `posters/day-11.png`).
2. Add an `"image"` field to that day's entry in `posts.json`:
   ```json
   {
     "day": 11,
     "theme": "Product reveal",
     "content": "Introducing TenderIQ...",
     "image": "posters/day-11.png"
   }
   ```
3. Commit the image file to the repo alongside the `posts.json` change — the runner needs it on disk when it checks out the repo.

Days without an `image` field post as text-only, exactly as before. Day 11 in `posts.json` is pre-wired with an example `image` field pointing at `posters/day-11.png` — drop a real file there (or remove the field) before day 11 comes up in the rotation.

See `posters/README.md` for format/size constraints.

### 6. Test locally with a dry run

The dry run reads `posts.json`, logs exactly which post **would** be sent, and — if the day has an image — checks that the file actually exists on disk. It does **not** call Facebook or commit anything. **No environment variables required.**

```bash
npm run dry-run
```

### 7. Trigger a manual run from GitHub Actions

Go to the **Actions** tab → **Facebook Auto-Poster** workflow → **Run workflow**. This uses the `workflow_dispatch` trigger so you can test the full pipeline (real post + self-commit) on demand, in addition to the daily cron.

## Token & version maintenance

- **Token expiry**: if you followed step 3, your Page token shouldn't expire. If you skipped it and used a short-lived token instead, `poster.js`'s pre-flight check will warn you in the Action logs once it's within 7 days of expiring (requires `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` to be set). Re-run `exchange-token.js` to refresh it.
- **Graph API version**: pinned to `v25.0` in `poster.js` (`GRAPH_API_VERSION`). Meta guarantees each version stays live for at least 2 years after the *next* version ships, then silently falls back to an older version rather than erroring — which can cause confusing behavior changes. Check [developers.facebook.com/docs/graph-api/changelog](https://developers.facebook.com/docs/graph-api/changelog/) periodically and bump the constant when a new version ships.

## Files

| File | Purpose |
| --- | --- |
| `posts.json` | The 30-day content + `last_posted_index` bookmark (the "database"). Each day may optionally include an `image` field. |
| `poster.js` | Posts the current day (text or text+image), checks token health, and commits the advanced index back to the repo. |
| `dry-run.js` | Local preview — no API call, no commit, no secrets needed. Validates image paths exist. |
| `exchange-token.js` | One-time/occasional local script to mint a long-lived, effectively non-expiring Page Access Token. |
| `posters/` | Where local poster image files (e.g. Fable-generated concepts) live, referenced by filename from `posts.json`. |
| `.github/workflows/post.yml` | The daily cron + manual trigger. |
