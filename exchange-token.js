'use strict';

/**
 * Long-lived Page Access Token exchange
 *
 * Page tokens minted directly from the Graph API Explorer are short-lived
 * (~1-2 hours) or, at best, the ~60-day "Page Access Token" the README
 * originally pointed you to. Either way, they expire and poster.js starts
 * failing with an OAuth error.
 *
 * The fix: exchange a short-lived USER token for a long-lived USER token
 * (60 days), then fetch the Page token via /me/accounts using that
 * long-lived user token. A Page token minted this way does not expire as
 * long as the user who granted it stays an admin of the Page and doesn't
 * revoke the app's access — Facebook returns no `expires_at`.
 *
 * Usage:
 *   FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=... \
 *     node exchange-token.js <short_lived_user_access_token>
 *
 * Where to get the short-lived user token: Graph API Explorer
 * (https://developers.facebook.com/tools/explorer/) → select your app →
 * "Get User Access Token" → grant pages_manage_posts, pages_show_list,
 * pages_read_engagement → copy the token it gives you.
 *
 * Output: a Page Access Token for every Page you admin, plus which one
 * matches FACEBOOK_PAGE_ID if that env var is set. Paste the right one into
 * the FACEBOOK_PAGE_ACCESS_TOKEN GitHub secret.
 */

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_PAGE_ID } = process.env;
const shortLivedUserToken = process.argv[2];

async function main() {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    throw new Error('Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET env vars before running this.');
  }
  if (!shortLivedUserToken) {
    throw new Error(
      'Usage: FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=... node exchange-token.js <short_lived_user_access_token>'
    );
  }

  console.log('1/3 Exchanging short-lived user token for a long-lived user token...');
  const exchangeUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  exchangeUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
  exchangeUrl.searchParams.set('fb_exchange_token', shortLivedUserToken);

  const exchangeRes = await fetch(exchangeUrl);
  const exchangeBody = await exchangeRes.json();
  if (!exchangeRes.ok) {
    throw new Error(`Token exchange failed (${exchangeRes.status}): ${JSON.stringify(exchangeBody)}`);
  }
  const longLivedUserToken = exchangeBody.access_token;
  console.log(`    ✅ Got long-lived user token (expires in ~${Math.round((exchangeBody.expires_in || 0) / 86400)} days).`);

  console.log('2/3 Fetching Pages this user administers...');
  const accountsUrl = new URL(`${GRAPH_BASE}/me/accounts`);
  accountsUrl.searchParams.set('access_token', longLivedUserToken);
  const accountsRes = await fetch(accountsUrl);
  const accountsBody = await accountsRes.json();
  if (!accountsRes.ok) {
    throw new Error(`Fetching Pages failed (${accountsRes.status}): ${JSON.stringify(accountsBody)}`);
  }
  const pages = accountsBody.data || [];
  if (pages.length === 0) {
    throw new Error(
      'No Pages returned for this user. Make sure the token was granted pages_show_list and ' +
        'the user is an admin of the TenderIQ Kenya Page.'
    );
  }

  console.log('3/3 Page access tokens (these do not expire under normal use):\n');
  for (const page of pages) {
    const match = FACEBOOK_PAGE_ID && page.id === FACEBOOK_PAGE_ID ? '  ⭐ MATCHES FACEBOOK_PAGE_ID' : '';
    console.log(`  Page: ${page.name} (id: ${page.id})${match}`);
    console.log(`  Token: ${page.access_token}\n`);
  }

  console.log(
    'Copy the token for "TenderIQ Kenya" above into the FACEBOOK_PAGE_ACCESS_TOKEN GitHub secret.'
  );
  console.log(
    'Verify it any time with: curl -s "https://graph.facebook.com/' +
      GRAPH_API_VERSION +
      '/debug_token?input_token=<token>&access_token=' +
      FACEBOOK_APP_ID +
      '|' +
      FACEBOOK_APP_SECRET +
      '" — or just let poster.js\'s built-in token health check confirm it on the next run.'
  );
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
