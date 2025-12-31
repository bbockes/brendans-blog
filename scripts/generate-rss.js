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

// GROQ query for posts
const POSTS_QUERY = `*[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
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

// Extract text from Portable Text content for description
function extractTextFromContent(content) {
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
    
  return text;
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
    let description = post.excerpt || post.subheader || '';
    if (!description && post.content) {
      description = extractTextFromContent(post.content);
      // Limit to 300 characters for RSS description
      if (description.length > 300) {
        description = description.substring(0, 297) + '...';
      }
    }
    if (!description) {
      description = `Read ${post.title} on Brendan's Blog`;
    }
    
    const imageTag = post.image 
      ? `    <enclosure url="${escapeXml(post.image)}" type="${guessMimeTypeFromUrl(post.image)}" />`
      : '';
    
    return `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${postUrl}</link>
    <guid isPermaLink="true">${postUrl}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapeXml(description)}</description>
${imageTag}
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
      <url>${BASE_URL}/logo.png</url>
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

