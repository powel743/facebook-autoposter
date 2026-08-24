'use strict';

/**
 * Facebook Auto-Poster
 *
 * Reads posts.json, posts the entry at `last_posted_index` to a Facebook Page
 * via the Graph API, then increments the index and commits posts.json back to
 * the repo using the GitHub Contents API. Loops back to 0 after day 30.
 *
 * Supports two post types, chosen automatically per-day based on posts.json:
 *   - Text-only post    -> POST /{page-id}/feed
 *   - Text + image post -> POST /{page-id}/photos (local binary file upload,
 *     e.g. a Fable-generated poster concept saved under posters/)
 *
 * Uses only Node.js built-ins (fetch, FormData, fs, path — all global since
 * Node 18, no npm install required).
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ID            - the numeric id of the Facebook Page to post to
 *   FACEBOOK_PAGE_ACCESS_TOKEN  - a Page access token (pages_manage_posts scope)
 *   GITHUB_TOKEN                - token to commit the updated posts.json
 *   GITHUB_REPOSITORY           - "owner/repo" (provided by GitHub Actions)
 *   GITHUB_BRANCH                - defaults to "main"
 *
 * Optional env vars (enable the pre-flight token health check):
 *   FACEBOOK_APP_ID
 *   FACEBOOK_APP_SECRET
 */

const fs = require('fs');
const path = require('path');

const POSTS_FILE = path.join(__dirname, 'posts.json');
const PLACEHOLDER = 'PLACEHOLDER';
const TOTAL_DAYS = 30;
const GRAPH_API_VERSION = 'v25.0'; // bumped from v21.0 — see README "Token & version maintenance"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const TOKEN_EXPIRY_WARNING_DAYS = 7;

const {
  FACEBOOK_PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_BRANCH = 'main',
} = process.env;

/**
 * Pre-flight check: verify the Page access token is valid and warn if it's
 * close to expiring. Uses the /debug_token endpoint. Requires FACEBOOK_APP_ID
 * and FACEBOOK_APP_SECRET — if either is missing, the check is skipped
 * (poster.js still works, you just lose the early warning).
 */
async function checkTokenHealth() {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.log(
      'ℹ️  FACEBOOK_APP_ID/FACEBOOK_APP_SECRET not set — skipping token expiry check.'
    );
    return;
  }

  const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set('input_token', FACEBOOK_PAGE_ACCESS_TOKEN);
  url.searchParams.set('access_token', appToken);

  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok) {
    throw new Error(
      `Token health check failed (${res.status}): ${JSON.stringify(body)}. ` +
        'The Page access token is likely invalid or expired — regenerate it (see README § Token expiry).'
    );
  }

  const data = body.data;
  if (!data || data.is_valid === false) {
    throw new Error(
      `Facebook reports this Page access token is invalid: ${JSON.stringify(data)}. ` +
        'Regenerate it (see README § Token expiry) and update the FACEBOOK_PAGE_ACCESS_TOKEN secret.'
    );
  }

  if (data.expires_at && data.expires_at > 0) {
    const expiresAt = new Date(data.expires_at * 1000);
    const daysLeft = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    console.log(`🔑 Page token expires: ${expiresAt.toISOString()} (${daysLeft.toFixed(1)} days left).`);
    if (daysLeft <= TOKEN_EXPIRY_WARNING_DAYS) {
      console.warn(
        `⚠️  Page token expires in ${daysLeft.toFixed(
          1
        )} days. Run 'node exchange-token.js' to generate a fresh long-lived token before it breaks.`
      );
    }
  } else {
    console.log('🔑 Page token has no expiry (long-lived / never-expiring). ✅');
  }
}

/** Publish a text-only post to the Facebook Page feed via the Graph API. */
async function postTextToFacebook(content) {
  const url = new URL(`${GRAPH_BASE}/${FACEBOOK_PAGE_ID}/feed`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      message: content,
      access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Facebook API returned ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Publish a post with an attached image to the Facebook Page via the Graph
 * API, uploading a local binary file (e.g. a Fable-generated poster) as
 * multipart/form-data to POST /{page-id}/photos.
 */
async function postPhotoToFacebook(content, imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const fileBuffer = fs.readFileSync(imagePath);
  const form = new FormData();
  form.set('caption', content);
  form.set('access_token', FACEBOOK_PAGE_ACCESS_TOKEN);
  form.set('source', new Blob([fileBuffer]), path.basename(imagePath));

  const url = new URL(`${GRAPH_BASE}/${FACEBOOK_PAGE_ID}/photos`);
  const res = await fetch(url, { method: 'POST', body: form });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Facebook API returned ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/** Commit the updated posts.json back to the repo via the GitHub Contents API. */
async function commitPostsFile(fileContents, message) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.warn(
      '⚠️  GITHUB_TOKEN or GITHUB_REPOSITORY missing — skipping commit of posts.json.'
    );
    return;
  }

  const apiPath = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/posts.json`;
  const baseHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'facebook-autoposter',
    Accept: 'application/vnd.github+json',
  };

  // 1. Get the current file SHA (required to update an existing file).
  const getRes = await fetch(`${apiPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
    headers: baseHeaders,
  });
  const getBody = await getRes.json();
  if (!getRes.ok) {
    throw new Error(`GitHub get-file returned ${getRes.status}: ${JSON.stringify(getBody)}`);
  }

  // 2. Commit the new contents.
  const putRes = await fetch(apiPath, {
    method: 'PUT',
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(fileContents).toString('base64'),
      sha: getBody.sha,
      branch: GITHUB_BRANCH,
    }),
  });
  const putBody = await putRes.json();
  if (!putRes.ok) {
    throw new Error(`GitHub commit returned ${putRes.status}: ${JSON.stringify(putBody)}`);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  let index = data.last_posted_index || 0;

  // Loop back to the start after the last day.
  if (index >= TOTAL_DAYS) index = 0;

  const post = data.posts[index];
  if (!post) {
    throw new Error(`No post found at index ${index}.`);
  }

  console.log('──────────────────────────────────────────────');
  console.log(`📅 Day ${post.day} (index ${index}) — ${post.theme}`);
  console.log(`📝 Content:\n${post.content}`);
  if (post.image) console.log(`🖼️  Image: ${post.image}`);
  console.log('──────────────────────────────────────────────');

  // Skip if content still contains the placeholder marker.
  if (post.content.includes(PLACEHOLDER)) {
    console.log(
      `⏭️  Skipping: day ${post.day} still has placeholder content. ` +
        'Fill in posts.json and re-run.'
    );
    return;
  }

  // Content is real — now the Facebook credentials are required.
  const missing = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  console.log('🩺 Checking Page access token health...');
  await checkTokenHealth();

  // Post to Facebook — image post if posts.json specifies one, else text-only.
  console.log('🚀 Posting to Facebook...');
  let result;
  if (post.image) {
    const imagePath = path.join(__dirname, post.image);
    result = await postPhotoToFacebook(post.content, imagePath);
  } else {
    result = await postTextToFacebook(post.content);
  }

  // /feed returns { id }, /photos returns { id, post_id }.
  const postId = result.post_id || result.id;
  const postUrl = `https://www.facebook.com/${postId}`;
  console.log(`✅ Successfully posted day ${post.day} to Facebook.`);
  console.log(`🆔 post_id: ${postId}`);
  console.log(`🔗 URL: ${postUrl}`);

  // Advance the index, looping at TOTAL_DAYS.
  let nextIndex = index + 1;
  if (nextIndex >= TOTAL_DAYS) {
    nextIndex = 0;
    console.log('🔁 Reached day 30 — resetting index to 0 (loop).');
  }
  data.last_posted_index = nextIndex;

  const updated = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(POSTS_FILE, updated);

  // Commit the updated posts.json back to the repo.
  console.log(`💾 Committing posts.json (last_posted_index → ${nextIndex})...`);
  await commitPostsFile(
    updated,
    `chore: posted day ${post.day}, advance index to ${nextIndex}`
  );
  console.log('✅ posts.json committed.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
