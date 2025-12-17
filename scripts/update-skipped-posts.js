#!/usr/bin/env node

/**
 * Update Only Skipped Posts Script
 * 
 * This script updates only the 19 posts that were skipped in the initial run
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

// List of the 19 skipped posts (from the previous run)
const skippedPostFiles = [
  'posts/148861999.100-minutes.html',
  'posts/148862232.50000-miles.html',
  'posts/148862430.300-characters-or-fewer.html',
  'posts/148862681.years-ago-back-when-i-working-as-a-baristacustomer-service-extraordinaire-at-starbucks-i-got-into-more-than-a-few-verbal-s.html',
  'posts/148862754.60-characters-or-fewer.html',
  'posts/148862823.500-words-per-minute.html',
  'posts/148862825.3-types-of-librarians.html',
  'posts/148862890.500-hours.html',
  'posts/148863045.24-million-dollars.html',
  'posts/148863057.80-certainty-or-better.html',
  'posts/148863154.4-questions-for-making-remarkable-products.html',
  'posts/148863176.3-ux-tips-for-grocery-delivery-apps.html',
  'posts/148863398.20-proficiency.html',
  'posts/148863406.3-questions-to-differentiate-your-business.html',
  'posts/148863931.3-skills-for-better-work.html',
  'posts/148863954.3-ways-to-communicate.html',
  'posts/148864097.5859-2.html',
  'posts/148864100.200-things.html',
  'posts/148864366.3-levels-of-prompt-design.html',
];

// HTML to Portable Text converter (same as update script)
function htmlToPortableText(htmlString) {
  if (!htmlString) return [];
  
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;
  const body = document.body;
  
  if (!body) return [];
  
  const blocks = [];
  
  Array.from(body.children).forEach((element) => {
    const tagName = element.tagName?.toLowerCase();
    
    if (['h1', 'h2', 'h3', 'h4'].includes(tagName)) {
      const style = tagName;
      const block = parseInlineContent(element);
      if (block && block.children.length > 0) {
        blocks.push({
          _type: 'block',
          style: style,
          children: block.children,
          ...(block.markDefs && block.markDefs.length > 0 ? { markDefs: block.markDefs } : {})
        });
      }
      return;
    }
    
    if (tagName === 'blockquote') {
      const block = parseInlineContent(element);
      if (block && block.children.length > 0) {
        blocks.push({
          _type: 'block',
          style: 'blockquote',
          children: block.children,
          ...(block.markDefs && block.markDefs.length > 0 ? { markDefs: block.markDefs } : {})
        });
      }
      return;
    }
    
    if (tagName === 'ul' || tagName === 'ol') {
      const listType = tagName === 'ul' ? 'bullet' : 'number';
      Array.from(element.querySelectorAll('li')).forEach((li) => {
        const block = parseInlineContent(li);
        if (block && block.children.length > 0) {
          blocks.push({
            _type: 'block',
            listItem: listType,
            style: 'normal',
            children: block.children,
            ...(block.markDefs && block.markDefs.length > 0 ? { markDefs: block.markDefs } : {})
          });
        }
      });
      return;
    }
    
    if (tagName === 'img') {
      const src = element.getAttribute('src') || element.getAttribute('data-src');
      const alt = element.getAttribute('alt') || '';
      if (src) {
        blocks.push({
          _type: 'image',
          _imageUrl: src,
          alt: alt || '',
        });
      }
      return;
    }
    
    if (tagName === 'p' || tagName === 'div') {
      const block = parseInlineContent(element);
      if (block && block.children.length > 0) {
        const blockData = {
          _type: 'block',
          style: 'normal',
          children: block.children,
        };
        if (block.markDefs && block.markDefs.length > 0) {
          blockData.markDefs = block.markDefs;
        }
        blocks.push(blockData);
      }
      return;
    }
    
    if (tagName === 'pre') {
      const codeElement = element.querySelector('code');
      if (codeElement) {
        const code = codeElement.textContent || '';
        const language = codeElement.className?.match(/language-(\w+)/)?.[1] || 'text';
        if (code) {
          blocks.push({
            _type: 'codeBlock',
            code: {
              code: code,
              language: language,
              filename: null,
            },
          });
        }
      }
      return;
    }
  });
  
  if (blocks.length === 0) {
    const block = parseInlineContent(body);
    if (block && block.children.length > 0) {
      blocks.push({
        _type: 'block',
        style: 'normal',
        children: block.children,
        ...(block.markDefs && block.markDefs.length > 0 ? { markDefs: block.markDefs } : {})
      });
    }
  }
  
  return blocks;
}

function parseInlineContent(element) {
  const children = [];
  let markDefs = [];
  let markDefIndex = 0;
  
  function processNode(node, inheritedMarks = []) {
    if (node.nodeType === 3) {
      let text = node.textContent || '';
      if (text.trim()) {
        children.push({ _type: 'span', text: text, marks: [...inheritedMarks] });
      }
    } else if (node.nodeType === 1) {
      const tagName = node.tagName?.toLowerCase();
      const currentMarks = [...inheritedMarks];
      
      if (tagName === 'strong' || tagName === 'b') {
        currentMarks.push('strong');
      } else if (tagName === 'em' || tagName === 'i') {
        currentMarks.push('em');
      } else if (tagName === 'code') {
        currentMarks.push('code');
      }
      
      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href) {
          const markKey = `link-${markDefIndex++}`;
          markDefs.push({
            _key: markKey,
            _type: 'link',
            href: href,
          });
          
          const childMarks = [...currentMarks, markKey];
          Array.from(node.childNodes).forEach(child => {
            processNode(child, childMarks);
          });
        }
      } else {
        Array.from(node.childNodes).forEach(child => {
          processNode(child, currentMarks);
        });
      }
    }
  }
  
  Array.from(element.childNodes).forEach(node => {
    processNode(node, []);
  });
  
  return { children, markDefs };
}

function generateKey(prefix = 'key') {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
}

function addKeysToContent(content) {
  if (!Array.isArray(content)) return content;
  
  return content.map((block) => {
    const blockWithKey = { ...block };
    
    if (!blockWithKey._key) {
      blockWithKey._key = generateKey('block');
    }
    
    if (blockWithKey._type === 'block' && Array.isArray(blockWithKey.children)) {
      blockWithKey.children = blockWithKey.children.map((child) => {
        if (!child._key) {
          return { ...child, _key: generateKey('span') };
        }
        return child;
      });
    }
    
    if (blockWithKey.markDefs && Array.isArray(blockWithKey.markDefs)) {
      blockWithKey.markDefs = blockWithKey.markDefs.map((markDef) => {
        if (!markDef._key) {
          return { ...markDef, _key: generateKey('mark') };
        }
        return markDef;
      });
    }
    
    return blockWithKey;
  });
}

// Extract specific files from zip
function extractSpecificFiles(zipPath, targetFiles) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }
      
      const htmlFiles = [];
      const targetSet = new Set(targetFiles);
      
      zipfile.readEntry();
      
      zipfile.on('entry', (entry) => {
        if (targetSet.has(entry.fileName) && /\.html?$/i.test(entry.fileName)) {
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

async function updatePostContent(postId, newContent) {
  try {
    await client.patch(postId).set({ content: newContent }).commit();
    return true;
  } catch (error) {
    throw error;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  const zipPath = path.resolve('public/substack-export.zip');
  
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ Error: Zip file not found: ${zipPath}`);
    process.exit(1);
  }
  
  console.log('📦 Extracting skipped posts from zip...');
  const htmlFiles = await extractSpecificFiles(zipPath, skippedPostFiles);
  console.log(`✅ Found ${htmlFiles.length} of ${skippedPostFiles.length} target files\n`);
  
  console.log('📥 Fetching all posts from Sanity...');
  const allPosts = await client.fetch(
    `*[_type == "post"] { _id, title, "slug": slug.current }`
  );
  
  // Create lookup by title (normalized)
  const postsByTitle = new Map();
  allPosts.forEach(post => {
    if (post.title) {
      const normalizedTitle = post.title.toLowerCase().trim().replace(/\s+/g, ' ');
      postsByTitle.set(normalizedTitle, post);
    }
  });
  
  console.log(`   Found ${allPosts.length} posts in Sanity\n`);
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < htmlFiles.length; i++) {
    const file = htmlFiles[i];
    console.log(`[${i + 1}/${htmlFiles.length}] Processing: ${file.fileName}`);
    
    try {
      // Extract title from HTML
      const dom = new JSDOM(file.content);
      const document = dom.window.document;
      
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
      
      // Fallback to filename
      if (!title) {
        const baseName = path.basename(file.fileName, path.extname(file.fileName));
        const match = baseName.match(/^\d+\.(.+)$/);
        if (match) {
          title = match[1].replace(/[-_]/g, ' ').trim();
        }
      }
      
      // Find post by title - try multiple matching strategies
      let existingPost = null;
      if (title) {
        const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
        existingPost = postsByTitle.get(normalizedTitle);
        
        // If not found, try partial matching
        if (!existingPost) {
          // Extract key words (ignore numbers and common words)
          const keyWords = normalizedTitle
            .split(/\s+/)
            .filter(word => word.length > 2 && !/^\d+$/.test(word))
            .slice(0, 3); // Use first 3 meaningful words
          
          if (keyWords.length > 0) {
            // Find posts where title contains all key words
            for (const [normalized, post] of postsByTitle.entries()) {
              if (keyWords.every(word => normalized.includes(word))) {
                existingPost = post;
                console.log(`  ℹ️  Found by partial match: "${post.title}" (searched for: "${title}")`);
                break;
              }
            }
          }
        }
        
        // If still not found, try matching by removing leading numbers from title
        if (!existingPost) {
          const titleWithoutNumbers = normalizedTitle.replace(/^\d+\s+/, '');
          if (titleWithoutNumbers !== normalizedTitle) {
            existingPost = postsByTitle.get(titleWithoutNumbers);
            if (existingPost) {
              console.log(`  ℹ️  Found by removing leading numbers: "${existingPost.title}"`);
            }
          }
        }
      }
      
      if (!existingPost) {
        console.log(`  ⏭️  Skipped (could not find post with title: "${title}")`);
        console.log(`      Trying to find similar posts...`);
        
        // Show similar posts for debugging
        if (title) {
          const searchTerms = title.toLowerCase().split(/\s+/).filter(t => t.length > 2).slice(0, 2);
          const similar = Array.from(postsByTitle.entries())
            .filter(([normTitle, post]) => searchTerms.some(term => normTitle.includes(term)))
            .slice(0, 3);
          if (similar.length > 0) {
            console.log(`      Similar posts found:`);
            similar.forEach(([_, post]) => {
              console.log(`        - "${post.title}"`);
            });
          }
        }
        skipCount++;
        continue;
      }
      
      // Extract content
      const contentSelectors = [
        '.pencraft',
        '[data-testid="post-content"]',
        '.post-content',
        '.entry-content',
        'article .pencraft',
        'article',
        '.content',
        'main',
      ];
      
      let contentHTML = '';
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          contentHTML = element.innerHTML;
          break;
        }
      }
      
      if (!contentHTML) {
        contentHTML = document.body?.innerHTML || '';
      }
      
      // Convert to Portable Text
      const newContent = htmlToPortableText(contentHTML);
      const contentWithKeys = addKeysToContent(newContent);
      
      if (dryRun) {
        console.log(`  [DRY RUN] Would update: "${existingPost.title}"`);
        console.log(`    Blocks: ${contentWithKeys.length}`);
        successCount++;
      } else {
        await updatePostContent(existingPost._id, contentWithKeys);
        console.log(`  ✅ Updated: "${existingPost.title}"`);
        successCount++;
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skipCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  
  if (dryRun) {
    console.log(`\n💡 Run without --dry-run to actually update the posts`);
  } else {
    console.log(`\n🎉 Update complete!`);
  }
}

main().catch(console.error);
