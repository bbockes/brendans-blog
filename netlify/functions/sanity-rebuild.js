/**
 * Sanity → Netlify rebuild bridge
 *
 * Why: RSS + sitemap are generated at build time from Sanity content.
 * This function lets Sanity trigger a Netlify build immediately after publish.
 *
 * Configure in Netlify env:
 * - NETLIFY_BUILD_HOOK_URL: Netlify build hook URL (create in Netlify UI)
 * - SANITY_WEBHOOK_SECRET: shared secret you also set on the Sanity webhook
 *
 * Configure in Sanity:
 * - Webhook URL: https://<your-domain>/.netlify/functions/sanity-rebuild
 * - Header: x-webhook-secret: <SANITY_WEBHOOK_SECRET>
 * - Triggers: create/update/delete (at least update on publish)
 */

export const handler = async (event) => {
  // Only allow POST requests (Sanity webhooks are POST)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const expectedSecret = process.env.SANITY_WEBHOOK_SECRET;
  const providedSecret =
    event.headers?.['x-webhook-secret'] ||
    event.headers?.['X-Webhook-Secret'] ||
    event.queryStringParameters?.secret;

  // If a secret is configured, require it
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
          details: text?.slice(0, 500),
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
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }
};


