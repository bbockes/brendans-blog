#!/usr/bin/env node

/**
 * XML Sitemap generation script
 * Generates a sitemap.xml file with all blog posts and static pages
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
  publishedAt,
  _updatedAt
}`;

// Base URL - uses Netlify environment variables or falls back to default
const BASE_URL = process.env.NETLIFY_URL || process.env.DEPLOY_PRIME_URL || 'https://blog.brendanbockes.com';

// Generate XML sitemap content
function generateSitemapXML(urls) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  
  return xml;
}

// Format date to W3C datetime format
function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

// Main sitemap generation function
async function generateSitemap() {
  console.log('🗺️ Starting XML sitemap generation...');
  
  try {
    // Fetch posts from Sanity
    console.log('📡 Fetching posts from Sanity...');
    const posts = await sanityClient.fetch(POSTS_QUERY);
    console.log(`✅ Fetched ${posts.length} posts`);
    
    const urls = [];
    const currentDate = formatDate(new Date());
    
    // Add homepage
    urls.push({
      loc: BASE_URL,
      lastmod: currentDate,
      changefreq: 'daily',
      priority: '1.0'
    });
    
    // Add about page
    urls.push({
      loc: `${BASE_URL}/about`,
      lastmod: currentDate,
      changefreq: 'monthly',
      priority: '0.8'
    });
    
    // Add blog posts
    posts.forEach(post => {
      const slug = post.slug?.current || post._id;
      const lastmod = formatDate(post._updatedAt || post.publishedAt || new Date());
      
      urls.push({
        loc: `${BASE_URL}/posts/${slug}`,
        lastmod: lastmod,
        changefreq: 'monthly',
        priority: '0.7'
      });
    });
    
    // Generate XML
    const sitemapXML = generateSitemapXML(urls);
    
    // Write sitemap to public directory
    const publicDir = path.join(__dirname, '..', 'public');
    const sitemapPath = path.join(publicDir, 'sitemap.xml');
    
    // Ensure public directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(sitemapPath, sitemapXML, 'utf8');
    console.log(`✅ Generated sitemap with ${urls.length} URLs`);
    console.log(`📁 Sitemap saved to: ${sitemapPath}`);
    
    // Log URLs for verification
    console.log('\n📋 Sitemap URLs:');
    urls.forEach(url => {
      console.log(`  ${url.loc} (priority: ${url.priority})`);
    });
    
    console.log('\n🎉 Sitemap generation complete!');
    console.log(`🔗 Your sitemap will be available at: ${BASE_URL}/sitemap.xml`);
    console.log('📤 Remember to submit this sitemap to Google Search Console');
    
  } catch (error) {
    console.error('❌ Sitemap generation failed:', error);
    process.exit(1);
  }
}

// Run the sitemap generation
generateSitemap();