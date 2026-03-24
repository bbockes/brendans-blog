#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@sanity/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const projectId = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y';
const dataset = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
const token = process.env.SANITY_API_TOKEN;
const apiVersion = process.env.SANITY_API_VERSION || '2024-01-01';

if (!token) {
  console.error('Error: SANITY_API_TOKEN is required in .env or .env.local');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion,
  useCdn: false,
});

function normalizeSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  const postsWithSpaces = await client.fetch(
    `*[_type == "post" && defined(slug.current) && slug.current match "* *"]{
      _id,
      title,
      "slug": slug.current
    }`
  );

  if (!postsWithSpaces.length) {
    console.log('No posts found with spaces in slug.');
    return;
  }

  const allPosts = await client.fetch(
    `*[_type == "post" && defined(slug.current)]{
      _id,
      "slug": slug.current
    }`
  );
  const allSlugs = new Set(allPosts.map((post) => post.slug));
  const currentById = new Map(allPosts.map((post) => [post._id, post.slug]));

  let updateCount = 0;
  let skipCount = 0;
  let collisionCount = 0;

  console.log(`Found ${postsWithSpaces.length} post(s) with spaces in slug.`);

  for (const post of postsWithSpaces) {
    const nextSlug = normalizeSlug(post.slug);
    if (!nextSlug || nextSlug === post.slug) {
      skipCount++;
      continue;
    }

    const existingSlugOwner = allPosts.find((p) => p.slug === nextSlug);
    const isCollision = existingSlugOwner && existingSlugOwner._id !== post._id;
    if (isCollision) {
      collisionCount++;
      if (verbose) {
        console.log(`\nCOLLISION: ${post.title}`);
        console.log(`  ${post.slug} -> ${nextSlug}`);
      }
      continue;
    }

    if (verbose) {
      console.log(`\n- ${post.title}`);
      console.log(`  ${post.slug} -> ${nextSlug}`);
    }

    if (!dryRun) {
      await client.patch(post._id).set({ slug: { _type: 'slug', current: nextSlug } }).commit();
      const previousSlug = currentById.get(post._id);
      if (previousSlug) allSlugs.delete(previousSlug);
      allSlugs.add(nextSlug);
      currentById.set(post._id, nextSlug);
    }

    updateCount++;
  }

  if (dryRun) {
    console.log(`\nDry run complete.`);
    console.log(`Would update: ${updateCount}`);
    console.log(`Skipped (no change): ${skipCount}`);
    console.log(`Skipped (collisions): ${collisionCount}`);
  } else {
    console.log(`\nDone.`);
    console.log(`Updated: ${updateCount}`);
    console.log(`Skipped (no change): ${skipCount}`);
    console.log(`Skipped (collisions): ${collisionCount}`);
  }
}

main().catch((error) => {
  console.error('Failed to fix slugs:', error.message);
  process.exit(1);
});
