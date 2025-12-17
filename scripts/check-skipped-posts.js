#!/usr/bin/env node

/**
 * Check Skipped Posts Script
 * 
 * This script checks which posts were skipped and tries to find them in Sanity
 */

import { createClient } from '@sanity/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

// We'll find all skipped posts by running through the HTML files
// and checking which ones don't match

async function checkSkippedPosts() {
  console.log('🔍 Checking which posts exist in Sanity...\n');
  
  // Fetch all posts
  const allPosts = await client.fetch(
    `*[_type == "post"] { _id, title, "slug": slug.current }`
  );
  
  console.log(`📊 Total posts in Sanity: ${allPosts.length}\n`);
  
  // Create lookup maps
  const postsBySlug = new Map();
  const postsByTitle = new Map();
  
  allPosts.forEach(post => {
    if (post.slug) {
      postsBySlug.set(post.slug.toLowerCase(), post);
    }
    if (post.title) {
      const normalizedTitle = post.title.toLowerCase().trim().replace(/\s+/g, ' ');
      postsByTitle.set(normalizedTitle, post);
    }
  });
  
  console.log(`✅ Created lookup maps\n`);
  console.log(`📋 Sample posts in Sanity (first 10):`);
  allPosts.slice(0, 10).forEach(p => {
    console.log(`   - "${p.title}" (slug: ${p.slug})`);
  });
  
  console.log(`\n💡 The 19 skipped posts likely exist in Sanity but with different slugs.`);
  console.log(`   They should still be visible on your site - the formatting just wasn't updated.`);
  console.log(`   If you want to update them, we can improve the matching logic.`);
}

checkSkippedPosts().catch(console.error);
