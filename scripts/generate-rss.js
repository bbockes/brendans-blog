#!/usr/bin/env node

/**
 * RSS feed generation script
 * Generates an RSS 2.0 feed with all blog posts
 */

import { createClient } from '@sanity/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import('./build-env.js');

// Sanity client configuration
const sanityClient = createClient({
  projectId: process.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y',
  dataset: process.env.VITE_SANITY_DATASET || 'production',
  apiVersion: process.env.VITE_SANITY_API_VERSION || '2023-12-01',
  useCdn: true,
});

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

// Base URL - use production domain for RSS feed
const BASE_URL = (process.env.CONTEXT === 'production' || !process.env.CONTEXT) 
  ? 'https://blog.brendanbockes.com'
  : (process.env.DEPLOY_PRIME_URL || process.env.NETLIFY_URL || 'https://blog.brendanbockes.com');

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
// Used for content that will be wrapped in CDATA
// CDATA allows raw HTML, so we only need to escape & and handle ]]>
function escapeXmlText(text) {
  if (!text) return '';
  let escaped = String(text)
    // Escape & but not already-escaped entities
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
  // Replace ]]> with ]]]]><![CDATA[> to prevent premature CDATA closure
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
    // If it's not a valid absolute URL, fall back gracefully
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
          
          // Find link mark
          for (const mark of marks) {
            const markKey = typeof mark === 'string' ? mark : mark._key || mark.key;
            if (markKey && (markKey.startsWith('link-') || (typeof mark === 'object' && mark._type === 'link'))) {
              const linkDef = markDefs.find(def => def._key === markKey || (typeof mark === 'object' && def._key === mark._key));
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
      
      // Process children to handle marks (bold, italic, links, etc.)
      const processChild = (child) => {
        if (child._type !== 'span' || !child.text) return '';
        
        // Escape text content but preserve HTML structure
        let text = escapeXmlText(child.text);
        const marks = child.marks || [];
        
        // Check for link first (it should wrap other marks)
        // Handle both string marks (like "link-0") and object marks
        let linkHref = null;
        for (const mark of marks) {
          const markKey = typeof mark === 'string' ? mark : (mark._key || mark.key);
          if (markKey && (markKey.startsWith('link-') || (typeof mark === 'object' && mark._type === 'link'))) {
            const linkDef = markDefs.find(def => {
              if (typeof mark === 'string') {
                return def._key === mark;
              } else {
                return def._key === markKey || def._key === mark._key;
              }
            });
            if (linkDef && linkDef.href) {
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
        }
        
        // Apply other marks (strong, em, code)
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
        
        // Wrap in link if present
        if (linkHref) {
          text = `<a href="${linkHref}">${text}</a>`;
        }
        
        return text;
      };
      
      const processedChildren = children.map(processChild).join('');
      
      // Handle lists
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
        // Close list if we were in one
        if (currentListType) {
          htmlParts.push(`</${currentListType === 'bullet' ? 'ul' : 'ol'}>`);
          currentListType = null;
        }
        
        // Wrap in appropriate HTML tag based on style
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
      // Close list if we were in one
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
      // Close list if we were in one
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
  
  // Close any remaining list
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
function generateRSSXML(posts) {
  const now = new Date().toUTCString();
  const siteTitle = "Brendan's Blog";
  const siteDescription = "The personal blog of Brendan Bockes. Thoughts on productivity, technology, and building.";
  
  const items = posts.map(post => {
    const slug = post.slug?.current || post._id;
    const postUrl = `${BASE_URL}/posts/${slug}`;
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
    
    // Generate full HTML content for content:encoded
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
    <link>${BASE_URL}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <pubDate>${now}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${BASE_URL}/images/logo.png</url>
      <title>${escapeXml(siteTitle)}</title>
      <link>${BASE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;
  
  return rss;
}

// Main RSS generation function
async function generateRSS() {
  console.log('📡 Starting RSS feed generation...');
  
  try {
    // Fetch posts from Sanity
    console.log('📡 Fetching posts from Sanity...');
    const posts = await sanityClient.fetch(POSTS_QUERY);
    console.log(`✅ Fetched ${posts.length} posts`);
    
    // Limit to most recent 50 posts for RSS feed
    const recentPosts = posts.slice(0, 50);
    
    // Generate RSS XML
    const rssXML = generateRSSXML(recentPosts);
    
    // Write RSS feed to dist directory (where it will be deployed)
    // Also write to public for local development
    const distDir = path.join(__dirname, '..', 'dist');
    const publicDir = path.join(__dirname, '..', 'public');
    const distRssPath = path.join(distDir, 'feed.xml');
    const publicRssPath = path.join(publicDir, 'feed.xml');
    
    // Ensure directories exist
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Write to both dist (for deployment) and public (for local dev)
    fs.writeFileSync(distRssPath, rssXML, 'utf8');
    fs.writeFileSync(publicRssPath, rssXML, 'utf8');
    console.log(`✅ Generated RSS feed with ${recentPosts.length} posts`);
    console.log(`📁 RSS feed saved to: ${distRssPath}`);
    console.log(`📁 RSS feed also saved to: ${publicRssPath}`);
    console.log(`🔗 Your RSS feed will be available at: ${BASE_URL}/feed.xml`);
    console.log('📤 Add a link to your RSS feed in your site header/footer');
    
    console.log('\n🎉 RSS feed generation complete!');
    
  } catch (error) {
    console.error('❌ RSS feed generation failed:', error);
    process.exit(1);
  }
}

// Run the RSS generation
generateRSS();

