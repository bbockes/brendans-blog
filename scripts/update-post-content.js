#!/usr/bin/env node

/**
 * Update Post Content in Sanity
 * 
 * This script updates the content field of existing posts in Sanity
 * by regenerating the content from the JSON files with fixed parsing.
 * 
 * Usage:
 *   node scripts/update-post-content.js <path-to-posts.json> [--dry-run] [--limit N]
 * 
 * Example:
 *   node scripts/update-post-content.js ./substack-import/all-posts.json
 *   node scripts/update-post-content.js ./substack-import/all-posts.json --dry-run --limit 10
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

// Generate a unique key for blocks
function generateKey(prefix = 'key') {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
}

// Add _key fields to blocks and their children
function addKeysToContent(content) {
  if (!Array.isArray(content)) return content;
  
  return content.map((block, index) => {
    const blockWithKey = { ...block };
    
    // Add _key to the block if it doesn't have one
    if (!blockWithKey._key) {
      blockWithKey._key = generateKey('block');
    }
    
    // Add _key to children (spans) if this is a block type
    if (blockWithKey._type === 'block' && Array.isArray(blockWithKey.children)) {
      blockWithKey.children = blockWithKey.children.map((child, childIndex) => {
        if (!child._key) {
          return { ...child, _key: generateKey('span') };
        }
        return child;
      });
    }
    
    // Add _key to markDefs if they exist
    if (blockWithKey.markDefs && Array.isArray(blockWithKey.markDefs)) {
      blockWithKey.markDefs = blockWithKey.markDefs.map((markDef) => {
        if (!markDef._key) {
          return { ...markDef, _key: generateKey('mark') };
        }
        return markDef;
      });
    }
    
    // Add _key to codeBlock if it exists
    if (blockWithKey._type === 'codeBlock' && blockWithKey.code && !blockWithKey.code._key) {
      blockWithKey.code._key = generateKey('code');
    }
    
    return blockWithKey;
  });
}

// Update a single post's content
async function updatePostContent(post, dryRun = false) {
  try {
    // Find the post by slug
    const existing = await client.fetch(
      `*[_type == "post" && slug.current == $slug][0]`,
      { slug: post.slug }
    );
    
    if (!existing) {
      return { success: false, error: 'Post not found' };
    }
    
    // Add keys to content
    const contentWithKeys = addKeysToContent(post.content || []);
    
    if (dryRun) {
      return { success: true, dryRun: true, id: existing._id };
    }
    
    // Update only the content field
    await client.patch(existing._id).set({ content: contentWithKeys }).commit();
    
    return { success: true, id: existing._id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/update-post-content.js <path-to-posts.json> [--dry-run] [--limit N]');
    process.exit(1);
  }
  
  const jsonPath = path.resolve(args[0]);
  const dryRun = args.includes('--dry-run');
  
  // Parse --limit option
  let limit = null;
  const limitIndex = args.findIndex(arg => arg === '--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit < 1) {
      console.error('❌ Error: --limit must be a positive number');
      process.exit(1);
    }
  }
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Error: JSON file not found: ${jsonPath}`);
    process.exit(1);
  }
  
  console.log(`📦 Updating post content from: ${jsonPath}`);
  console.log(`🔗 Sanity Project: ${projectId}`);
  console.log(`📊 Dataset: ${dataset}`);
  if (dryRun) {
    console.log(`🧪 DRY RUN MODE - No posts will be updated\n`);
  } else {
    console.log(`⚠️  This will update the content field of existing posts\n`);
  }
  
  try {
    // Read JSON file
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const posts = JSON.parse(jsonContent);
    
    if (!Array.isArray(posts)) {
      console.error('❌ Error: JSON file must contain an array of posts');
      process.exit(1);
    }
    
    // Apply limit if specified
    const postsToUpdate = limit ? posts.slice(0, limit) : posts;
    
    if (limit) {
      console.log(`📄 Found ${posts.length} posts total, updating first ${limit} posts\n`);
    } else {
      console.log(`📄 Found ${posts.length} posts to update\n`);
    }
    
    // Update each post
    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    
    const progressInterval = 10;
    
    for (let i = 0; i < postsToUpdate.length; i++) {
      const post = postsToUpdate[i];
      
      // Show progress every 10 posts
      if (i % progressInterval === 0 || i === postsToUpdate.length - 1) {
        const percentage = Math.round(((i + 1) / postsToUpdate.length) * 100);
        console.log(`[${i + 1}/${postsToUpdate.length}] (${percentage}%) Updating: ${post.title}`);
      }
      
      const result = await updatePostContent(post, dryRun);
      
      if (result.success) {
        if (result.dryRun) {
          if (i % progressInterval === 0 || i === postsToUpdate.length - 1) {
            console.log(`  ✅ Would be updated`);
          }
          successCount++;
        } else {
          if (i % 10 === 0) {
            console.log(`  ✅ Updated (ID: ${result.id})`);
          }
          successCount++;
        }
      } else {
        if (result.error === 'Post not found') {
          notFoundCount++;
        } else {
          console.log(`  ❌ Error: ${result.error || result.message}`);
          errorCount++;
        }
      }
      
      // Small delay to avoid rate limiting
      if (i < postsToUpdate.length - 1 && !dryRun) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${successCount}`);
    if (notFoundCount > 0) {
      console.log(`   ⚠️  Not found: ${notFoundCount}`);
    }
    if (errorCount > 0) {
      console.log(`   ❌ Errors: ${errorCount}`);
    }
    
    if (dryRun) {
      console.log(`\n💡 Run without --dry-run to actually update the posts`);
    } else {
      console.log(`\n🎉 Update complete!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();


