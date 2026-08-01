/**
 * A WordPress-shaped façade in front of Sanity.
 *
 * Ulysses publishes to WordPress over the REST API (it dropped XML-RPC in
 * v26), authenticating with an Application Password obtained through the
 * browser authorization flow. This module speaks just enough of that API for
 * Ulysses to treat the blog as a WordPress site, while every read and write
 * actually lands in the Sanity dataset that already backs the front end.
 *
 * The two halves are:
 *   1. Discovery + auth  — GET /wp-json/ advertises the authorization
 *      endpoint; /wp-admin/authorize-application.php hands back credentials
 *      after the operator confirms a shared secret.
 *   2. Content           — /wp-json/wp/v2/{posts,media,users,categories,tags}
 *      mapped onto the `post` documents defined in the Studio schema.
 *
 * Everything is stateless: post identity is encoded in the Sanity document ID
 * rather than stored in a side table (see `numericIdForDocument`).
 */

import { createClient } from '@sanity/client';
import { htmlToPortableText, calculateReadTime, slugify } from './htmlToPortableText.js';
import { portableTextToHtml } from './portableTextToHtml.js';

const DOC_ID_PREFIX = 'ulysses-';
const DRAFT_PREFIX = 'drafts.';
// Posts created here get IDs counted in seconds from 2024, keeping them well
// below 2^31 for clients that assume 32-bit WordPress post IDs. Pre-existing
// posts (imported from Substack, with random UUIDs) get a hashed ID in a
// separate band so the two can never collide.
const ID_EPOCH_SECONDS = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const LEGACY_ID_BASE = 1_000_000_000;

export function readConfig(env = process.env) {
  return {
    projectId: env.SANITY_PROJECT_ID || env.VITE_SANITY_PROJECT_ID || 'wxzoc64y',
    dataset: env.SANITY_DATASET || env.VITE_SANITY_DATASET || 'production',
    apiVersion: env.SANITY_API_VERSION || '2024-01-01',
    token: env.SANITY_API_TOKEN,
    username: env.WP_BRIDGE_USERNAME || 'brendan',
    password: env.WP_BRIDGE_PASSWORD,
    siteName: env.WP_BRIDGE_SITE_NAME || "Brendan's Blog",
    siteDescription:
      env.WP_BRIDGE_SITE_DESCRIPTION ||
      'The personal blog of Brendan Bockes. Thoughts on productivity, technology, and building.',
    triggerRebuild: String(env.WP_BRIDGE_TRIGGER_REBUILD || '').toLowerCase() === 'true',
    buildHookUrl: env.NETLIFY_BUILD_HOOK_URL,
  };
}

export function createSanityClient(config) {
  return createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion,
    token: config.token,
    useCdn: false,
    // Drafts are how "draft" posts are represented, so the raw perspective is
    // required for them to be visible at all.
    perspective: 'raw',
  });
}

/* ------------------------------------------------------------------ *
 * Identity helpers
 * ------------------------------------------------------------------ */

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function baseDocumentId(documentId) {
  return String(documentId).startsWith(DRAFT_PREFIX)
    ? String(documentId).slice(DRAFT_PREFIX.length)
    : String(documentId);
}

export function numericIdForDocument(documentId) {
  const base = baseDocumentId(documentId);
  if (base.startsWith(DOC_ID_PREFIX)) {
    const parsed = Number(base.slice(DOC_ID_PREFIX.length));
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return LEGACY_ID_BASE + (fnv1a(base) % LEGACY_ID_BASE);
}

function documentIdForNumericId(numericId, isDraft) {
  const base = `${DOC_ID_PREFIX}${numericId}`;
  return isDraft ? `${DRAFT_PREFIX}${base}` : base;
}

/** Find a free sequential ID, stepping forward on the rare same-second clash. */
async function allocateNumericId(client) {
  let candidate = Math.floor(Date.now() / 1000) - ID_EPOCH_SECONDS;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const ids = [
      documentIdForNumericId(candidate, false),
      documentIdForNumericId(candidate, true),
    ];
    const taken = await client.fetch('count(*[_id in $ids])', { ids });
    if (!taken) return candidate;
    candidate += 1;
  }
  throw new Error('Could not allocate a free post ID');
}

async function findPostDocument(client, numericId) {
  const direct = await client.fetch('*[_id in $ids][0]', {
    ids: [documentIdForNumericId(numericId, false), documentIdForNumericId(numericId, true)],
  });
  if (direct) return direct;

  // Posts that predate the bridge have hashed IDs, so fall back to matching
  // the hash across the (single, cheap) list of document IDs.
  if (numericId >= LEGACY_ID_BASE) {
    const allIds = await client.fetch('*[_type == "post"]._id');
    const match = allIds.find((id) => numericIdForDocument(id) === numericId);
    if (match) return client.fetch('*[_id == $id][0]', { id: match });
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Date helpers — the site is advertised as UTC (gmt_offset 0)
 * ------------------------------------------------------------------ */

function parseWpDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  // WordPress sends naive local timestamps; ours is a UTC site.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toWpDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, '');
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

/* ------------------------------------------------------------------ *
 * Image handling
 * ------------------------------------------------------------------ */

/** Recover a Sanity asset ID from one of its own CDN URLs. */
export function assetIdFromSanityUrl(url, config) {
  const match = String(url).match(
    /cdn\.sanity\.io\/images\/([^/]+)\/([^/]+)\/([^/?#]+)\.(\w+)(?:[?#]|$)/
  );
  if (!match) return null;
  const [, projectId, dataset, name, extension] = match;
  if (projectId !== config.projectId || dataset !== config.dataset) return null;
  return `image-${name}-${extension}`;
}

async function uploadImageFromUrl(client, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch image ${url} (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
  return client.assets.upload('image', buffer, { filename });
}

/**
 * Replace the `_imageUrl` placeholders left by the HTML converter with real
 * asset references, uploading anything that isn't already in this dataset.
 */
async function resolveImageBlocks(client, blocks, config) {
  const resolved = [];
  for (const block of blocks) {
    if (block._type !== 'image' || !block._imageUrl) {
      resolved.push(block);
      continue;
    }

    const { _imageUrl: url, ...rest } = block;
    try {
      const existingId = assetIdFromSanityUrl(url, config);
      const assetId = existingId || (await uploadImageFromUrl(client, url))._id;
      resolved.push({ ...rest, asset: { _type: 'reference', _ref: assetId } });
    } catch (error) {
      // A broken image shouldn't cost the writer their whole post.
      console.warn(`[wp-bridge] skipping image ${url}: ${error.message}`);
    }
  }
  return resolved;
}

function mediaIdForAsset(assetId) {
  return LEGACY_ID_BASE + (fnv1a(String(assetId)) % LEGACY_ID_BASE);
}

async function findAssetByMediaId(client, mediaId) {
  const ids = await client.fetch('*[_type == "sanity.imageAsset"]._id');
  return ids.find((id) => mediaIdForAsset(id) === Number(mediaId)) || null;
}

/* ------------------------------------------------------------------ *
 * Sanity document ⟷ WordPress post
 * ------------------------------------------------------------------ */

/** An error that should surface to the client verbatim rather than as a 500. */
class BridgeError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const MARKDOWN_SIGNALS = [
  /^#{1,6}\s+\S/m, // # Heading
  /^\s*[-*+]\s+\S/m, // - bullet
  /^\s*\d+\.\s+\S/m, // 1. ordered
  /^\s*>\s+\S/m, // > quote
  /^\s*```/m, // fenced code
  /\*\*[^*\n]+\*\*/, // **bold**
  /\[[^\]\n]+\]\([^)\n]+\)/, // [text](url)
];

/**
 * Ulysses can serialise a post as HTML, Gutenberg blocks, or Markdown, and only
 * the first two are HTML. Markdown would otherwise be stored verbatim as a
 * single paragraph, so refuse it with an instruction the writer can act on.
 */
function assertNotMarkdown(content) {
  const text = String(content || '').trim();
  if (!text) return;

  // Any real block markup means we were sent HTML (Gutenberg block comments
  // wrap ordinary HTML, so they pass here too).
  if (/<(p|h[1-6]|ul|ol|li|blockquote|pre|figure|img|div|table|section)\b[^>]*>/i.test(text)) {
    return;
  }

  if (MARKDOWN_SIGNALS.some((pattern) => pattern.test(text))) {
    throw new BridgeError(
      400,
      'rest_invalid_content_format',
      'This post looks like Markdown, but the blog expects HTML and would have ' +
        'stored the raw syntax. In the Ulysses publishing settings, set Text ' +
        'Format to HTML, then publish again.'
    );
  }
}

function wpStatusFor(document) {
  if (String(document._id).startsWith(DRAFT_PREFIX)) return 'draft';
  const publishedAt = document.publishedAt ? new Date(document.publishedAt) : null;
  if (publishedAt && publishedAt.getTime() > Date.now()) return 'future';
  return 'publish';
}

function toWpPost(document, config, context) {
  const id = numericIdForDocument(document._id);
  const slug = document.slug?.current || '';
  const link = `${context.siteUrl}/posts/${slug}`;
  const html = portableTextToHtml(document.content);
  const excerpt = document.excerpt || '';
  const apiBase = `${context.siteUrl}/wp-json/wp/v2`;

  return {
    id,
    date: toWpDate(document.publishedAt),
    date_gmt: toWpDate(document.publishedAt),
    guid: { rendered: link, raw: link },
    modified: toWpDate(document._updatedAt),
    modified_gmt: toWpDate(document._updatedAt),
    password: '',
    slug,
    status: wpStatusFor(document),
    type: 'post',
    link,
    title: { raw: document.title || '', rendered: document.title || '' },
    content: { raw: html, rendered: html, protected: false, block_version: 0 },
    excerpt: {
      raw: excerpt,
      rendered: excerpt ? `<p>${excerpt}</p>` : '',
      protected: false,
    },
    author: 1,
    featured_media: document.image?.asset?._ref ? mediaIdForAsset(document.image.asset._ref) : 0,
    comment_status: 'closed',
    ping_status: 'closed',
    sticky: false,
    template: '',
    format: 'standard',
    meta: {},
    categories: [],
    tags: [],
    _links: {
      self: [{ href: `${apiBase}/posts/${id}` }],
      collection: [{ href: `${apiBase}/posts` }],
      about: [{ href: `${apiBase}/types/post` }],
    },
  };
}

/**
 * Build the Sanity document for a create or update, merging the incoming
 * WordPress payload over whatever already exists.
 */
async function buildPostDocument(client, config, payload, existing) {
  const title =
    pickRendered(payload.title) ?? existing?.title ?? 'Untitled';

  let content = existing?.content;
  if (payload.content !== undefined) {
    const incoming = pickRendered(payload.content) ?? '';
    assertNotMarkdown(incoming);
    content = await resolveImageBlocks(client, htmlToPortableText(incoming), config);
  }
  content = content || [];

  // An existing slug wins over a changed title so permalinks stay put.
  const slug =
    slugify(payload.slug || existing?.slug?.current || title) || `post-${Date.now()}`;

  const requestedDate = parseWpDate(payload.date_gmt || payload.date);
  const publishedAt =
    requestedDate?.toISOString() || existing?.publishedAt || new Date().toISOString();

  const document = {
    _type: 'post',
    title,
    slug: { _type: 'slug', current: slug },
    publishedAt,
    content,
    readTime: calculateReadTime(content),
  };

  const excerpt = pickRendered(payload.excerpt);
  if (excerpt !== undefined) {
    const text = stripHtml(excerpt);
    if (text) document.excerpt = text;
  } else if (existing?.excerpt) {
    document.excerpt = existing.excerpt;
  }

  if (payload.featured_media !== undefined) {
    const mediaId = Number(payload.featured_media);
    if (mediaId > 0) {
      const assetId = await findAssetByMediaId(client, mediaId);
      if (assetId) {
        document.image = { _type: 'image', asset: { _type: 'reference', _ref: assetId } };
      }
    }
  } else if (existing?.image) {
    document.image = existing.image;
  }

  return document;
}

/** WordPress fields arrive either as plain strings or as `{ raw, rendered }`. */
function pickRendered(field) {
  if (field === undefined || field === null) return undefined;
  if (typeof field === 'string') return field;
  if (typeof field === 'object') return field.raw ?? field.rendered ?? undefined;
  return String(field);
}

function stripHtml(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drop Sanity's own metadata so a document can be safely written back.
 * `_rev` in particular would turn a replace into an optimistic-locking check.
 */
function stripSystemFields(document) {
  if (!document) return {};
  const { _id, _rev, _createdAt, _updatedAt, _system, ...rest } = document;
  return rest;
}

/**
 * Write the document at the ID implied by its status, cleaning up the old one
 * when a post moves between draft and published.
 */
async function persistPost(client, document, numericId, status, previousId) {
  const targetId = documentIdForNumericId(numericId, status === 'draft');
  const saved = await client.createOrReplace({ ...document, _id: targetId });
  if (previousId && previousId !== targetId) {
    await client.delete(previousId);
  }
  return saved;
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Content-Disposition',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function wpError(statusCode, code, message) {
  return json(statusCode, { code, message, data: { status: statusCode } });
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  };
}

function timingSafeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    mismatch |= left.charCodeAt(i % left.length || 0) ^ right.charCodeAt(i % right.length || 0);
  }
  return mismatch === 0;
}

/** Application passwords are displayed in groups of four; spaces aren't data. */
function normalizeSecret(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

function isAuthorized(request, config) {
  const header = request.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (!/^basic$/i.test(scheme || '') || !encoded) return false;

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;

  const user = decoded.slice(0, separator);
  const secret = decoded.slice(separator + 1);
  return (
    timingSafeEqual(user.toLowerCase(), config.username.toLowerCase()) &&
    timingSafeEqual(normalizeSecret(secret), normalizeSecret(config.password))
  );
}

function appendQuery(url, params) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  if (!pairs.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${pairs.join('&')}`;
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

/* ------------------------------------------------------------------ *
 * The application-password authorization page
 * ------------------------------------------------------------------ */

function authorizePage({ appName, successUrl, rejectUrl, siteName, error }) {
  const target = successUrl ? new URL(successUrl, 'https://example.invalid').protocol : '';
  return html(
    error ? 401 : 200,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize application</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background:#0f1115; color:#e8eaed; padding:24px; }
  .card { width:100%; max-width:420px; background:#181b21; border:1px solid #272b33;
          border-radius:16px; padding:28px; }
  h1 { font-size:20px; margin:0 0 4px; }
  p { color:#9aa1ac; margin:0 0 20px; font-size:14px; }
  strong { color:#e8eaed; }
  label { display:block; font-size:13px; margin-bottom:8px; color:#9aa1ac; }
  input { width:100%; box-sizing:border-box; padding:12px 14px; font-size:16px;
          border-radius:10px; border:1px solid #333944; background:#0f1115; color:#e8eaed; }
  input:focus { outline:2px solid #4f86f7; outline-offset:1px; }
  .actions { display:flex; gap:10px; margin-top:20px; }
  button { flex:1; padding:12px 14px; font-size:15px; font-weight:600; border-radius:10px;
           border:0; cursor:pointer; }
  .approve { background:#4f86f7; color:#fff; }
  .reject { background:transparent; color:#9aa1ac; border:1px solid #333944; }
  .error { background:#3a1d22; border:1px solid #7f2d3a; color:#ffb4bd; padding:10px 12px;
           border-radius:10px; font-size:14px; margin-bottom:16px; }
  .meta { margin-top:18px; font-size:12px; color:#6b7280; word-break:break-all; }
</style>
</head>
<body>
  <form class="card" method="post">
    <h1>Authorize application</h1>
    <p><strong>${escapeAttribute(appName || 'An application')}</strong> would like to connect to
       <strong>${escapeAttribute(siteName)}</strong> and publish on your behalf.</p>
    ${error ? `<div class="error">${escapeAttribute(error)}</div>` : ''}
    <label for="secret">Publishing password</label>
    <input id="secret" name="secret" type="password" autocomplete="current-password"
           autofocus required />
    <input type="hidden" name="app_name" value="${escapeAttribute(appName || '')}" />
    <input type="hidden" name="success_url" value="${escapeAttribute(successUrl || '')}" />
    <input type="hidden" name="reject_url" value="${escapeAttribute(rejectUrl || '')}" />
    <div class="actions">
      <button class="reject" type="submit" name="action" value="reject">Cancel</button>
      <button class="approve" type="submit" name="action" value="approve">Yes, I approve</button>
    </div>
    ${successUrl ? `<div class="meta">You will be returned to <code>${escapeAttribute(target)}</code></div>` : ''}
  </form>
</body>
</html>`
  );
}

function handleAuthorize(request, config) {
  const appName = request.query.get('app_name') || request.form.get('app_name') || '';
  const successUrl = request.query.get('success_url') || request.form.get('success_url') || '';
  const rejectUrl = request.query.get('reject_url') || request.form.get('reject_url') || '';

  if (request.method !== 'POST') {
    return authorizePage({ appName, successUrl, rejectUrl, siteName: config.siteName });
  }

  if (request.form.get('action') === 'reject') {
    const destination = rejectUrl || (successUrl ? appendQuery(successUrl, { success: 'false' }) : null);
    if (!destination) return html(200, '<p>Connection rejected. You can close this page.</p>');
    return { statusCode: 302, headers: { Location: destination }, body: '' };
  }

  if (!timingSafeEqual(normalizeSecret(request.form.get('secret')), normalizeSecret(config.password))) {
    return authorizePage({
      appName,
      successUrl,
      rejectUrl,
      siteName: config.siteName,
      error: 'That password does not match. Please try again.',
    });
  }

  if (!successUrl) {
    // Mirrors WordPress' behaviour when an app can't accept a redirect.
    return html(
      200,
      `<p>Approved. Use these credentials:</p>
       <p>Username: <code>${escapeAttribute(config.username)}</code><br />
          Password: <code>${escapeAttribute(config.password)}</code></p>`
    );
  }

  return {
    statusCode: 302,
    headers: {
      Location: appendQuery(successUrl, {
        site_url: request.siteUrl,
        user_login: config.username,
        password: config.password,
      }),
      'Cache-Control': 'no-store',
    },
    body: '',
  };
}

/* ------------------------------------------------------------------ *
 * REST endpoints
 * ------------------------------------------------------------------ */

function apiRoot(config, context) {
  const apiBase = `${context.siteUrl}/wp-json`;
  const route = (methods) => ({ methods, endpoints: [{ methods, args: {} }] });

  return {
    name: config.siteName,
    description: config.siteDescription,
    url: context.siteUrl,
    home: context.siteUrl,
    gmt_offset: 0,
    timezone_string: 'UTC',
    namespaces: ['wp/v2'],
    authentication: {
      'application-passwords': {
        endpoints: {
          authorization: `${context.siteUrl}/wp-admin/authorize-application.php`,
        },
      },
    },
    routes: {
      '/': route(['GET']),
      '/wp/v2': route(['GET']),
      '/wp/v2/posts': route(['GET', 'POST']),
      '/wp/v2/posts/(?P<id>[\\d]+)': route(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      '/wp/v2/media': route(['GET', 'POST']),
      '/wp/v2/categories': route(['GET']),
      '/wp/v2/tags': route(['GET']),
      '/wp/v2/users/me': route(['GET']),
      '/wp/v2/types': route(['GET']),
      '/wp/v2/settings': route(['GET']),
    },
    _links: { 'wp:featuredmedia': [{ href: `${apiBase}/wp/v2/media` }] },
  };
}

function currentUser(config, context) {
  return {
    id: 1,
    name: config.username,
    url: context.siteUrl,
    description: '',
    link: context.siteUrl,
    slug: slugify(config.username) || 'author',
    avatar_urls: {},
    username: config.username,
    first_name: '',
    last_name: '',
    nickname: config.username,
    email: '',
    roles: ['administrator'],
    registered_date: new Date(0).toISOString(),
    capabilities: {
      read: true,
      edit_posts: true,
      publish_posts: true,
      delete_posts: true,
      edit_others_posts: true,
      upload_files: true,
      manage_categories: true,
    },
    extra_capabilities: { administrator: true },
    meta: {},
  };
}

async function listPosts(client, config, context, query) {
  const perPage = Math.min(Math.max(Number(query.get('per_page')) || 10, 1), 100);
  const page = Math.max(Number(query.get('page')) || 1, 1);
  const offset = (page - 1) * perPage;
  const slug = query.get('slug');
  const search = query.get('search');

  const filters = ['_type == "post"'];
  const params = {};
  if (slug) {
    filters.push('slug.current == $slug');
    params.slug = slug;
  }
  if (search) {
    filters.push('title match $search');
    params.search = `*${search}*`;
  }
  const where = filters.join(' && ');

  const [total, documents] = await Promise.all([
    client.fetch(`count(*[${where}])`, params),
    client.fetch(`*[${where}] | order(publishedAt desc) [$from...$to]`, {
      ...params,
      from: offset,
      to: offset + perPage,
    }),
  ]);

  return json(
    200,
    documents.map((document) => toWpPost(document, config, context)),
    {
      'X-WP-Total': String(total),
      'X-WP-TotalPages': String(Math.max(1, Math.ceil(total / perPage))),
    }
  );
}

async function createPost(client, config, context, payload) {
  const status = payload.status || 'publish';
  const numericId = await allocateNumericId(client);
  const document = await buildPostDocument(client, config, payload, null);
  const saved = await persistPost(client, document, numericId, status, null);
  await maybeTriggerRebuild(config, status);
  return json(201, toWpPost(saved, config, context));
}

async function updatePost(client, config, context, numericId, payload) {
  const existing = await findPostDocument(client, numericId);
  if (!existing) return wpError(404, 'rest_post_invalid_id', 'Invalid post ID.');

  const status = payload.status || wpStatusFor(existing);
  const updates = await buildPostDocument(client, config, payload, existing);
  // Writes are replacements, so carry over any fields the bridge doesn't know
  // about rather than silently dropping them from an imported post.
  const document = { ...stripSystemFields(existing), ...updates };

  // Imported posts keep their original document ID so their public URL and
  // history survive; only bridge-created posts move between draft and live.
  const keepsExistingId = !baseDocumentId(existing._id).startsWith(DOC_ID_PREFIX);
  const saved = keepsExistingId
    ? await client.createOrReplace({ ...document, _id: existing._id })
    : await persistPost(client, document, numericId, status, existing._id);

  await maybeTriggerRebuild(config, status);
  return json(200, toWpPost(saved, config, context));
}

async function uploadMedia(client, config, context, request) {
  const contentType = request.headers['content-type'] || 'application/octet-stream';
  if (!/^image\//i.test(contentType)) {
    return wpError(
      415,
      'rest_upload_invalid_type',
      `Only raw image uploads are supported by this bridge (received "${contentType}").`
    );
  }
  if (!request.bodyBuffer?.length) {
    return wpError(400, 'rest_upload_no_data', 'No file data was received.');
  }

  const disposition = request.headers['content-disposition'] || '';
  const filename =
    disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ||
    `upload.${contentType.split('/')[1] || 'bin'}`;

  const asset = await client.assets.upload('image', request.bodyBuffer, {
    filename: decodeURIComponent(filename),
  });

  return json(201, toWpMedia(asset, context, filename));
}

function toWpMedia(asset, context, filename) {
  const id = mediaIdForAsset(asset._id);
  const name = filename || asset.originalFilename || 'image';

  return {
    id,
    date: toWpDate(asset._createdAt),
    date_gmt: toWpDate(asset._createdAt),
    slug: slugify(name) || `media-${id}`,
    type: 'attachment',
    status: 'inherit',
    link: asset.url,
    title: { raw: name, rendered: name },
    author: 1,
    comment_status: 'closed',
    ping_status: 'closed',
    template: '',
    meta: {},
    description: { raw: '', rendered: '' },
    caption: { raw: '', rendered: '' },
    alt_text: '',
    media_type: 'image',
    mime_type: asset.mimeType || 'image/jpeg',
    media_details: {
      width: asset.metadata?.dimensions?.width || 0,
      height: asset.metadata?.dimensions?.height || 0,
      file: name,
      sizes: {},
    },
    post: 0,
    source_url: asset.url,
    _links: { self: [{ href: `${context.siteUrl}/wp-json/wp/v2/media/${id}` }] },
  };
}

async function maybeTriggerRebuild(config, status) {
  // Scheduled and draft posts aren't visible yet, so there's nothing to build.
  if (!config.triggerRebuild || !config.buildHookUrl || status !== 'publish') return;
  try {
    await fetch(config.buildHookUrl, { method: 'POST' });
  } catch (error) {
    console.warn(`[wp-bridge] build hook failed: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

export async function handleBridgeRequest(request, config = readConfig(), deps = {}) {
  if (request.method === 'OPTIONS') return json(204, null);

  const context = { siteUrl: request.siteUrl };
  const path =
    request.path.replace(/^\/\.netlify\/functions\/wordpress-bridge/, '').replace(/\/+$/, '') || '/';

  if (path === '/wp-admin/authorize-application.php') {
    if (!config.password) {
      return html(500, '<p>WP_BRIDGE_PASSWORD is not configured on this site.</p>');
    }
    return handleAuthorize(request, config);
  }

  const restPath = path.replace(/^\/wp-json/, '') || '/';

  // Discovery is deliberately unauthenticated: clients read it to find the
  // authorization endpoint before they hold any credentials.
  if (restPath === '/') return json(200, apiRoot(config, context));
  if (restPath === '/wp/v2') return json(200, { namespace: 'wp/v2', routes: {} });

  if (!config.password || !config.token) {
    return wpError(
      500,
      'rest_bridge_unconfigured',
      'The publishing bridge is missing SANITY_API_TOKEN or WP_BRIDGE_PASSWORD.'
    );
  }

  if (!isAuthorized(request, config)) {
    return json(
      401,
      {
        code: 'rest_not_logged_in',
        message: 'Incorrect username or application password.',
        data: { status: 401 },
      },
      { 'WWW-Authenticate': 'Basic realm="WordPress", charset="UTF-8"' }
    );
  }

  const client = deps.client || createSanityClient(config);

  try {
    if (restPath === '/wp/v2/users/me') return json(200, currentUser(config, context));
    if (restPath === '/wp/v2/users') return json(200, [currentUser(config, context)]);

    // The blog has no taxonomies; empty lists let Ulysses render its pickers.
    if (restPath === '/wp/v2/categories' || restPath === '/wp/v2/tags') {
      return json(200, [], { 'X-WP-Total': '0', 'X-WP-TotalPages': '1' });
    }

    if (restPath === '/wp/v2/settings') {
      return json(200, {
        title: config.siteName,
        description: config.siteDescription,
        url: context.siteUrl,
        timezone: 'UTC',
        date_format: 'F j, Y',
        time_format: 'g:i a',
        start_of_week: 0,
        language: 'en_US',
        default_category: 0,
        default_post_format: 'standard',
        posts_per_page: 10,
      });
    }

    if (restPath === '/wp/v2/types') {
      return json(200, { post: postType(context) });
    }
    if (restPath === '/wp/v2/types/post') {
      return json(200, postType(context));
    }
    if (restPath === '/wp/v2/statuses') {
      return json(200, {
        publish: { name: 'Published', public: true, slug: 'publish' },
        future: { name: 'Scheduled', public: false, slug: 'future' },
        draft: { name: 'Draft', public: false, slug: 'draft' },
      });
    }

    if (restPath === '/wp/v2/media' && request.method === 'POST') {
      return await uploadMedia(client, config, context, request);
    }

    const mediaMatch = restPath.match(/^\/wp\/v2\/media\/(\d+)$/);
    if (mediaMatch && request.method === 'GET') {
      const assetId = await findAssetByMediaId(client, Number(mediaMatch[1]));
      const asset = assetId ? await client.fetch('*[_id == $id][0]', { id: assetId }) : null;
      if (!asset) return wpError(404, 'rest_post_invalid_id', 'Invalid attachment ID.');
      return json(200, toWpMedia(asset, context));
    }

    if (restPath === '/wp/v2/posts') {
      if (request.method === 'GET') return await listPosts(client, config, context, request.query);
      if (request.method === 'POST') {
        return await createPost(client, config, context, request.json);
      }
      return wpError(405, 'rest_no_route', 'Method not allowed.');
    }

    const postMatch = restPath.match(/^\/wp\/v2\/posts\/(\d+)$/);
    if (postMatch) {
      const numericId = Number(postMatch[1]);
      if (request.method === 'GET') {
        const document = await findPostDocument(client, numericId);
        if (!document) return wpError(404, 'rest_post_invalid_id', 'Invalid post ID.');
        return json(200, toWpPost(document, config, context));
      }
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        return await updatePost(client, config, context, numericId, request.json);
      }
      if (request.method === 'DELETE') {
        const document = await findPostDocument(client, numericId);
        if (!document) return wpError(404, 'rest_post_invalid_id', 'Invalid post ID.');
        await client.delete(document._id);
        return json(200, { deleted: true, previous: toWpPost(document, config, context) });
      }
    }

    console.warn(`[wp-bridge] unhandled route: ${request.method} ${path}`);
    return wpError(404, 'rest_no_route', `No route was found matching ${path}.`);
  } catch (error) {
    if (error instanceof BridgeError) {
      return wpError(error.statusCode, error.code, error.message);
    }
    console.error(`[wp-bridge] ${request.method} ${path} failed:`, error);
    return wpError(500, 'rest_bridge_error', error.message || 'Unexpected bridge error.');
  }
}

function postType(context) {
  return {
    description: 'Blog posts stored in Sanity.',
    hierarchical: false,
    has_archive: false,
    name: 'Posts',
    slug: 'post',
    icon: null,
    taxonomies: [],
    rest_base: 'posts',
    rest_namespace: 'wp/v2',
    supports: { title: true, editor: true, excerpt: true, 'custom-fields': false },
    _links: { collection: [{ href: `${context.siteUrl}/wp-json/wp/v2/posts` }] },
  };
}
