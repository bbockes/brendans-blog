/**
 * Sanity Portable Text → HTML
 *
 * The WordPress REST API returns post bodies as HTML, so anything the bridge
 * reads back out of Sanity has to be re-rendered on the way out. This is a
 * deliberately small renderer covering exactly what postType.ts can store.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function renderSpan(span, markDefs) {
  if (span._type !== 'span' || !span.text) return '';

  let html = escapeHtml(span.text).replace(/\n/g, '<br />');
  const marks = Array.isArray(span.marks) ? span.marks : [];

  // Decorators nest inside the link so the anchor stays the outermost tag.
  for (const mark of marks) {
    if (mark === 'strong') html = `<strong>${html}</strong>`;
    else if (mark === 'em' || mark === 'i') html = `<em>${html}</em>`;
    else if (mark === 'code') html = `<code>${html}</code>`;
  }

  for (const mark of marks) {
    const def = markDefs.find((candidate) => candidate._key === mark);
    if (def && def._type === 'link' && def.href) {
      html = `<a href="${escapeHtml(def.href)}">${html}</a>`;
    }
  }

  return html;
}

function renderChildren(block) {
  const markDefs = Array.isArray(block.markDefs) ? block.markDefs : [];
  return (block.children || []).map((child) => renderSpan(child, markDefs)).join('');
}

export function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return '';

  const out = [];
  // Consecutive list items share one <ul>/<ol>; `openLists` tracks nesting
  // depth so Portable Text `level` maps onto real nested markup.
  const openLists = [];

  const closeListsTo = (depth) => {
    while (openLists.length > depth) {
      out.push(openLists.pop() === 'number' ? '</ol>' : '</ul>');
    }
  };

  for (const block of blocks) {
    if (block._type === 'block' && block.listItem) {
      const level = Math.max(1, block.level || 1);
      const kind = block.listItem === 'number' ? 'number' : 'bullet';

      if (openLists.length > level) closeListsTo(level);
      if (openLists.length && openLists.length === level && openLists[level - 1] !== kind) {
        closeListsTo(level - 1);
      }
      while (openLists.length < level) {
        out.push(kind === 'number' ? '<ol>' : '<ul>');
        openLists.push(kind);
      }

      out.push(`<li>${renderChildren(block)}</li>`);
      continue;
    }

    closeListsTo(0);

    if (block._type === 'block') {
      const content = renderChildren(block);
      if (!content) continue;
      const style = block.style || 'normal';
      if (style === 'blockquote') out.push(`<blockquote><p>${content}</p></blockquote>`);
      else if (/^h[1-6]$/.test(style)) out.push(`<${style}>${content}</${style}>`);
      else out.push(`<p>${content}</p>`);
      continue;
    }

    if (block._type === 'image') {
      const url = block.asset?.url || block.url || block._imageUrl;
      if (url) {
        out.push(
          `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt || '')}" /></figure>`
        );
      }
      continue;
    }

    if (block._type === 'codeBlock' || block._type === 'code') {
      const code = block.code?.code ?? block.code ?? '';
      const language = block.code?.language || block.language || '';
      if (String(code).trim()) {
        const classAttr = language ? ` class="language-${escapeHtml(language)}"` : '';
        out.push(`<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`);
      }
    }
  }

  closeListsTo(0);
  return out.join('\n');
}
