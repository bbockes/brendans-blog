#!/usr/bin/env node

/**
 * Pre-rendering script for generating static HTML files with proper meta tags
 * This ensures social media crawlers can access Open Graph meta tags
 */

import { createClient } from '@sanity/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import utilities and data (now using .js files)
import { generateOGMetaTags, generatePageTitle } from '../src/utils/seoUtils.js';
import { aboutPost, notFoundPost } from '../src/data/staticData.js';
import { slugify } from '../src/utils/slugifyUtils.js';

// Load environment variables
import('./build-env.js');

// Sanity client configuration
const sanityClient = createClient({
  projectId: process.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y',
  dataset: process.env.VITE_SANITY_DATASET || 'production',
  apiVersion: process.env.VITE_SANITY_API_VERSION || '2023-12-01',
  useCdn: true,
});

// GROQ queries - filter out future-dated posts to enable scheduling
const POSTS_QUERY = `*[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc) {
  _id,
  title,
  slug,
  excerpt,
  readTime,
  publishedAt,
  content,
  "image": image.asset->url + "?w=1200&auto=format&q=80",
  subheader
}`;

// Generate static HTML for a route using the built index.html as template
function generateHTML(title, metaTags, baseHTML) {
  // Extract the existing meta tags and title from the base HTML
  let html = baseHTML;
  
  // Replace the title
  html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  // If we've already injected prerender SEO tags before, remove them to avoid duplicates
  html = html.replace(/<!-- prerender-seo:start -->[\s\S]*?<!-- prerender-seo:end -->\s*/g, '');
  
  // Find the closing </head> tag and insert our meta tags before it
  html = html.replace('</head>', `    ${metaTags}\n  </head>`);
  
  return html;
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

// Write file with directory creation
function writeFileWithDirs(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// Main pre-rendering function
async function prerender() {
  console.log('🚀 Starting pre-rendering process...');
  
  try {
    const distDir = path.join(__dirname, '..', 'dist');
    const baseIndexPath = path.join(distDir, 'index.html');
    
    // Check if the built index.html exists
    if (!fs.existsSync(baseIndexPath)) {
      console.error('❌ Built index.html not found. Make sure to run `npm run build` first.');
      process.exit(1);
    }
    
    // Read the built index.html as our base template
    const baseHTML = fs.readFileSync(baseIndexPath, 'utf8');
    console.log('✅ Loaded base HTML template from built index.html');
    
    // Fetch posts from Sanity
    console.log('📡 Fetching posts from Sanity...');
    const posts = await sanityClient.fetch(POSTS_QUERY);
    console.log(`✅ Fetched ${posts.length} posts`);
    
    // Transform posts to match expected format
    const transformedPosts = posts.map(post => ({
      ...post,
      id: post._id,
      read_time: post.readTime,
      created_at: post.publishedAt,
      slug: post.slug?.current || slugify(post.title)
    }));
    
    // Use production domain for prerendering
    const baseUrl = (process.env.CONTEXT === 'production' || !process.env.CONTEXT)
      ? 'https://blog.brendanbockes.com'
      : (process.env.DEPLOY_PRIME_URL || process.env.NETLIFY_URL || 'https://blog.brendanbockes.com');
    
    console.log('📝 Generating static HTML files...');
    
    // 1. Generate homepage (keep the original index.html but add meta tags)
    const homeTitle = generatePageTitle(null);
    const homeMetaTags = generateOGMetaTags(null, baseUrl);
    const homeHTML = generateHTML(homeTitle, homeMetaTags, baseHTML);
    writeFileWithDirs(path.join(distDir, 'index.html'), homeHTML);
    console.log('✅ Updated homepage with meta tags');
    
    // 2. Generate about page
    const aboutTitle = generatePageTitle(aboutPost);
    const aboutMetaTags = generateOGMetaTags(aboutPost, `${baseUrl}/about`);
    const aboutHTML = generateHTML(aboutTitle, aboutMetaTags, baseHTML);
    writeFileWithDirs(path.join(distDir, 'about', 'index.html'), aboutHTML);
    console.log('✅ Generated about page');
    
    // 3. Generate individual post pages
    let postCount = 0;
    for (const post of transformedPosts) {
      const postTitle = generatePageTitle(post);
      const postUrl = `${baseUrl}/posts/${post.slug}`;
      const postMetaTags = generateOGMetaTags(post, postUrl);
      const postHTML = generateHTML(postTitle, postMetaTags, baseHTML);
      writeFileWithDirs(path.join(distDir, 'posts', post.slug, 'index.html'), postHTML);
      postCount++;
    }
    console.log(`✅ Generated ${postCount} post pages`);
    
    // 4. Generate 404 page
    const notFoundTitle = generatePageTitle(notFoundPost);
    const notFoundMetaTags = generateOGMetaTags(notFoundPost, `${baseUrl}/404`);
    const notFoundHTML = generateHTML(notFoundTitle, notFoundMetaTags, baseHTML);
    writeFileWithDirs(path.join(distDir, '404.html'), notFoundHTML);
    console.log('✅ Generated 404 page');
    
    console.log(`🎉 Pre-rendering complete! Generated ${postCount + 3} HTML files.`);
    
  } catch (error) {
    console.error('❌ Pre-rendering failed:', error);
    process.exit(1);
  }
}

// Run the pre-rendering
prerender();