#!/usr/bin/env node

/**
 * List Skipped Posts Script
 * 
 * This script identifies which posts from the Substack export don't match posts in Sanity
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yauzl from 'yauzl';
import { JSDOM } from 'jsdom';
import { createClient } from '@sanity/client';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Sanity configuration
const projectId = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y';
const dataset = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
const apiToken = process.env.SANITY_API_TOKEN;
const apiVersion = process.env.SANITY_API_VERSION || '2024-01-01';

if (!apiToken) {
  console.error('❌ Error: SANITY_API_TOKEN environment variable is required');
  process.exit(1);
}

// Create Sanity client
const client = createClient({
  projectId,
  dataset,
  token: apiToken,
  apiVersion,
  useCdn: false,
});

// Extract slug from filename
function extractSlugFromFilename(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  
  // Try format: "148808966.trying-vs-doing" -> "148808966trying-vs-doing"
  const matchWithDot = baseName.match(/^(\d+)\.(.+)$/);
  if (matchWithDot) {
    return matchWithDot[1] + matchWithDot[2];
  }
  
  // Try format: "148808966trying-vs-doing" (already correct)
  if (/^\d+/.test(baseName)) {
    return baseName;
  }
  
  // Fallback: return as-is
  return baseName;
}

// Extract zip file
function extractZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }
      
      const htmlFiles = [];
      
      zipfile.readEntry();
      
      zipfile.on('entry', (entry) => {
        if (/\.html?$/i.test(entry.fileName)) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }
            
            const chunks = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              const content = Buffer.concat(chunks).toString('utf8');
              htmlFiles.push({
                fileName: entry.fileName,
                content: content,
              });
              
              zipfile.readEntry();
            });
            readStream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });
      
      zipfile.on('end', () => {
        resolve(htmlFiles);
      });
      
      zipfile.on('error', reject);
    });
  });
}

// Main function
async function main() {
  const zipPath = path.resolve('public/substack-export.zip');
  
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ Error: Zip file not found: ${zipPath}`);
    process.exit(1);
  }
  
  console.log('📦 Extracting HTML files from zip...');
  const htmlFiles = await extractZip(zipPath);
  console.log(`✅ Found ${htmlFiles.length} HTML files\n`);
  
  console.log('📥 Fetching existing posts from Sanity...');
  const existingPosts = await client.fetch(
    `*[_type == "post"] { _id, title, "slug": slug.current }`
  );
  
  // Create lookup maps
  const postsBySlug = new Map();
  const postsByTitle = new Map();
  
  existingPosts.forEach(post => {
    if (post.slug) {
      postsBySlug.set(post.slug.toLowerCase(), post);
    }
    if (post.title) {
      const normalizedTitle = post.title.toLowerCase().trim().replace(/\s+/g, ' ');
      postsByTitle.set(normalizedTitle, post);
    }
  });
  
  console.log(`   Found ${existingPosts.length} existing posts in Sanity\n`);
  
  // Find skipped posts
  const skippedPosts = [];
  
  for (const file of htmlFiles) {
    const slug = extractSlugFromFilename(file.fileName);
    
    // Try to find existing post by slug
    let existingPost = postsBySlug.get(slug.toLowerCase());
    
    // If not found, try variations
    if (!existingPost) {
      const slugWithoutNumbers = slug.replace(/^\d+/, '');
      if (slugWithoutNumbers !== slug) {
        existingPost = postsBySlug.get(slugWithoutNumbers.toLowerCase());
      }
    }
    
    // If still not found, try to extract title and match by title
    if (!existingPost) {
      const dom = new JSDOM(file.content);
      const document = dom.window.document;
      
      // Try to find title
      let title = '';
      const metaTitleSelectors = [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'title',
      ];
      
      for (const selector of metaTitleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          title = element.getAttribute('content') || element.textContent || '';
          if (title) {
            // Decode HTML entities
            const tempDom = new JSDOM('');
            const tempDoc = tempDom.window.document;
            const textarea = tempDoc.createElement('textarea');
            textarea.innerHTML = title;
            title = textarea.value;
            title = title.replace(/\s*\|\s*.*$/, '').trim();
            break;
          }
        }
      }
      
      if (title) {
        const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
        existingPost = postsByTitle.get(normalizedTitle);
      }
    }
    
    if (!existingPost) {
      // Extract title for display - try multiple methods
      const dom = new JSDOM(file.content);
      const document = dom.window.document;
      let title = '';
      
      // Try meta tags first
      const metaTitleSelectors = [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[property="article:title"]',
        'meta[name="title"]',
      ];
      
      for (const selector of metaTitleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          title = element.getAttribute('content') || '';
          if (title) {
            // Decode HTML entities
            const tempDom = new JSDOM('');
            const tempDoc = tempDom.window.document;
            const textarea = tempDoc.createElement('textarea');
            textarea.innerHTML = title;
            title = textarea.value;
            title = title.replace(/\s*\|\s*.*$/, '').trim();
            break;
          }
        }
      }
      
      // Try HTML elements
      if (!title) {
        const titleSelectors = [
          'h1.post-title',
          'h1.entry-title',
          'h1.title',
          '.post-title',
          '.entry-title',
          'article h1',
          'main h1',
          '.content h1',
          'h1',
          'title',
        ];
        
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            title = element.textContent || element.getAttribute('content') || '';
            if (title) {
              title = title.replace(/\s*\|\s*.*$/, '').trim();
              if (title) break;
            }
          }
        }
      }
      
      // Fallback: try to extract from filename
      if (!title) {
        const baseName = path.basename(file.fileName, path.extname(file.fileName));
        const match = baseName.match(/^\d+\.(.+)$/);
        if (match) {
          title = match[1].replace(/[-_]/g, ' ').trim();
        } else {
          // Try without the leading number
          title = baseName.replace(/^\d+\.?/, '').replace(/[-_]/g, ' ').trim();
        }
      }
      
      skippedPosts.push({
        fileName: file.fileName,
        slug: slug,
        title: title || 'Unknown title'
      });
    }
  }
  
  console.log(`\n📋 Skipped Posts (${skippedPosts.length} total):\n`);
  skippedPosts.forEach((post, index) => {
    console.log(`${index + 1}. "${post.title}"`);
    console.log(`   File: ${post.fileName}`);
    console.log(`   Extracted slug: ${post.slug}`);
    console.log('');
  });
  
  if (skippedPosts.length > 0) {
    console.log(`\n💡 These posts exist in Sanity but couldn't be matched.`);
    console.log(`   They're still visible on your site, just without updated formatting.`);
  }
}

main().catch(console.error);
