# TenderIQ Facebook Auto-Poster

A zero-server, zero-dependency Facebook Page auto-poster. **GitHub Actions is the scheduler and runtime, and the repo itself is the database** — after each post, `poster.js` commits the updated `posts.json` back to the repo so it remembers where it left off between runs.

## How it works

- A GitHub Actions cron fires daily at **03:00 UTC (06:00 AM EAT)**, spins up a fresh Ubuntu machine, runs `node poster.js`, then destroys the machine. Nothing runs between posts.
- `poster.js` reads `posts.json`, picks the post at `last_posted_index`, posts it to your Facebook Page via the Graph API, increments the index, and commits `posts.json` back to the repo via the GitHub Contents API.
- After **Day 30** the index resets to `0`, so the 30-day campaign loops forever.
- If a day's `content` still contains the word **`PLACEHOLDER`**, the run logs a warning and exits **without posting** — so unfinished days are never published.
- Uses **only Node.js built-ins** (`https`, `fs`) — no `npm install`, ever.

## Setup

### 1. Fork or clone this repo

```bash
git clone <your-repo-url>
cd facebook-autoposter
```

Push it to your own GitHub repository (the workflow commits back to whatever repo it runs in).

### 2. Add two GitHub secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Description |
| --- | --- |
| `FACEBOOK_PAGE_ID` | The numeric ID of the Facebook Page you want to post to. |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | A **Page Access Token** for that Page. |

You do **not** need to add `GITHUB_TOKEN` — GitHub Actions provides it automatically.

**Getting the Facebook credentials** — use the [Graph API Explorer](https://developers.facebook.com/tools/explorer/):

1. Select your app (or create one) and choose **Get Token → Get Page Access Token**.
2. Grant the scopes **`pages_manage_posts`** and **`pages_show_list`**.
3. Pick your Page — the Explorer returns a Page Access Token (your `FACEBOOK_PAGE_ACCESS_TOKEN`).
4. Find your `FACEBOOK_PAGE_ID` by querying `me/accounts` in the Explorer, or from your Page's **About** section.

### 3. Fill in your content

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

### 4. Test locally with a dry run

The dry run reads `posts.json` and logs exactly which post **would** be sent — without calling Facebook or committing anything. **No environment variables required.**

```bash
npm run dry-run
```

### 5. Trigger a manual run from GitHub Actions

Go to the **Actions** tab → **Facebook Auto-Poster** workflow → **Run workflow**. This uses the `workflow_dispatch` trigger so you can test the full pipeline (real post + self-commit) on demand, in addition to the daily cron.

## ⚠️ Token expiry

Facebook **Page Access Tokens expire in ~60 days**. When posting starts failing with an auth error, generate a fresh Page Access Token from the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) (same scopes: `pages_manage_posts`, `pages_show_list`) and update the `FACEBOOK_PAGE_ACCESS_TOKEN` secret. For a longer-lived token, exchange it for a [long-lived Page token](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/).

## Files

| File | Purpose |
| --- | --- |
| `posts.json` | The 30-day content + `last_posted_index` bookmark (the "database"). |
| `poster.js` | Posts the current day and commits the advanced index back to the repo. |
| `dry-run.js` | Local preview — no API call, no commit, no secrets needed. |
| `.github/workflows/post.yml` | The daily cron + manual trigger. |
