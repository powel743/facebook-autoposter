'use strict';

/**
 * Facebook Auto-Poster — Dry Run
 *
 * Same selection logic as poster.js, but it does NOT call the Facebook API and
 * does NOT commit anything back to the repo. It just logs which post would be
 * sent and what the content is. Requires no environment variables.
 *
 * Usage: node dry-run.js   (or: npm run dry-run)
 */

const fs = require('fs');
const path = require('path');

const POSTS_FILE = path.join(__dirname, 'posts.json');
const PLACEHOLDER = 'PLACEHOLDER';
const TOTAL_DAYS = 30;

function main() {
  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  let index = data.last_posted_index || 0;

  // Loop back to the start after the last day.
  if (index >= TOTAL_DAYS) index = 0;

  const post = data.posts[index];
  if (!post) {
    throw new Error(`No post found at index ${index}.`);
  }

  console.log('──────────────────────────────────────────────');
  console.log('🧪 DRY RUN — nothing will be posted or committed.');
  console.log('──────────────────────────────────────────────');
  console.log(`📅 Day ${post.day} (index ${index}) — ${post.theme}`);
  console.log(`📝 Content:\n${post.content}`);
  console.log('──────────────────────────────────────────────');

  if (post.content.includes(PLACEHOLDER)) {
    console.log(
      `⏭️  Would SKIP: day ${post.day} still has placeholder content. ` +
        'Fill in posts.json before going live.'
    );
    return;
  }

  let nextIndex = index + 1;
  if (nextIndex >= TOTAL_DAYS) nextIndex = 0;

  console.log('🚀 Would POST the content above to the Facebook Page feed.');
  console.log(`➡️  Would advance last_posted_index ${index} → ${nextIndex}.`);
  if (nextIndex === 0) {
    console.log('🔁 (Would reach day 30 — resetting index to 0 for the loop.)');
  }
}

main();
