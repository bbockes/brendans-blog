#!/usr/bin/env node

/**
 * Delete All Posts from Sanity
 * 
 * This script deletes all posts from your Sanity dataset.
 * 
 * Usage:
 *   node scripts/delete-all-posts.js [--dry-run] [--confirm]
 * 
 * Example:
 *   node scripts/delete-all-posts.js --dry-run
 *   node scripts/delete-all-posts.js --confirm
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

// Create Sanity client
const client = createClient({
  projectId,
  dataset,
  token: apiToken,
  apiVersion,
  useCdn: false,
});

// Prompt for confirmation
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirmed = args.includes('--confirm');

  console.log(`🗑️  Delete All Posts from Sanity`);
  console.log(`🔗 Sanity Project: ${projectId}`);
  console.log(`📊 Dataset: ${dataset}`);
  if (dryRun) {
    console.log(`🧪 DRY RUN MODE - No posts will be deleted\n`);
  } else {
    console.log(`⚠️  WARNING: This will permanently delete ALL posts!\n`);
  }

  try {
    // Fetch all posts
    console.log('📥 Fetching all posts...');
    const posts = await client.fetch(`*[_type == "post"]{_id, title, slug}`);
    
    if (!posts || posts.length === 0) {
      console.log('✅ No posts found. Nothing to delete.');
      process.exit(0);
    }

    console.log(`📄 Found ${posts.length} posts to delete\n`);

    // Show first 10 posts as preview
    console.log('Preview of posts that will be deleted:');
    posts.slice(0, 10).forEach((post, i) => {
      console.log(`  ${i + 1}. ${post.title || 'Untitled'} (${post.slug?.current || 'no slug'})`);
    });
    if (posts.length > 10) {
      console.log(`  ... and ${posts.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Confirm deletion
    if (!dryRun && !confirmed) {
      const answer = await askQuestion(
        `⚠️  Are you sure you want to delete ALL ${posts.length} posts? (type 'yes' to confirm): `
      );
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Deletion cancelled.');
        process.exit(0);
      }
    }

    // Delete posts
    let deletedCount = 0;
    let errorCount = 0;

    console.log('\n🗑️  Deleting posts...\n');

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const percentage = Math.round(((i + 1) / posts.length) * 100);
      
      // Show progress every 10 posts or for the last post
      if (i % 10 === 0 || i === posts.length - 1) {
        console.log(`[${i + 1}/${posts.length}] (${percentage}%) Deleting: ${post.title || 'Untitled'}`);
      }

      if (dryRun) {
        deletedCount++;
      } else {
        try {
          await client.delete(post._id);
          deletedCount++;
        } catch (error) {
          console.error(`  ❌ Error deleting ${post.title || post._id}: ${error.message}`);
          errorCount++;
        }
      }

      // Small delay to avoid rate limiting
      if (i < posts.length - 1 && !dryRun) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n📊 Summary:`);
    if (dryRun) {
      console.log(`   ✅ Would delete: ${deletedCount} posts`);
      console.log(`\n💡 Run without --dry-run to actually delete the posts`);
    } else {
      console.log(`   ✅ Deleted: ${deletedCount} posts`);
      if (errorCount > 0) {
        console.log(`   ❌ Errors: ${errorCount} posts`);
      }
      console.log(`\n🎉 Deletion complete!`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

