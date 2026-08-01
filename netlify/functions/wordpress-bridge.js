/**
 * Netlify adapter for the WordPress publishing bridge.
 *
 * netlify.toml rewrites /wp-json/* and /wp-admin/authorize-application.php
 * here; this file only normalises the Lambda event into the plain request
 * shape that netlify/lib/wordpressBridge.js expects.
 */

import { handleBridgeRequest, readConfig } from '../lib/wordpressBridge.js';

function lowercaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function resolveSiteUrl(headers) {
  // The client only trusts the host it was configured with, so mirror it back
  // rather than using a build-time constant.
  const host = headers['x-forwarded-host'] || headers.host;
  if (host) {
    const protocol = headers['x-forwarded-proto'] || 'https';
    return `${protocol}://${host}`;
  }
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
}

export const handler = async (event) => {
  const headers = lowercaseHeaders(event.headers);
  const contentType = headers['content-type'] || '';

  const bodyBuffer = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : Buffer.alloc(0);

  let parsedJson = {};
  let form = new URLSearchParams();
  if (bodyBuffer.length) {
    const text = bodyBuffer.toString('utf8');
    if (contentType.includes('application/json')) {
      try {
        parsedJson = JSON.parse(text);
      } catch {
        parsedJson = {};
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      form = new URLSearchParams(text);
      // Ulysses may post fields as a form; treat them as the payload too.
      parsedJson = Object.fromEntries(form.entries());
    }
  }

  // `rawUrl` always carries the address the client actually asked for, which
  // survives the netlify.toml rewrite that routes /wp-json/* to this function.
  const requested = event.rawUrl ? new URL(event.rawUrl) : null;
  const query = new URLSearchParams(
    requested?.search || event.rawQuery || new URLSearchParams(event.queryStringParameters || {}).toString()
  );

  const response = await handleBridgeRequest(
    {
      method: (event.httpMethod || 'GET').toUpperCase(),
      path: requested?.pathname || event.path || '/',
      query,
      form,
      json: parsedJson,
      bodyBuffer,
      headers,
      siteUrl: resolveSiteUrl(headers),
    },
    readConfig()
  );

  return response;
};
