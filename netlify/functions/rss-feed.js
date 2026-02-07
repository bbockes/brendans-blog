import { createClient } from '@sanity/client';

// GROQ query for posts - filter out future-dated posts to enable scheduling
const POSTS_QUERY = `*[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc) {
  _id,
  title,
  slug,
  excerpt,
  subheader,
  publishedAt,
  _updatedAt,
  content,
  "image": image.asset->url
}`;

// Get base URL from environment or headers
function getBaseUrl(event) {
  // In production, use the actual domain
  if (process.env.CONTEXT === 'production' || !process.env.CONTEXT) {
    return 'https://blog.brendanbockes.com';
  }
  // In preview/deploy contexts, use the deploy URL
  const host = event.headers?.host || event.headers?.Host || '';
  if (host) {
    return `https://${host}`;
  }
  return process.env.DEPLOY_PRIME_URL || process.env.NETLIFY_URL || 'https://blog.brendanbockes.com';
}

// Escape XML entities
function escapeXml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Escape XML entities in text content but preserve HTML tags
function escapeXmlText(text) {
  if (!text) return '';
  let escaped = String(text)
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
  escaped = escaped.replace(/]]>/g, ']]]]><![CDATA[>');
  return escaped;
}

function guessMimeTypeFromUrl(url) {
  if (!url) return 'application/octet-stream';
  try {
    const { pathname } = new URL(url);
    const ext = pathname.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'image/*';
    }
  } catch {
    return 'image/*';
  }
}

// Extract text from Portable Text content for description (with HTML links)
function extractTextFromContent(content) {
  if (!Array.isArray(content)) return '';
  
  const text = content
    .filter(block => block._type === 'block')
    .map(block => {
      if (!block.children || !Array.isArray(block.children)) return '';
      const markDefs = block.markDefs || [];
      
      return block.children
        .filter((child) => child._type === 'span' && child.text)
        .map((child) => {
          const marks = child.marks || [];
          let text = child.text;
          let linkHref = null;
          
          // Find link mark - handle both old format ("link-0") and new format ("d29f57cddebc")
          for (const mark of marks) {
            const markKey = typeof mark === 'string' ? mark : mark._key || mark.key;
            
            // Find the markDef - check if it's a link by looking at _type
            const linkDef = markDefs.find(def => {
              if (typeof mark === 'string') {
                return def._key === markKey && def._type === 'link';
              } else {
                return (def._key === markKey || def._key === mark._key) && def._type === 'link';
              }
            });
            
            // Check if this is a link mark (old format with "link-" prefix OR new format with linkDef)
            const isLinkMark = markKey && (
              markKey.startsWith('link-') || 
              (typeof mark === 'object' && mark._type === 'link') ||
              (linkDef && linkDef._type === 'link')
            );
            
            if (isLinkMark) {
              let href = null;
              if (linkDef && linkDef.href) {
                href = String(linkDef.href).trim();
              } else if (typeof mark === 'object' && mark.href) {
                href = String(mark.href).trim();
              }
              
              // Validate URL - skip invalid ones
              if (href) {
                if (href.match(/^https?:\/\/[^\/\s]+\.[^\/\s]+/i) || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) {
                  // Valid URL format
                  linkHref = href;
                  break;
                } else if (!href.match(/^https?:\/\//i)) {
                  // Missing protocol, add it
                  linkHref = 'https://' + href;
                  break;
                }
                // Invalid URL (like "http://Manus"), skip it
              }
            }
          }
          
          // Wrap in link if present
          if (linkHref) {
            const escapedHref = String(linkHref).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<a href="${escapedHref}">${escapedText}</a>`;
          }
          
          return text;
        })
        .join(' ');
    })
    .join(' ');
    
  return text;
}

// Convert Portable Text to HTML for RSS content:encoded
function portableTextToHTML(content) {
  if (!Array.isArray(content)) return '';
  
  const htmlParts = [];
  let currentListType = null;
  
  content.forEach(block => {
    if (block._type === 'block') {
      const style = block.style || 'normal';
      const children = block.children || [];
      const markDefs = block.markDefs || [];
      
      const processChild = (child) => {
        if (child._type !== 'span' || !child.text) return '';
        
        let text = escapeXmlText(child.text);
        const marks = child.marks || [];
        
        // Check for link first (it should wrap other marks)
        // Handle both string marks (like "link-0") and object marks
        // Check for link first (it should wrap other marks)
        // Handle both old format (like "link-0") and new format (like "d29f57cddebc")
        let linkHref = null;
        for (const mark of marks) {
          const markKey = typeof mark === 'string' ? mark : (mark._key || mark.key);
          
          // Find the markDef - check if it's a link by:
          // 1. Old format: mark key starts with "link-"
          // 2. New format: markDef exists and has _type === 'link'
          const linkDef = markDefs.find(def => {
            if (typeof mark === 'string') {
              return def._key === mark && def._type === 'link';
            } else {
              return (def._key === markKey || def._key === mark._key) && def._type === 'link';
            }
          });
          
          // Also check if mark itself indicates it's a link (old format)
          const isLinkMark = markKey && (
            markKey.startsWith('link-') || 
            (typeof mark === 'object' && mark._type === 'link') ||
            (linkDef && linkDef._type === 'link')
          );
          
          if (isLinkMark && linkDef && linkDef.href) {
            // Validate and fix URL
            let href = String(linkDef.href).trim();
            // Skip obviously invalid URLs (like "http://Manus" without a domain)
            if (href.match(/^https?:\/\/[^\/\s]+\.[^\/\s]+/i) || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) {
              // Valid URL format - use it
              linkHref = href.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
              break; // Found valid link, stop looking
            } else if (href && !href.match(/^https?:\/\//i)) {
              // Fix URLs that are missing protocol
              href = 'https://' + href;
              linkHref = href.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
              break;
            }
            // Invalid URL, continue to next mark
          } else if (typeof mark === 'object' && mark.href) {
            // Handle direct href in mark object
            let href = String(mark.href).trim();
            // Skip obviously invalid URLs
            if (href.match(/^https?:\/\/[^\/\s]+\.[^\/\s]+/i) || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) {
              // Valid URL format - use it
              linkHref = href.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
              break;
            } else if (href && !href.match(/^https?:\/\//i)) {
              href = 'https://' + href;
              linkHref = href.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
              break;
            }
            // Invalid URL, continue to next mark
          }
        }
        
        marks.forEach(mark => {
          if (typeof mark === 'string' && !mark.startsWith('link-')) {
            if (mark === 'strong') {
              text = `<strong>${text}</strong>`;
            } else if (mark === 'em') {
              text = `<em>${text}</em>`;
            } else if (mark === 'code') {
              text = `<code>${text}</code>`;
            }
          }
        });
        
        if (linkHref) {
          text = `<a href="${linkHref}">${text}</a>`;
        }
        
        return text;
      };
      
      const processedChildren = children.map(processChild).join('');
      
      if (block.listItem) {
        const listType = block.listItem;
        if (currentListType !== listType) {
          if (currentListType) {
            htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
          }
          currentListType = listType;
          htmlParts.push(`<${listType === 'bullet' ? 'ul' : 'ol'}>`);
        }
        htmlParts.push(`<li>${processedChildren}</li>`);
      } else {
        if (currentListType) {
          htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
          currentListType = null;
        }
        
        if (style === 'h1' && processedChildren) {
          htmlParts.push(`<h1>${processedChildren}</h1>`);
        } else if (style === 'h2' && processedChildren) {
          htmlParts.push(`<h2>${processedChildren}</h2>`);
        } else if (style === 'h3' && processedChildren) {
          htmlParts.push(`<h3>${processedChildren}</h3>`);
        } else if (style === 'h4' && processedChildren) {
          htmlParts.push(`<h4>${processedChildren}</h4>`);
        } else if (style === 'blockquote' && processedChildren) {
          htmlParts.push(`<blockquote>${processedChildren}</blockquote>`);
        } else if (style === 'normal' && processedChildren) {
          htmlParts.push(`<p>${processedChildren}</p>`);
        }
      }
    } else if (block._type === 'image') {
      if (currentListType) {
        htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
        currentListType = null;
      }
      
      const imageUrl = block.asset?.url || block.url || '';
      const alt = block.alt || '';
      if (imageUrl) {
        const escapedUrl = String(imageUrl).replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
        const escapedAlt = escapeXmlText(alt);
        htmlParts.push(`<img src="${escapedUrl}" alt="${escapedAlt}" />`);
      }
    } else if (block._type === 'code' || block._type === 'codeBlock') {
      if (currentListType) {
        htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
        currentListType = null;
      }
      
      const code = block.code?.code || block.code || '';
      const language = block.code?.language || '';
      const codeEscaped = escapeXmlText(code);
      if (codeEscaped) {
        htmlParts.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${codeEscaped}</code></pre>`);
      }
    }
  });
  
  if (currentListType) {
    htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
  }
  
  return htmlParts.join('\n');
}

// Format date to RFC 822 format for RSS
function formatRSSDate(date) {
  if (!date) return new Date().toUTCString();
  return new Date(date).toUTCString();
}

// Generate RSS feed XML
function generateRSSXML(posts, baseUrl) {
  const now = new Date().toUTCString();
  const siteTitle = "Brendan's Blog";
  const siteDescription = "The personal blog of Brendan Bockes. Thoughts on productivity, technology, and building.";
  
  const items = posts.map(post => {
    const slug = post.slug?.current || post._id;
    const postUrl = `${baseUrl}/posts/${slug}`;
    const pubDate = formatRSSDate(post.publishedAt);
    
    // Get description from excerpt, subheader, or content
    // Include HTML links in description for email clients that read description instead of content:encoded
    let description = post.excerpt || post.subheader || '';
    if (!description && post.content) {
      description = extractTextFromContent(post.content);
      // Limit to 300 characters for RSS description (but try to preserve HTML tags)
      if (description.length > 300) {
        // Try to cut at a word boundary or after a closing tag
        let truncated = description.substring(0, 297);
        const lastTag = truncated.lastIndexOf('</a>');
        if (lastTag > 250) {
          truncated = truncated.substring(0, lastTag + 4);
        } else {
          truncated += '...';
        }
        description = truncated;
      }
    }
    if (!description) {
      description = `Read ${post.title} on Brendan's Blog`;
    }
    
    const imageTag = post.image 
      ? `    <enclosure url="${escapeXml(post.image)}" type="${guessMimeTypeFromUrl(post.image)}" />`
      : '';
    
    const fullContent = post.content ? portableTextToHTML(post.content) : '';
    const contentEncoded = fullContent 
      ? `    <content:encoded><![CDATA[${fullContent}]]></content:encoded>`
      : '';
    
    // Check if description contains HTML (links)
    const hasHtmlInDescription = description.includes('<a ') || description.includes('<a>');
    const descriptionField = hasHtmlInDescription
      ? `<description><![CDATA[${description}]]></description>`
      : `<description>${escapeXml(description)}</description>`;
    
    return `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${postUrl}</link>
    <guid isPermaLink="true">${postUrl}</guid>
    <pubDate>${pubDate}</pubDate>
    ${descriptionField}
${imageTag}
${contentEncoded}
  </item>`;
  }).join('\n');
  
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <pubDate>${now}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${baseUrl}/images/logo.png</url>
      <title>${escapeXml(siteTitle)}</title>
      <link>${baseUrl}</link>
    </image>
${items}
  </channel>
</rss>`;
  
  return rss;
}

export const handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
      },
      body: 'Method not allowed'
    };
  }

  try {
    // Initialize Sanity client
    const sanityClient = createClient({
      projectId: process.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y',
      dataset: process.env.VITE_SANITY_DATASET || 'production',
      apiVersion: process.env.VITE_SANITY_API_VERSION || '2023-12-01',
      useCdn: true,
    });

    // Fetch posts from Sanity (with date filtering)
    const posts = await sanityClient.fetch(POSTS_QUERY);
    
    // Limit to most recent 50 posts for RSS feed
    const recentPosts = posts.slice(0, 50);
    
    // Get base URL
    const baseUrl = getBaseUrl(event);
    
    // Generate RSS XML
    const rssXML = generateRSSXML(recentPosts, baseUrl);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*',
      },
      body: rssXML
    };
  } catch (error) {
    console.error('RSS feed generation error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
      },
      body: `<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate RSS feed</error>`
    };
  }
};

