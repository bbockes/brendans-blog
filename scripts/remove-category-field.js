#!/usr/bin/env node

/**
 * Remove Category Field from All Posts
 * 
 * This script removes the 'category' field from all existing posts in Sanity.
 * This is useful after removing the category field from the schema.
 * 
 * Usage:
 *   node scripts/remove-category-field.js [--dry-run] [--confirm]
 * 
 * Example:
 *   node scripts/remove-category-field.js --dry-run
 *   node scripts/remove-category-field.js --confirm
 * 
 * Environment variables required:
 *   - SANITY_PROJECT_ID (or set in .env file)
 *   - SANITY_DATASET (defaults to 'production')
 *   - SANITY_API_TOKEN (write token from Sanity project settings)
 */

import { createClient } from '@sanity/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

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

// Create Sanity client with write permissions
const client = createClient({
  projectId,
  dataset,
  token: apiToken,
  apiVersion,
  useCdn: false,
});

// Helper function to ask questions
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');

  console.log('🗑️  Remove Category Field from All Posts');
  console.log(`🔗 Sanity Project: ${projectId}`);
  console.log(`📊 Dataset: ${dataset}\n`);

  try {
    // Fetch all posts that have a category field
    console.log('📡 Fetching posts with category field...');
    const postsWithCategory = await client.fetch(
      `*[_type == "post" && defined(category)] {
        _id,
        title,
        "slug": slug.current,
        category
      }`
    );

    if (postsWithCategory.length === 0) {
      console.log('✅ No posts found with category field. Nothing to do!');
      process.exit(0);
    }

    console.log(`📄 Found ${postsWithCategory.length} posts with category field:\n`);
    
    // Show first few posts as examples
    const previewCount = Math.min(5, postsWithCategory.length);
    postsWithCategory.slice(0, previewCount).forEach((post, index) => {
      console.log(`  ${index + 1}. "${post.title}" (category: "${post.category}")`);
    });
    if (postsWithCategory.length > previewCount) {
      console.log(`  ... and ${postsWithCategory.length - previewCount} more`);
    }

    console.log('\n');

    if (dryRun) {
      console.log('🧪 DRY RUN MODE - No posts will be modified');
      console.log(`✅ Would remove category field from ${postsWithCategory.length} posts`);
      process.exit(0);
    }

    if (!confirm) {
      console.log('⚠️  WARNING: This will permanently remove the category field from all posts!');
      const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
      if (answer !== 'yes' && answer !== 'y') {
        console.log('❌ Operation cancelled');
        process.exit(0);
      }
    }

    console.log('\n🔄 Removing category field from posts...\n');

    let successCount = 0;
    let errorCount = 0;

    // Process posts in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < postsWithCategory.length; i += batchSize) {
      const batch = postsWithCategory.slice(i, i + batchSize);
      
      // Process batch in parallel
      const promises = batch.map(async (post) => {
        try {
          // Use unset to remove the field
          await client.patch(post._id).unset(['category']).commit();
          return { success: true, post };
        } catch (error) {
          return { success: false, post, error: error.message };
        }
      });

      const results = await Promise.all(promises);

      // Log results
      results.forEach((result) => {
        if (result.success) {
          successCount++;
          if (successCount % 10 === 0 || successCount === postsWithCategory.length) {
            console.log(`✅ [${successCount}/${postsWithCategory.length}] Removed category from "${result.post.title}"`);
          }
        } else {
          errorCount++;
          console.error(`❌ Error removing category from "${result.post.title}": ${result.error}`);
        }
      });

      // Small delay between batches
      if (i + batchSize < postsWithCategory.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Successfully removed category from ${successCount} posts`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed to remove category from ${errorCount} posts`);
    }
    console.log('\n🎉 Done! The category field has been removed from all posts.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();

