/**
 * HTML → Sanity Portable Text
 *
 * Ulysses publishes to WordPress by rendering its markup to HTML, so the
 * publishing bridge receives HTML and has to produce the Portable Text shape
 * declared in studio-brendans-blog/schemaTypes/postType.ts:
 *
 *   - block styles: normal, h1-h4, blockquote
 *   - lists: bullet, number
 *   - decorators: strong, em, code
 *   - annotations: link (href)
 *   - codeBlock objects: { code: { code, language, filename } }
 *   - image objects: { asset: reference, alt }
 *
 * Images can't be resolved synchronously (they have to be uploaded to Sanity
 * first), so they're emitted as placeholder blocks carrying `_imageUrl`. The
 * caller swaps them for real asset references, matching the convention already
 * used by scripts/substack-to-json.js and scripts/import-to-sanity.js.
 */

import { parse, NodeType } from 'node-html-parser';

const BLOCK_STYLE_BY_TAG = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  // The schema stops at h4, so deeper headings flatten into it rather than
  // silently losing their emphasis.
  h5: 'h4',
  h6: 'h4',
  blockquote: 'blockquote',
};

const DECORATOR_BY_TAG = {
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'i',
  code: 'code',
  mark: 'strong',
  del: 'em',
};

// Tags that introduce a new block when found inside a container we're already
// walking (e.g. a <div> wrapper full of paragraphs).
const BLOCK_LEVEL_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'pre',
  'figure',
  'hr',
  'table',
]);

let keyCounter = 0;

function generateKey(prefix) {
  keyCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${keyCounter.toString(36)}${random}`;
}

/** Reset key numbering so repeated conversions are deterministic in tests. */
export function resetKeyCounter() {
  keyCounter = 0;
}

function tagOf(node) {
  return node.rawTagName ? node.rawTagName.toLowerCase() : '';
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ');
}

/**
 * Accumulates spans for a single block, merging adjacent spans that carry the
 * same marks so we don't emit one span per text node.
 */
class SpanCollector {
  constructor() {
    this.spans = [];
    this.markDefs = [];
  }

  addText(text, marks) {
    if (!text) return;
    const last = this.spans[this.spans.length - 1];
    if (last && sameMarks(last.marks, marks)) {
      last.text += text;
      return;
    }
    this.spans.push({ _type: 'span', _key: generateKey('span'), text, marks: [...marks] });
  }

  addLinkDef(href) {
    const key = generateKey('link');
    this.markDefs.push({ _key: key, _type: 'link', href });
    return key;
  }

  /** Drop leading/trailing whitespace across the whole block. */
  finish() {
    const spans = this.spans;
    while (spans.length && !spans[0].text.trim()) spans.shift();
    while (spans.length && !spans[spans.length - 1].text.trim()) spans.pop();
    if (spans.length) {
      spans[0].text = spans[0].text.replace(/^\s+/, '');
      spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/\s+$/, '');
    }
    const used = new Set();
    spans.forEach((span) => span.marks.forEach((mark) => used.add(mark)));
    return {
      spans,
      markDefs: this.markDefs.filter((def) => used.has(def._key)),
    };
  }
}

function sameMarks(a, b) {
  if (a.length !== b.length) return false;
  return a.every((mark, index) => mark === b[index]);
}

function normalizeHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
  // Bare domains ("example.com/post") are common in hand-written links.
  if (/^[\w-]+(\.[\w-]+)+/.test(href)) return `https://${href}`;
  return null;
}

/** Walk inline content, tracking active decorators and link annotations. */
function collectInline(node, collector, marks) {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      collector.addText(collapseWhitespace(child.textContent ?? ''), marks);
      continue;
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;

    const tag = tagOf(child);

    if (tag === 'br') {
      collector.addText('\n', marks);
      continue;
    }

    // A <code> inside <pre> is a code block, handled at the block level.
    if (tag === 'a') {
      const href = normalizeHref(child.getAttribute('href'));
      const nextMarks = href ? [...marks, collector.addLinkDef(href)] : marks;
      collectInline(child, collector, nextMarks);
      continue;
    }

    const decorator = DECORATOR_BY_TAG[tag];
    if (decorator) {
      const nextMarks = marks.includes(decorator) ? marks : [...marks, decorator];
      collectInline(child, collector, nextMarks);
      continue;
    }

    collectInline(child, collector, marks);
  }
}

function buildTextBlock(node, style, listItem, level) {
  const collector = new SpanCollector();
  collectInline(node, collector, []);
  const { spans, markDefs } = collector.finish();
  if (!spans.length) return null;

  const block = {
    _type: 'block',
    _key: generateKey('block'),
    style: style || 'normal',
    markDefs,
    children: spans,
  };
  if (listItem) {
    block.listItem = listItem;
    block.level = level;
  }
  return block;
}

function imageBlockFrom(element) {
  const img = tagOf(element) === 'img' ? element : element.querySelector('img');
  if (!img) return null;
  const src = img.getAttribute('src') || img.getAttribute('data-src');
  if (!src) return null;

  const caption = element.querySelector?.('figcaption');
  const alt = img.getAttribute('alt') || (caption ? caption.textContent.trim() : '');

  return {
    _type: 'image',
    _key: generateKey('image'),
    _imageUrl: src,
    alt: alt || '',
  };
}

function codeBlockFrom(pre) {
  // The parser treats <pre> as a raw-text element, so its innerHTML is still
  // unparsed markup. Re-parsing it outside the <pre> exposes any <code>
  // wrapper (and its language class) while decoding entities exactly once.
  const inner = parse(pre.innerHTML);
  const codeEl = inner.querySelector('code');
  const source = codeEl || inner;
  const code = source.textContent.replace(/^\n/, '').replace(/\s+$/, '');
  if (!code.trim()) return null;

  const className = codeEl?.getAttribute('class') || '';
  const language = className.match(/(?:language|lang)-([\w+-]+)/)?.[1] || 'text';

  return {
    _type: 'codeBlock',
    _key: generateKey('code'),
    code: {
      _type: 'code',
      code,
      language,
      filename: pre.getAttribute('data-filename') || undefined,
    },
  };
}

function collectListItems(listEl, blocks, level) {
  const listItem = tagOf(listEl) === 'ol' ? 'number' : 'bullet';

  for (const child of listEl.childNodes) {
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;

    // Sub-lists are legal both inside an <li> and directly beside one.
    const childTag = tagOf(child);
    if (childTag === 'ul' || childTag === 'ol') {
      collectListItems(child, blocks, level + 1);
      continue;
    }
    if (childTag !== 'li') continue;

    // Split the <li> into its own inline content and any nested lists, so the
    // nested entries become sibling blocks with a deeper `level`.
    const nestedLists = [];
    const inlineOnly = [];
    for (const liChild of child.childNodes) {
      const liTag = liChild.nodeType === NodeType.ELEMENT_NODE ? tagOf(liChild) : '';
      if (liTag === 'ul' || liTag === 'ol') {
        nestedLists.push(liChild);
      } else {
        inlineOnly.push(liChild);
      }
    }

    const block = buildTextBlock({ childNodes: inlineOnly }, 'normal', listItem, level);
    if (block) blocks.push(block);
    nestedLists.forEach((nested) => collectListItems(nested, blocks, level + 1));
  }
}

function walk(node, blocks) {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      // Loose text directly inside a container still deserves a paragraph.
      if (child.textContent.trim()) {
        const block = buildTextBlock({ childNodes: [child] }, 'normal');
        if (block) blocks.push(block);
      }
      continue;
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;

    const tag = tagOf(child);

    if (tag === 'ul' || tag === 'ol') {
      collectListItems(child, blocks, 1);
      continue;
    }

    if (tag === 'pre') {
      const block = codeBlockFrom(child);
      if (block) blocks.push(block);
      continue;
    }

    if (tag === 'figure' || tag === 'img' || tag === 'picture') {
      const block = imageBlockFrom(child);
      if (block) blocks.push(block);
      continue;
    }

    if (tag === 'hr' || tag === 'script' || tag === 'style' || tag === 'noscript') {
      continue;
    }

    const style = BLOCK_STYLE_BY_TAG[tag];
    if (style) {
      // Blockquotes can wrap multiple paragraphs; each becomes its own block.
      if (tag === 'blockquote' && child.querySelector('p')) {
        for (const para of child.childNodes) {
          if (para.nodeType !== NodeType.ELEMENT_NODE) continue;
          const block = buildTextBlock(para, 'blockquote');
          if (block) blocks.push(block);
        }
        continue;
      }
      const block = buildTextBlock(child, style);
      if (block) blocks.push(block);
      continue;
    }

    // Containers that hold other block-level elements are descended into;
    // anything else is treated as a paragraph.
    const hasBlockChildren = child.childNodes.some(
      (grandChild) =>
        grandChild.nodeType === NodeType.ELEMENT_NODE && BLOCK_LEVEL_TAGS.has(tagOf(grandChild))
    );

    if (hasBlockChildren) {
      walk(child, blocks);
      continue;
    }

    const block = buildTextBlock(child, 'normal');
    if (block) blocks.push(block);
  }
}

/**
 * Convert an HTML fragment into Portable Text blocks.
 *
 * Image blocks come back with a temporary `_imageUrl` property that the caller
 * must replace with an uploaded Sanity asset reference.
 */
export function htmlToPortableText(html) {
  if (!html || !String(html).trim()) return [];

  const root = parse(String(html));

  const blocks = [];
  walk(root, blocks);
  return blocks;
}

/** Matches the slugify rule declared in the Studio's post schema. */
export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}
