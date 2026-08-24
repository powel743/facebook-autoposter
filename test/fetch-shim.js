'use strict';
// Preloaded via `node -r ./fetch-shim.js poster.js` during integration tests.
// Redirects graph.facebook.com / api.github.com calls to the local mock
// server, driven by the MOCK_SERVER_PORT env var. Production runs never set
// MOCK_SERVER_PORT, so this shim is inert outside of tests.
const mockPort = process.env.MOCK_SERVER_PORT;
if (mockPort) {
  const realFetch = global.fetch;
  global.fetch = (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? new URL(input) : new URL(input.url);
    if (url.hostname === 'graph.facebook.com' || url.hostname === 'api.github.com') {
      url.hostname = 'localhost';
      url.port = mockPort;
      url.protocol = 'http:';
    }
    return realFetch(url, init);
  };
}
