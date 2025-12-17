#!/usr/bin/env node

/**
 * Update Post Formatting Script
 * 
 * This script re-parses Substack HTML files to restore formatting (bold, italic, links, etc.)
 * and updates existing posts in Sanity.
 * 
 * Usage:
 *   node scripts/update-post-formatting.js <path-to-substack-export.zip> [--dry-run] [--limit N]
 * 
 * Example:
 *   node scripts/update-post-formatting.js ~/Downloads/substack-export.zip
 *   node scripts/update-post-formatting.js ~/Downloads/substack-export.zip --dry-run --limit 5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
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

// Helper function to get text content
function getTextContent(element) {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

// Improved HTML to Portable Text converter with better formatting preservation
function htmlToPortableText(htmlString) {
  if (!htmlString) return [];
  
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;
  const body = document.body;
  
  if (!body) return [];
  
  const blocks = [];
  
  // Process each child element
  Array.from(body.children).forEach((element) => {
    const tagName = element.tagName?.toLowerCase();
    
    // Handle headings
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
    
    // Handle blockquotes
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
    
    // Handle lists
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
    
    // Handle images
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
    
    // Handle paragraphs and other block elements
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
    
    // Handle code blocks
    if (tagName === 'pre') {
      const codeElement = element.querySelector('code');
      if (codeElement) {
        const code = getTextContent(codeElement);
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
  
  // If no blocks were created, try to extract text from the entire body
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

// Parse inline content with formatting (improved version)
function parseInlineContent(element) {
  const children = [];
  let markDefs = [];
  let markDefIndex = 0;
  
  function processNode(node, inheritedMarks = []) {
    if (node.nodeType === 3) {
      // Text node
      let text = node.textContent || '';
      // Only trim if it's standalone text
      if (text.trim()) {
        children.push({ _type: 'span', text: text, marks: [...inheritedMarks] });
      }
    } else if (node.nodeType === 1) {
      // Element node
      const tagName = node.tagName?.toLowerCase();
      const currentMarks = [...inheritedMarks];
      
      // Handle formatting tags
      if (tagName === 'strong' || tagName === 'b') {
        currentMarks.push('strong');
      } else if (tagName === 'em' || tagName === 'i') {
        currentMarks.push('em');
      } else if (tagName === 'code') {
        currentMarks.push('code');
      }
      
      // Handle links
      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href) {
          const markKey = `link-${markDefIndex++}`;
          markDefs.push({
            _key: markKey,
            _type: 'link',
            href: href,
          });
          
          // Process children with link mark
          const childMarks = [...currentMarks, markKey];
          Array.from(node.childNodes).forEach(child => {
            processNode(child, childMarks);
          });
        }
      } else {
        // Process child nodes recursively
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

// Generate keys for blocks
function generateKey(prefix = 'key') {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
}

// Add _key fields to blocks
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


// Update post content in Sanity
async function updatePostContent(postId, newContent) {
  try {
    await client.patch(postId).set({ content: newContent }).commit();
    return true;
  } catch (error) {
    throw error;
  }
}

// Extract slug from filename - try multiple formats to match Sanity slugs
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

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/update-post-formatting.js <path-to-substack-export.zip> [--dry-run] [--limit N] [--fast] [--parallel N]');
    process.exit(1);
  }
  
  const zipPath = path.resolve(args[0]);
  const dryRun = args.includes('--dry-run');
  const fastMode = args.includes('--fast');
  
  // Parse --parallel option
  let parallelCount = 1;
  const parallelIndex = args.findIndex(arg => arg === '--parallel');
  if (parallelIndex !== -1 && args[parallelIndex + 1]) {
    parallelCount = parseInt(args[parallelIndex + 1], 10);
    if (isNaN(parallelCount) || parallelCount < 1) {
      console.error('❌ Error: --parallel must be a positive number');
      process.exit(1);
    }
  } else if (fastMode) {
    parallelCount = 5; // Default to 5 parallel requests in fast mode
  }
  
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
  
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ Error: Zip file not found: ${zipPath}`);
    process.exit(1);
  }
  
  console.log(`📦 Extracting HTML files from: ${zipPath}`);
  if (dryRun) {
    console.log(`🧪 DRY RUN MODE - No posts will be updated`);
  }
  console.log('');
  
  try {
    // Extract HTML files from zip
    const htmlFiles = await extractZip(zipPath);
    console.log(`✅ Found ${htmlFiles.length} HTML files\n`);
    
    // Fetch all existing posts from Sanity to create a lookup map
    console.log('📥 Fetching existing posts from Sanity...');
    const existingPosts = await client.fetch(
      `*[_type == "post"] { _id, title, "slug": slug.current }`
    );
    
    // Create lookup maps by slug and by title (normalized)
    const postsBySlug = new Map();
    const postsByTitle = new Map();
    
    existingPosts.forEach(post => {
      if (post.slug) {
        postsBySlug.set(post.slug.toLowerCase(), post);
      }
      if (post.title) {
        // Normalize title for matching (lowercase, remove extra spaces)
        const normalizedTitle = post.title.toLowerCase().trim().replace(/\s+/g, ' ');
        postsByTitle.set(normalizedTitle, post);
      }
    });
    
    console.log(`   Found ${existingPosts.length} existing posts in Sanity\n`);
    
    // Process each HTML file
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    const filesToProcess = limit ? htmlFiles.slice(0, limit) : htmlFiles;
    
    // Process a single file
    async function processFile(file, index, total) {
      const slug = extractSlugFromFilename(file.fileName);
      
      if (index % 10 === 0 || index === total - 1) {
        console.log(`[${index + 1}/${total}] Processing: ${file.fileName}`);
      }
      
      try {
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
                // Decode HTML entities (e.g., &apos; -> ', &#39; -> ')
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
          if (index % 10 === 0 || index === total - 1) {
            console.log(`  ⏭️  Skipped (post not found in Sanity: ${slug})`);
          }
          return { skipped: true };
        }
        
        // Parse HTML to get formatted content
        const dom = new JSDOM(file.content);
        const document = dom.window.document;
        
        // Try to find content area - be more specific for Substack
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
        
        // Convert to Portable Text with formatting
        const newContent = htmlToPortableText(contentHTML);
        const contentWithKeys = addKeysToContent(newContent);
        
        if (dryRun) {
          if (index % 10 === 0 || index === total - 1) {
            console.log(`  [DRY RUN] Would update post: ${existingPost.title}`);
            console.log(`    Blocks: ${contentWithKeys.length}`);
            // Count formatting
            const hasFormatting = contentWithKeys.some(block => 
              block.children?.some(child => 
                child.marks && child.marks.length > 0
              )
            );
            const linkCount = contentWithKeys.filter(block => 
              block.markDefs && block.markDefs.length > 0
            ).length;
            console.log(`    Has formatting: ${hasFormatting ? 'Yes' : 'No'}`);
            console.log(`    Blocks with links: ${linkCount}`);
          }
          return { success: true, dryRun: true };
        } else {
          // Update the post
          await updatePostContent(existingPost._id, contentWithKeys);
          if (index % 10 === 0 || index === total - 1) {
            console.log(`  ✅ Updated: ${existingPost.title}`);
          }
          return { success: true };
        }
      } catch (error) {
        if (index % 10 === 0 || index === total - 1) {
          console.log(`  ❌ Error: ${error.message}`);
        }
        return { error: error.message };
      }
    }
    
    // Process files in parallel batches
    if (parallelCount > 1) {
      console.log(`🚀 Processing ${filesToProcess.length} files in parallel batches of ${parallelCount}\n`);
      
      for (let i = 0; i < filesToProcess.length; i += parallelCount) {
        const batch = filesToProcess.slice(i, i + parallelCount);
        const results = await Promise.all(batch.map((file, batchIndex) => 
          processFile(file, i + batchIndex, filesToProcess.length)
        ));
        
        // Count results
        results.forEach(result => {
          if (result.skipped) {
            skipCount++;
          } else if (result.success) {
            successCount++;
          } else if (result.error) {
            errorCount++;
          }
        });
        
        // Small delay between batches to avoid overwhelming the API
        if (i + parallelCount < filesToProcess.length && !dryRun) {
          await new Promise(resolve => setTimeout(resolve, fastMode ? 50 : 100));
        }
      }
    } else {
      // Sequential processing (original behavior)
      for (let i = 0; i < filesToProcess.length; i++) {
        const result = await processFile(filesToProcess[i], i, filesToProcess.length);
        
        if (result.skipped) {
          skipCount++;
        } else if (result.success) {
          successCount++;
        } else if (result.error) {
          errorCount++;
        }
        
        // Small delay to avoid rate limiting
        if (i < filesToProcess.length - 1 && !dryRun) {
          await new Promise(resolve => setTimeout(resolve, fastMode ? 50 : 100));
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (dryRun) {
      console.log(`\n💡 Run without --dry-run to actually update the posts`);
    } else {
      console.log(`\n🎉 Update complete! Check your site to see the restored formatting.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
