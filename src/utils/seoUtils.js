/**
 * SEO utilities for generating meta tag content
 * These functions are shared between client-side and server-side rendering
 */

// Helper function to extract text content from Portable Text for meta descriptions
export function extractTextFromContent(content) {
  if (!Array.isArray(content)) return '';
  
  const text = content
    .filter(block => block._type === 'block')
    .map(block => {
      if (!block.children || !Array.isArray(block.children)) return '';
      return block.children
        .filter((child) => child._type === 'span' && child.text)
        .map((child) => child.text)
        .join(' ');
    })
    .join(' ');
    
  // Limit to 160 characters for meta description
  return text.length > 160 ? text.substring(0, 157) + '...' : text;
}

// Generate meta description from post data
export function generateMetaDescription(post) {
  // Homepage (no post)
  if (!post) {
    return "The personal blog of Brendan Bockes. Thoughts on productivity, technology, and building.";
  }
  
  // Special case for 404 page
  if (post.id === '404') {
    return 'Uh-oh. Looks like that page doesn\'t exist.';
  }
  
  // Special case for about page
  if (post.id === 'about') {
    return 'Learn more about Brendan\'s Blog, the personal blog of Brendan Bockes.';
  }
  
  return post.excerpt || 
         post.subheader || 
         (post.content ? extractTextFromContent(post.content) : '') ||
         'A post from Brendan\'s Blog, the personal blog of Brendan Bockes.';
}

// Generate page title
export function generatePageTitle(post) {
  if (!post) {
    return "Brendan's Blog";
  }
  
  // Special case for 404 page
  if (post.id === '404') {
    return "Brendan's Blog";
  }
  
  // Special case for about page
  if (post.id === 'about') {
    return "About Brendan's Blog";
  }
  
  return `${post.title} | Brendan's Blog`;
}

// Default OG image (lives in /public so it is served from the site root)
export const DEFAULT_OG_IMAGE = '/OG-image.png';

function toAbsoluteUrl(possiblyRelativeUrl, pageUrl) {
  if (!possiblyRelativeUrl) return possiblyRelativeUrl;

  // Already absolute (http/https)
  if (/^https?:\/\//i.test(possiblyRelativeUrl)) return possiblyRelativeUrl;

  // Attempt to resolve relative URLs against the current page URL
  try {
    const u = new URL(pageUrl);
    // Absolute path on current origin
    if (possiblyRelativeUrl.startsWith('/')) {
      return `${u.origin}${possiblyRelativeUrl}`;
    }
    // Relative path (e.g. "images/x.png")
    return new URL(possiblyRelativeUrl, u.origin + u.pathname).toString();
  } catch {
    // If we can't parse pageUrl, fall back to returning original string
    return possiblyRelativeUrl;
  }
}

// Generate Open Graph meta tags HTML
export function generateOGMetaTags(post, url) {
  // Use the same SEO title and description functions for consistency
  const title = generatePageTitle(post);
  const description = generateMetaDescription(post);
  const image = toAbsoluteUrl(post?.image || DEFAULT_OG_IMAGE, url);
  const type = post ? 'article' : 'website';
  
  let metaTags = `
    <!-- prerender-seo:start -->
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="Brendan's Blog" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />
    
    <meta name="description" content="${escapeHtml(description)}" />
    <!-- prerender-seo:end -->`;
  
  // Add article-specific meta tags
  if (post) {
    if (post.category) {
      metaTags += `\n    <meta property="article:section" content="${escapeHtml(post.category)}" />`;
    }
    if (post.publishedAt || post.created_at) {
      metaTags += `\n    <meta property="article:published_time" content="${post.publishedAt || post.created_at}" />`;
    }
  }
  
  return metaTags;
}

// Escape HTML entities
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}