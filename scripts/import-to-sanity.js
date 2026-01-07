#!/usr/bin/env node

/**
 * Sanity Import Script
 * 
 * This script imports JSON posts (created by substack-to-json.js) into Sanity CMS.
 * 
 * Usage:
 *   node scripts/import-to-sanity.js <path-to-posts.json> [--dry-run] [--limit N] [--skip-checks] [--fast]
 * 
 * Example:
 *   node scripts/import-to-sanity.js ./substack-import/all-posts.json
 *   node scripts/import-to-sanity.js ./substack-import/all-posts.json --dry-run
 *   node scripts/import-to-sanity.js ./substack-import/all-posts.json --limit 5
 *   node scripts/import-to-sanity.js ./substack-import/all-posts.json --skip-checks --fast
 * 
 * Environment variables required:
 *   - SANITY_PROJECT_ID (or set in .env file)
 *   - SANITY_DATASET (defaults to 'production')
 *   - SANITY_API_TOKEN (write token from Sanity project settings)
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
  console.error('\nTo get your API token:');
  console.error('1. Go to https://sanity.io/manage');
  console.error('2. Select your project');
  console.error('3. Go to API > Tokens');
  console.error('4. Create a new token with "Editor" permissions');
  console.error('5. Add it to your .env file: SANITY_API_TOKEN=your-token-here');
  process.exit(1);
}

// Create Sanity client
const client = createClient({
  projectId,
  dataset,
  token: apiToken,
  apiVersion,
  useCdn: false, // Use CDN for reads, but not for writes
});

// Calculate read time from content
function calculateReadTime(content) {
  if (!Array.isArray(content)) return '1 min';
  
  let wordCount = 0;
  content.forEach(block => {
    if (block._type === 'block' && block.children) {
      block.children.forEach(child => {
        if (child._type === 'span' && child.text) {
          wordCount += child.text.split(/\s+/).length;
        }
      });
    }
  });
  
  // Average reading speed: 200-250 words per minute
  const minutes = Math.ceil(wordCount / 200);
  return minutes === 0 ? '1 min' : `${minutes} min`;
}

// Upload image to Sanity and return asset reference
async function uploadImageToSanity(imageUrl) {
  if (!imageUrl) return null;
  
  try {
    // Check if URL is absolute
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      console.warn(`  ⚠️  Skipping relative image URL: ${imageUrl}`);
      return null;
    }
    
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`  ⚠️  Failed to fetch image: ${imageUrl}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const asset = await client.assets.upload('image', buffer, {
      filename: path.basename(imageUrl),
    });
    
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id,
      },
    };
  } catch (error) {
    console.warn(`  ⚠️  Error uploading image ${imageUrl}:`, error.message);
    return null;
  }
}

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

// Transform post data to Sanity format
async function transformPost(post, dryRun = false) {
  // Process content blocks and upload images
  const processedContent = [];
  for (const block of post.content || []) {
    if (block._type === 'image' && block._imageUrl) {
      // Upload image from content
      if (!dryRun) {
        const imageAsset = await uploadImageToSanity(block._imageUrl);
        if (imageAsset) {
          processedContent.push({
            _type: 'image',
            _key: generateKey('image'),
            asset: imageAsset.asset,
            alt: block.alt || '',
          });
        }
      } else {
        processedContent.push({
          _type: 'image',
          _key: generateKey('image'),
          asset: { _type: 'reference', _ref: 'placeholder' },
          alt: block.alt || '',
        });
      }
    } else {
      // Keep other blocks as-is (will add keys below)
      processedContent.push(block);
    }
  }
  
  // Add _key fields to all content blocks
  const contentWithKeys = addKeysToContent(processedContent);
  
  const transformed = {
    _type: 'post',
    title: post.title,
    slug: {
      _type: 'slug',
      current: post.slug,
    },
    publishedAt: post.publishedAt,
    content: contentWithKeys,
  };
  
  // Note: Removed excerpt, readTime, and main image fields as they're not in the schema
  
  return transformed;
}

// Check if post already exists
async function postExists(slug) {
  try {
    const existing = await client.fetch(
      `*[_type == "post" && slug.current == $slug][0]`,
      { slug }
    );
    return !!existing;
  } catch (error) {
    return false;
  }
}

// Batch fetch all existing post slugs to avoid individual checks
async function fetchExistingSlugs() {
  try {
    const existing = await client.fetch(
      `*[_type == "post" && defined(slug.current)]{ "slug": slug.current }`
    );
    return new Set(existing.map(p => p.slug));
  } catch (error) {
    console.warn('⚠️  Could not fetch existing slugs, will check individually');
    return new Set();
  }
}

// Import a single post
async function importPost(post, dryRun = false, options = {}) {
  const { skipExisting = true } = options;
  
  try {
    // In dry run mode, skip the existence check to speed things up
    // Check if post already exists (skip in dry run to avoid slow API calls)
    if (!dryRun && skipExisting && await postExists(post.slug)) {
      return { success: false, skipped: true, message: 'Post already exists' };
    }
    
    // Transform post data
    const transformed = await transformPost(post, dryRun);
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would create post: ${post.title}`);
      return { success: true, dryRun: true };
    }
    
    // Create the post in Sanity
    const created = await client.create(transformed);
    
    return { success: true, id: created._id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/import-to-sanity.js <path-to-posts.json> [--dry-run] [--limit N]');
    process.exit(1);
  }
  
  const jsonPath = path.resolve(args[0]);
  const dryRun = args.includes('--dry-run');
  const skipChecks = args.includes('--skip-checks');
  const fastMode = args.includes('--fast');
  
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
  
  console.log(`📦 Importing posts from: ${jsonPath}`);
  console.log(`🔗 Sanity Project: ${projectId}`);
  console.log(`📊 Dataset: ${dataset}`);
  if (dryRun) {
    console.log(`🧪 DRY RUN MODE - No posts will be created`);
  }
  console.log('');
  
  try {
    // Read JSON file
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const posts = JSON.parse(jsonContent);
    
    if (!Array.isArray(posts)) {
      console.error('❌ Error: JSON file must contain an array of posts');
      process.exit(1);
    }
    
    // Apply limit if specified
    const postsToImport = limit ? posts.slice(0, limit) : posts;
    
    if (limit) {
      console.log(`📄 Found ${posts.length} posts total, importing first ${limit} posts\n`);
    } else {
      console.log(`📄 Found ${posts.length} posts to import\n`);
    }
    
    // Fetch existing slugs in batch if not skipping checks
    let existingSlugs = new Set();
    if (!skipChecks && !dryRun) {
      console.log('📥 Fetching existing posts...');
      existingSlugs = await fetchExistingSlugs();
      console.log(`   Found ${existingSlugs.size} existing posts\n`);
    }
    
    // Import each post
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // In dry run mode, show progress every 50 posts to reduce output
    const progressInterval = dryRun ? 50 : (fastMode ? 10 : 1);
    
    // Delay between posts (reduced in fast mode)
    const delayMs = fastMode ? 50 : 100;
    
    for (let i = 0; i < postsToImport.length; i++) {
      const post = postsToImport[i];
      
      // Show progress for every post in non-dry-run, or every 50 in dry-run
      if (i % progressInterval === 0 || i === postsToImport.length - 1) {
        const percentage = Math.round(((i + 1) / postsToImport.length) * 100);
        console.log(`[${i + 1}/${postsToImport.length}] (${percentage}%) Processing: ${post.title}`);
      }
      
      // Check if post exists using batch-fetched slugs
      if (!skipChecks && !dryRun && existingSlugs.has(post.slug)) {
        if (i % progressInterval === 0 || i === postsToImport.length - 1) {
          console.log(`  ⏭️  Skipped (already exists)`);
        }
        skipCount++;
        continue;
      }
      
      const result = await importPost(post, dryRun, { skipExisting: skipChecks });
      
      if (result.success) {
        if (result.skipped) {
          if (i % progressInterval === 0 || i === postsToImport.length - 1) {
            console.log(`  ⏭️  Skipped (already exists)`);
          }
          skipCount++;
        } else if (result.dryRun) {
          if (i % progressInterval === 0 || i === postsToImport.length - 1) {
            console.log(`  ✅ Would be created`);
          }
          successCount++;
        } else {
          if (!fastMode || i % 10 === 0) {
            console.log(`  ✅ Created (ID: ${result.id})`);
          }
          successCount++;
        }
      } else {
        console.log(`  ❌ Error: ${result.error || result.message}`);
        errorCount++;
      }
      
      // Add a small delay to avoid rate limiting (reduced in fast mode)
      if (i < postsToImport.length - 1 && !dryRun) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (dryRun) {
      console.log(`\n💡 Run without --dry-run to actually import the posts`);
    } else {
      console.log(`\n🎉 Import complete! Check your Sanity Studio to see the posts.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

