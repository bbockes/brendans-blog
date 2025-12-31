/**
 * Sanity → Netlify rebuild bridge (CommonJS)
 *
 * Some Netlify setups are picky about ESM in Functions when the repo is "type: module".
 * Using .cjs makes this function deploy reliably.
 *
 * Netlify env vars:
 * - NETLIFY_BUILD_HOOK_URL
 * - SANITY_WEBHOOK_SECRET (optional, but recommended)
 */

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const expectedSecret = process.env.SANITY_WEBHOOK_SECRET;
  const headers = event.headers || {};
  const providedSecret =
    headers['x-webhook-secret'] ||
    headers['X-Webhook-Secret'] ||
    (event.queryStringParameters && event.queryStringParameters.secret);

  if (expectedSecret && providedSecret !== expectedSecret) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!buildHookUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Server misconfigured: NETLIFY_BUILD_HOOK_URL is not set',
      }),
    };
  }

  try {
    const resp = await fetch(buildHookUrl, { method: 'POST' });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to trigger Netlify build',
          status: resp.status,
          details: (text || '').slice(0, 500),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unexpected error triggering Netlify build',
        message: err && err.message ? err.message : String(err),
      }),
    };
  }
};


