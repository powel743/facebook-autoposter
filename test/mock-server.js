'use strict';
// Minimal mock of the Graph API + GitHub Contents API endpoints poster.js hits,
// so we can exercise the real network code paths without calling Facebook.
const http = require('http');

let receivedPhotoUpload = null;
let receivedFeedPost = null;

const server = http.createServer((req, res) => {
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const url = req.url;

    if (url.startsWith('/v25.0/debug_token')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { is_valid: true, expires_at: 0 } }));
    }
    if (url.includes('/feed')) {
      receivedFeedPost = body.toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: 'MOCK_FEED_POST_123' }));
    }
    if (url.includes('/photos')) {
      receivedPhotoUpload = { size: body.length, contentType: req.headers['content-type'] };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: 'MOCK_PHOTO_456', post_id: 'MOCK_PAGE_ID_MOCK_PHOTO_456' }));
    }
    if (url.includes('/contents/posts.json') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ sha: 'fakesha123' }));
    }
    if (url.includes('/contents/posts.json') && req.method === 'PUT') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ commit: { sha: 'newfakesha456' } }));
    }
    res.writeHead(404);
    res.end('not found');
  });
});

server.listen(0, () => {
  const port = server.address().port;
  console.log(`MOCK_SERVER_PORT=${port}`);
});

process.on('SIGTERM', () => server.close());
