#!/usr/bin/env node

/**
 * Tests for the WordPress publishing bridge.
 *
 * Usage:
 *   node scripts/test-wordpress-bridge.js           # offline, uses a fake Sanity client
 *   node scripts/test-wordpress-bridge.js --live    # additionally round-trips a real
 *                                                   # post through Sanity and deletes it
 *
 * The live run needs SANITY_API_TOKEN (read from .env) and creates exactly one
 * throwaway document, which it removes again before exiting.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import {
  handleBridgeRequest,
  createSanityClient,
  numericIdForDocument,
  assetIdFromSanityUrl,
} from '../netlify/lib/wordpressBridge.js';
import { htmlToPortableText } from '../netlify/lib/htmlToPortableText.js';
import { portableTextToHtml } from '../netlify/lib/portableTextToHtml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

/* ----------------------------- test harness ----------------------------- */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n     expected: ${expected}\n     actual:   ${actual}`);
  }
}

/* ------------------------------ fake Sanity ----------------------------- */

const TEST_CONFIG = {
  projectId: 'wxzoc64y',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: 'fake-token',
  username: 'brendan',
  password: 'abcd EFGH ijkl MNOP',
  siteName: "Brendan's Blog",
  siteDescription: 'Test site',
  triggerRebuild: false,
  buildHookUrl: null,
};

function createFakeClient() {
  const documents = new Map();
  const assets = new Map();

  const client = {
    documents,
    assets: {
      async upload(_type, buffer, options = {}) {
        const id = `image-fake${assets.size}-800x600-png`;
        const asset = {
          _id: id,
          _createdAt: new Date().toISOString(),
          url: `https://cdn.sanity.io/images/wxzoc64y/production/fake${assets.size}-800x600.png`,
          mimeType: 'image/png',
          metadata: { dimensions: { width: 800, height: 600 } },
          size: buffer.length,
          originalFilename: options.filename,
        };
        assets.set(id, asset);
        return asset;
      },
    },

    async fetch(query, params = {}) {
      const all = [...documents.values()];
      const posts = all.filter((doc) => doc._type === 'post');

      if (query.includes('count(*[_id in $ids])')) {
        return params.ids.filter((id) => documents.has(id)).length;
      }
      if (query.includes('*[_id in $ids][0]')) {
        return params.ids.map((id) => documents.get(id)).find(Boolean) || null;
      }
      if (query.includes('*[_id == $id][0]')) {
        return documents.get(params.id) || assets.get(params.id) || null;
      }
      if (query.includes('*[_type == "post"]._id')) {
        return posts.map((doc) => doc._id);
      }
      if (query.includes('sanity.imageAsset')) {
        return [...assets.keys()];
      }

      let matched = posts;
      if (params.slug) matched = matched.filter((doc) => doc.slug?.current === params.slug);
      if (params.search) {
        const needle = params.search.replace(/\*/g, '').toLowerCase();
        matched = matched.filter((doc) => (doc.title || '').toLowerCase().includes(needle));
      }
      if (query.startsWith('count(')) return matched.length;

      matched.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
      return matched.slice(params.from ?? 0, params.to ?? matched.length);
    },

    async createOrReplace(document) {
      const now = new Date().toISOString();
      const saved = {
        ...document,
        _createdAt: documents.get(document._id)?._createdAt || now,
        _updatedAt: now,
      };
      documents.set(document._id, saved);
      return saved;
    },

    async delete(id) {
      documents.delete(id);
      return { _id: id };
    },
  };

  return client;
}

/* ------------------------------ request help ---------------------------- */

function basicAuth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function makeRequest(overrides = {}) {
  const { query = '', form = '', headers = {}, body, ...rest } = overrides;
  return {
    method: 'GET',
    path: '/wp-json/',
    query: new URLSearchParams(query),
    form: new URLSearchParams(form),
    json: {},
    bodyBuffer: body || Buffer.alloc(0),
    headers,
    siteUrl: 'https://blog.brendanbockes.com',
    ...rest,
  };
}

function authed(overrides = {}) {
  return makeRequest({
    ...overrides,
    headers: {
      authorization: basicAuth(TEST_CONFIG.username, TEST_CONFIG.password),
      ...(overrides.headers || {}),
    },
  });
}

async function call(request, client) {
  const response = await handleBridgeRequest(request, TEST_CONFIG, { client });
  let parsed = null;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    parsed = null;
  }
  return { ...response, json: parsed };
}

/* --------------------------------- tests -------------------------------- */

async function runConversionTests() {
  console.log('\nContent conversion');

  await test('round-trips headings, emphasis, links and lists', async () => {
    const source =
      '<h2>Heading</h2><p>Some <strong>bold</strong> and <a href="https://example.com">link</a>.</p>' +
      '<ul><li>One</li><li>Two</li></ul>';
    const html = portableTextToHtml(htmlToPortableText(source));
    assert(html.includes('<h2>Heading</h2>'), 'heading lost');
    assert(html.includes('<strong>bold</strong>'), 'bold lost');
    assert(html.includes('<a href="https://example.com">link</a>'), 'link lost');
    assert(html.includes('<ul>') && html.includes('<li>Two</li>'), 'list lost');
  });

  await test('keeps nested list levels through a full round trip', async () => {
    const blocks = htmlToPortableText('<ul><li>One<ul><li>Deep</li></ul></li></ul>');
    assertEqual(
      blocks.map((block) => `${block.level}:${block.children[0].text}`).join(' '),
      '1:One 2:Deep',
      'nesting lost on the way in'
    );

    // Re-parsing our own output must yield the same structure, otherwise
    // editing a post in Ulysses would flatten its lists.
    const reparsed = htmlToPortableText(portableTextToHtml(blocks));
    assertEqual(
      reparsed.map((block) => `${block.level}:${block.children[0].text}`).join(' '),
      '1:One 2:Deep',
      'nesting lost on the way back out'
    );
  });

  await test('keeps ordered and unordered lists distinct', async () => {
    const blocks = htmlToPortableText('<ul><li>A</li></ul><ol><li>1</li></ol>');
    assertEqual(
      blocks.map((block) => block.listItem).join(','),
      'bullet,number',
      'list types confused'
    );
    const html = portableTextToHtml(blocks);
    assert(html.includes('<ul>') && html.includes('<ol>'), `both list types expected: ${html}`);
  });

  await test('produces schema-valid decorators only', async () => {
    const blocks = htmlToPortableText('<p><strong><em>x</em></strong> <code>y</code></p>');
    const allowed = new Set(['strong', 'em', 'code']);
    for (const block of blocks) {
      for (const child of block.children || []) {
        for (const mark of child.marks) {
          const isLink = (block.markDefs || []).some((def) => def._key === mark);
          assert(isLink || allowed.has(mark), `unexpected decorator "${mark}"`);
        }
      }
    }
  });

  await test('every block and span carries a _key', async () => {
    const blocks = htmlToPortableText('<p>a</p><ul><li>b</li></ul><pre><code>c</code></pre>');
    for (const block of blocks) {
      assert(block._key, `block missing _key: ${JSON.stringify(block)}`);
      for (const child of block.children || []) assert(child._key, 'span missing _key');
    }
  });

  await test('post ids are stable and never collide across the two schemes', async () => {
    assertEqual(numericIdForDocument('ulysses-81000000'), 81000000, 'bridge id not round-tripped');
    assertEqual(
      numericIdForDocument('drafts.ulysses-81000000'),
      81000000,
      'a draft must keep the same id as its published form'
    );

    // Imported posts have random UUIDs and get a hashed id in a reserved band
    // above every id the sequential scheme can reach for the next ~30 years.
    const legacy = numericIdForDocument('9d2b96ea-a57c-488a-a9a4-4769da81f384');
    assert(legacy >= 1_000_000_000, `legacy id ${legacy} fell into the bridge range`);
    assert(legacy < 2 ** 31, `legacy id ${legacy} overflows a 32-bit post id`);
    assertEqual(
      numericIdForDocument('9d2b96ea-a57c-488a-a9a4-4769da81f384'),
      legacy,
      'legacy ids must be deterministic'
    );
  });

  await test('recovers asset ids from Sanity CDN urls', async () => {
    const url = 'https://cdn.sanity.io/images/wxzoc64y/production/abc123-800x600.png';
    assertEqual(
      assetIdFromSanityUrl(url, TEST_CONFIG),
      'image-abc123-800x600-png',
      'asset id mismatch'
    );
    assertEqual(
      assetIdFromSanityUrl('https://example.com/x.png', TEST_CONFIG),
      null,
      'foreign url should not resolve'
    );
  });
}

async function runDiscoveryTests() {
  console.log('\nDiscovery and authentication');

  await test('advertises the application-password authorization endpoint', async () => {
    const response = await call(makeRequest({ path: '/wp-json/' }), createFakeClient());
    assertEqual(response.statusCode, 200, 'root should be public');
    assertEqual(
      response.json.authentication['application-passwords'].endpoints.authorization,
      'https://blog.brendanbockes.com/wp-admin/authorize-application.php',
      'authorization endpoint mismatch'
    );
    assert(response.json.namespaces.includes('wp/v2'), 'wp/v2 namespace missing');
  });

  await test('rejects unauthenticated API calls with a challenge', async () => {
    const response = await call(makeRequest({ path: '/wp-json/wp/v2/posts' }), createFakeClient());
    assertEqual(response.statusCode, 401, 'expected 401');
    assert(response.headers['WWW-Authenticate'], 'missing WWW-Authenticate header');
  });

  await test('accepts the application password with or without spaces', async () => {
    for (const secret of ['abcd EFGH ijkl MNOP', 'abcdEFGHijklMNOP']) {
      const response = await call(
        makeRequest({
          path: '/wp-json/wp/v2/users/me',
          headers: { authorization: basicAuth('brendan', secret) },
        }),
        createFakeClient()
      );
      assertEqual(response.statusCode, 200, `secret "${secret}" was rejected`);
    }
  });

  await test('rejects a wrong password', async () => {
    const response = await call(
      makeRequest({
        path: '/wp-json/wp/v2/users/me',
        headers: { authorization: basicAuth('brendan', 'nope') },
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 401, 'wrong password should fail');
  });

  await test('reports publishing capabilities for the current user', async () => {
    const response = await call(authed({ path: '/wp-json/wp/v2/users/me' }), createFakeClient());
    assert(response.json.capabilities.publish_posts, 'publish_posts capability missing');
    assert(response.json.capabilities.upload_files, 'upload_files capability missing');
  });
}

async function runAuthorizeTests() {
  console.log('\nApplication-password authorization flow');

  const successUrl = 'ulysses://x-callback-url/wordpress?id=42';

  await test('renders an approval form', async () => {
    const response = await call(
      makeRequest({
        path: '/wp-admin/authorize-application.php',
        query: `app_name=Ulysses&success_url=${encodeURIComponent(successUrl)}`,
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 200, 'expected the form');
    assert(response.body.includes('Ulysses'), 'app name not shown');
    assert(response.body.includes('name="secret"'), 'password field missing');
  });

  await test('refuses approval without the publishing password', async () => {
    const response = await call(
      makeRequest({
        method: 'POST',
        path: '/wp-admin/authorize-application.php',
        form: `action=approve&secret=wrong&success_url=${encodeURIComponent(successUrl)}`,
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 401, 'expected rejection');
    assert(!response.body.includes(TEST_CONFIG.password), 'password must not leak');
  });

  await test('redirects back with credentials once approved', async () => {
    const response = await call(
      makeRequest({
        method: 'POST',
        path: '/wp-admin/authorize-application.php',
        form: `action=approve&secret=${encodeURIComponent(TEST_CONFIG.password)}&success_url=${encodeURIComponent(successUrl)}`,
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 302, 'expected a redirect');
    const location = new URL(response.headers.Location);
    assertEqual(location.protocol, 'ulysses:', 'custom scheme not preserved');
    assertEqual(location.searchParams.get('id'), '42', 'original query param lost');
    assertEqual(location.searchParams.get('user_login'), 'brendan', 'user_login missing');
    assertEqual(location.searchParams.get('password'), TEST_CONFIG.password, 'password missing');
  });

  await test('honours a rejection', async () => {
    const response = await call(
      makeRequest({
        method: 'POST',
        path: '/wp-admin/authorize-application.php',
        form: `action=reject&reject_url=${encodeURIComponent('ulysses://cancel')}`,
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 302, 'expected a redirect');
    assertEqual(response.headers.Location, 'ulysses://cancel', 'wrong rejection target');
  });
}

async function runPublishingTests() {
  console.log('\nPublishing');

  await test('creates a post and stores Portable Text in Sanity', async () => {
    const client = createFakeClient();
    const response = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: {
          title: 'Hello From Ulysses',
          content: '<p>First <strong>paragraph</strong>.</p><h2>Section</h2><p>More words here.</p>',
          status: 'publish',
          excerpt: 'A short summary.',
        },
      }),
      client
    );

    assertEqual(response.statusCode, 201, `expected 201, body: ${response.body}`);
    assertEqual(response.json.status, 'publish', 'wrong status');
    assertEqual(response.json.slug, 'hello-from-ulysses', 'slug not derived from title');
    assertEqual(
      response.json.link,
      'https://blog.brendanbockes.com/posts/hello-from-ulysses',
      'permalink should match the blog route'
    );

    const [document] = [...client.documents.values()];
    assertEqual(document._type, 'post', 'wrong document type');
    assert(!document._id.startsWith('drafts.'), 'published post should not be a draft');
    assertEqual(document.slug._type, 'slug', 'slug must use the slug type');
    assertEqual(document.excerpt, 'A short summary.', 'excerpt not stored');
    assert(document.readTime.endsWith('min'), `unexpected readTime ${document.readTime}`);
    assertEqual(document.content[0]._type, 'block', 'content is not Portable Text');
    assertEqual(document.content[1].style, 'h2', 'heading style lost');
  });

  await test('stores a draft as a Sanity draft so the site cannot see it', async () => {
    const client = createFakeClient();
    const response = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: { title: 'Work In Progress', content: '<p>Draft body.</p>', status: 'draft' },
      }),
      client
    );

    assertEqual(response.json.status, 'draft', 'status should be draft');
    const [document] = [...client.documents.values()];
    assert(document._id.startsWith('drafts.'), `expected a drafts.* id, got ${document._id}`);
  });

  await test('maps a future date onto the existing scheduling behaviour', async () => {
    const client = createFakeClient();
    const scheduled = new Date(Date.now() + 7 * 86400_000).toISOString().replace(/\.\d{3}Z$/, '');
    const response = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: {
          title: 'Scheduled Post',
          content: '<p>Later.</p>',
          status: 'future',
          date_gmt: scheduled,
        },
      }),
      client
    );

    assertEqual(response.json.status, 'future', 'should report as scheduled');
    const [document] = [...client.documents.values()];
    assert(
      new Date(document.publishedAt).getTime() > Date.now(),
      'publishedAt must stay in the future so the GROQ filter hides it'
    );
  });

  await test('updates an existing post in place', async () => {
    const client = createFakeClient();
    const created = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: { title: 'Original', content: '<p>v1</p>', status: 'publish' },
      }),
      client
    );

    const updated = await call(
      authed({
        method: 'POST',
        path: `/wp-json/wp/v2/posts/${created.json.id}`,
        json: { title: 'Revised', content: '<p>v2</p>' },
      }),
      client
    );

    assertEqual(updated.statusCode, 200, `expected 200, body: ${updated.body}`);
    assertEqual(updated.json.id, created.json.id, 'post id should be stable across updates');
    assertEqual(updated.json.title.raw, 'Revised', 'title not updated');
    assertEqual(client.documents.size, 1, 'update must not create a second document');
    const [document] = [...client.documents.values()];
    assertEqual(document.content[0].children[0].text, 'v2', 'body not updated');
  });

  await test('promoting a draft to published removes the draft document', async () => {
    const client = createFakeClient();
    const created = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: { title: 'Later Published', content: '<p>x</p>', status: 'draft' },
      }),
      client
    );

    await call(
      authed({
        method: 'POST',
        path: `/wp-json/wp/v2/posts/${created.json.id}`,
        json: { status: 'publish' },
      }),
      client
    );

    const ids = [...client.documents.keys()];
    assertEqual(ids.length, 1, `expected one document, got ${ids.join(', ')}`);
    assert(!ids[0].startsWith('drafts.'), `draft was not cleaned up: ${ids[0]}`);
  });

  await test('fetches a post back by its numeric id', async () => {
    const client = createFakeClient();
    const created = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: { title: 'Readable', content: '<p>Body text.</p>', status: 'publish' },
      }),
      client
    );

    const fetched = await call(
      authed({ path: `/wp-json/wp/v2/posts/${created.json.id}` }),
      client
    );
    assertEqual(fetched.statusCode, 200, 'should find the post');
    assert(fetched.json.content.rendered.includes('Body text.'), 'content not rendered back');
  });

  await test('returns 404 for an unknown post id', async () => {
    const response = await call(authed({ path: '/wp-json/wp/v2/posts/424242' }), createFakeClient());
    assertEqual(response.statusCode, 404, 'expected 404');
    assertEqual(response.json.code, 'rest_post_invalid_id', 'wrong error code');
  });

  await test('lists posts with WordPress pagination headers', async () => {
    const client = createFakeClient();
    for (const title of ['One', 'Two', 'Three']) {
      await call(
        authed({
          method: 'POST',
          path: '/wp-json/wp/v2/posts',
          json: { title, content: `<p>${title}</p>`, status: 'publish' },
        }),
        client
      );
    }

    const response = await call(
      authed({ path: '/wp-json/wp/v2/posts', query: 'per_page=2&page=1' }),
      client
    );
    assertEqual(response.json.length, 2, 'per_page not applied');
    assertEqual(response.headers['X-WP-Total'], '3', 'X-WP-Total wrong');
    assertEqual(response.headers['X-WP-TotalPages'], '2', 'X-WP-TotalPages wrong');
  });

  await test('uploads media and links it into post content', async () => {
    const client = createFakeClient();
    const upload = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/media',
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="photo.png"',
        },
        body: Buffer.from('fake-png-bytes'),
      }),
      client
    );

    assertEqual(upload.statusCode, 201, `expected 201, body: ${upload.body}`);
    assert(upload.json.source_url.includes('cdn.sanity.io'), 'media should live on the Sanity CDN');

    // Ulysses references the uploaded URL from the post body; that must come
    // back as a real asset reference rather than a remote <img>.
    const created = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: {
          title: 'With Image',
          content: `<p>Look:</p><figure><img src="${upload.json.source_url}" alt="A photo" /></figure>`,
          status: 'publish',
          featured_media: upload.json.id,
        },
      }),
      client
    );
    assertEqual(created.statusCode, 201, `expected 201, body: ${created.body}`);

    const document = [...client.documents.values()].find((doc) => doc._type === 'post');
    const imageBlock = document.content.find((block) => block._type === 'image');
    assert(imageBlock, 'image block missing from content');
    assert(imageBlock.asset?._ref?.startsWith('image-'), 'image not converted to an asset ref');
    assert(!imageBlock._imageUrl, 'placeholder url should be removed');
    assertEqual(imageBlock.alt, 'A photo', 'alt text lost');
    assert(document.image?.asset?._ref, 'featured image not stored on the document');
  });

  await test('reads an uploaded image back by its media id', async () => {
    const client = createFakeClient();
    const upload = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/media',
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="photo.png"',
        },
        body: Buffer.from('bytes'),
      }),
      client
    );

    const fetched = await call(
      authed({ path: `/wp-json/wp/v2/media/${upload.json.id}` }),
      client
    );
    assertEqual(fetched.statusCode, 200, `expected 200, body: ${fetched.body}`);
    assertEqual(fetched.json.source_url, upload.json.source_url, 'media url mismatch');
  });

  await test('editing an imported post keeps its id, slug and unmanaged fields', async () => {
    const client = createFakeClient();
    // Mimic a Substack-imported document: random UUID, plus a field the
    // bridge knows nothing about.
    const legacyId = '9d2b96ea-a57c-488a-a9a4-4769da81f384';
    await client.createOrReplace({
      _id: legacyId,
      _type: 'post',
      title: 'Imported Post',
      slug: { _type: 'slug', current: 'imported-post' },
      publishedAt: '2025-01-01T03:00:00Z',
      content: [],
      category: 'Productivity',
    });

    const numericId = numericIdForDocument(legacyId);
    const updated = await call(
      authed({
        method: 'POST',
        path: `/wp-json/wp/v2/posts/${numericId}`,
        json: { title: 'Imported Post, Revised', content: '<p>New body.</p>' },
      }),
      client
    );

    assertEqual(updated.statusCode, 200, `expected 200, body: ${updated.body}`);
    assertEqual(client.documents.size, 1, 'update must not fork the document');

    const document = client.documents.get(legacyId);
    assert(document, 'the original document id must be preserved');
    assertEqual(document.category, 'Productivity', 'unmanaged field was dropped');
    assertEqual(document.slug.current, 'imported-post', 'permalink should not change');
    assertEqual(document.title, 'Imported Post, Revised', 'title not updated');
    assert(!('_rev' in document), '_rev must not be written back');
  });

  await test('rejects non-image uploads with a clear message', async () => {
    const response = await call(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/media',
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
        body: Buffer.from('...'),
      }),
      createFakeClient()
    );
    assertEqual(response.statusCode, 415, 'expected 415');
  });
}

/* ------------------------------- live check ------------------------------ */

async function runLiveTest() {
  console.log('\nLive Sanity round-trip');

  if (!process.env.SANITY_API_TOKEN) {
    console.log('  ⏭️  skipped (SANITY_API_TOKEN not set)');
    return;
  }

  const config = {
    ...TEST_CONFIG,
    token: process.env.SANITY_API_TOKEN,
    projectId: process.env.SANITY_PROJECT_ID || 'wxzoc64y',
    dataset: process.env.SANITY_DATASET || 'production',
  };
  const client = createSanityClient(config);
  const marker = `Bridge Test ${Date.now()}`;
  let documentId = null;

  try {
    const created = await handleBridgeRequest(
      authed({
        method: 'POST',
        path: '/wp-json/wp/v2/posts',
        json: {
          title: marker,
          content: '<p>Written by the bridge test. Safe to delete.</p>',
          status: 'draft',
        },
      }),
      config,
      { client }
    );
    const createdPost = JSON.parse(created.body);
    await test('creates a real draft document', async () => {
      assertEqual(created.statusCode, 201, `expected 201, body: ${created.body}`);
      assertEqual(createdPost.status, 'draft', 'should be a draft');
    });

    documentId = `drafts.ulysses-${createdPost.id}`;

    await test('the document is readable from Sanity with the expected shape', async () => {
      const document = await client.fetch('*[_id == $id][0]', { id: documentId });
      assert(document, `document ${documentId} not found`);
      assertEqual(document._type, 'post', 'wrong _type');
      assertEqual(document.title, marker, 'title mismatch');
      assertEqual(document.content[0]._type, 'block', 'content is not Portable Text');
    });

    await test('the draft stays invisible to the public site query', async () => {
      const publicClient = createSanityClient({ ...config, token: undefined });
      const visible = await publicClient.fetch(
        'count(*[_type == "post" && title == $title && publishedAt <= now()])',
        { title: marker }
      );
      assertEqual(visible, 0, 'draft leaked into the published feed');
    });

    await test('updates the live document through the bridge', async () => {
      const updated = await handleBridgeRequest(
        authed({
          method: 'POST',
          path: `/wp-json/wp/v2/posts/${createdPost.id}`,
          json: { content: '<p>Updated body.</p><ul><li>item</li></ul>' },
        }),
        config,
        { client }
      );
      assertEqual(updated.statusCode, 200, `expected 200, body: ${updated.body}`);
      const document = await client.fetch('*[_id == $id][0]', { id: documentId });
      assertEqual(document.content[1].listItem, 'bullet', 'list item not stored');
    });
  } finally {
    if (documentId) {
      await client.delete(documentId).catch(() => {});
      const remaining = await client.fetch('count(*[_id == $id])', { id: documentId });
      await test('cleans up the test document', async () => {
        assertEqual(remaining, 0, 'test document was left behind');
      });
    }
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  console.log('WordPress bridge test suite');

  await runConversionTests();
  await runDiscoveryTests();
  await runAuthorizeTests();
  await runPublishingTests();

  if (process.argv.includes('--live')) await runLiveTest();
  else console.log('\nLive Sanity round-trip\n  ⏭️  skipped (pass --live to enable)');

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(({ name, error }) => console.log(`  • ${name}: ${error.message}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
