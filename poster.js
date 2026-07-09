'use strict';

/**
 * Facebook Auto-Poster
 *
 * Reads posts.json, posts the entry at `last_posted_index` to a Facebook Page
 * via the Graph API, then increments the index and commits posts.json back to
 * the repo using the GitHub Contents API. Loops back to 0 after day 30.
 *
 * Uses only Node.js built-ins (https, fs) — no external dependencies.
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ID            - the numeric id of the Facebook Page to post to
 *   FACEBOOK_PAGE_ACCESS_TOKEN  - a Page access token (pages_manage_posts scope)
 *   GITHUB_TOKEN                - token to commit the updated posts.json
 *   GITHUB_REPOSITORY           - "owner/repo" (provided by GitHub Actions)
 *   GITHUB_SHA                  - the commit SHA being run (provided by Actions)
 *   GITHUB_BRANCH               - defaults to "main"
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const POSTS_FILE = path.join(__dirname, 'posts.json');
const PLACEHOLDER = 'PLACEHOLDER';
const TOTAL_DAYS = 30;
const GRAPH_API_VERSION = 'v21.0';

const {
  FACEBOOK_PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_BRANCH = 'main',
} = process.env;

/** Minimal promise wrapper around https.request that returns { status, body }. */
function httpRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Publish a text post to the Facebook Page feed via the Graph API. */
async function postToFacebook(content) {
  const payload = new URLSearchParams({
    message: content,
    access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
  }).toString();

  const { status, body } = await httpRequest(
    {
      hostname: 'graph.facebook.com',
      path: `/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/feed`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload
  );

  if (status < 200 || status >= 300) {
    throw new Error(`Facebook API returned ${status}: ${body}`);
  }
  return JSON.parse(body);
}

/** Commit the updated posts.json back to the repo via the GitHub Contents API. */
async function commitPostsFile(fileContents, message) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.warn(
      '⚠️  GITHUB_TOKEN or GITHUB_REPOSITORY missing — skipping commit of posts.json.'
    );
    return;
  }

  const apiPath = `/repos/${GITHUB_REPOSITORY}/contents/posts.json`;
  const baseHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'facebook-autoposter',
    Accept: 'application/vnd.github+json',
  };

  // 1. Get the current file SHA (required to update an existing file).
  const getRes = await httpRequest({
    hostname: 'api.github.com',
    path: `${apiPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    method: 'GET',
    headers: baseHeaders,
  });

  if (getRes.status < 200 || getRes.status >= 300) {
    throw new Error(`GitHub get-file returned ${getRes.status}: ${getRes.body}`);
  }
  const sha = JSON.parse(getRes.body).sha;

  // 2. Commit the new contents.
  const payload = JSON.stringify({
    message,
    content: Buffer.from(fileContents).toString('base64'),
    sha,
    branch: GITHUB_BRANCH,
  });

  const putRes = await httpRequest(
    {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'PUT',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload
  );

  if (putRes.status < 200 || putRes.status >= 300) {
    throw new Error(`GitHub commit returned ${putRes.status}: ${putRes.body}`);
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

  // Post to Facebook.
  console.log('🚀 Posting to Facebook...');
  const result = await postToFacebook(post.content);
  const postId = result.id;
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
