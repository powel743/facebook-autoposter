'use strict';

/**
 * Integration test — runs poster.js's real code paths (token health check,
 * text post, photo/multipart upload, GitHub commit-back) against a local
 * mock server instead of the real Facebook/GitHub APIs.
 *
 * Copies the repo's poster.js + posts.json + posters/ into a scratch temp
 * directory so it never mutates your real posts.json.
 *
 * Usage: node test/run-integration-test.js [text|photo]
 *   text  (default) - exercises the /feed text-post path (day 1)
 *   photo            - exercises the /photos multipart upload path (day 11,
 *                       requires a real image file — one is generated on the fly)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const mode = process.argv[2] === 'photo' ? 'photo' : 'text';
const repoRoot = path.join(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-autoposter-test-'));

console.log(`Scratch dir: ${scratch}`);
fs.copyFileSync(path.join(repoRoot, 'poster.js'), path.join(scratch, 'poster.js'));
fs.mkdirSync(path.join(scratch, 'posters'), { recursive: true });

const data = JSON.parse(fs.readFileSync(path.join(repoRoot, 'posts.json'), 'utf8'));

if (mode === 'text') {
  data.last_posted_index = 0;
  data.posts[0].content = 'Integration test post — text only.';
  delete data.posts[0].image;
} else {
  data.last_posted_index = 10;
  data.posts[10].content = 'Integration test post — with image.';
  data.posts[10].image = 'posters/test.png';
  // Minimal valid 1x1 PNG, written as raw bytes — good enough to prove the
  // multipart upload path works without needing an external image.
  const onePxPng = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360000002000155bfabd50000000049454e44ae426082',
    'hex'
  );
  fs.writeFileSync(path.join(scratch, 'posters', 'test.png'), onePxPng);
}
fs.writeFileSync(path.join(scratch, 'posts.json'), JSON.stringify(data, null, 2) + '\n');

async function main() {
  const mock = spawn('node', [path.join(__dirname, 'mock-server.js')]);
  const port = await new Promise((resolve) => {
    mock.stdout.on('data', (d) => {
      const m = d.toString().match(/MOCK_SERVER_PORT=(\d+)/);
      if (m) resolve(Number(m[1]));
    });
  });
  console.log(`Mock Graph/GitHub API server up on port ${port}\n`);

  try {
    execSync(`node -r ${path.join(__dirname, 'fetch-shim.js')} poster.js`, {
      cwd: scratch,
      stdio: 'inherit',
      env: {
        ...process.env,
        FACEBOOK_PAGE_ID: 'MOCK_PAGE_ID',
        FACEBOOK_PAGE_ACCESS_TOKEN: 'mock-token',
        FACEBOOK_APP_ID: 'mock-app-id',
        FACEBOOK_APP_SECRET: 'mock-app-secret',
        GITHUB_TOKEN: 'mock-gh-token',
        GITHUB_REPOSITORY: 'tenderiq/facebook-autoposter',
        GITHUB_BRANCH: 'main',
        MOCK_SERVER_PORT: String(port),
      },
    });
    console.log('\n✅ Integration test passed — poster.js completed without error.');
  } catch (err) {
    console.error('\n❌ Integration test failed.');
    process.exitCode = 1;
  } finally {
    mock.kill();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
