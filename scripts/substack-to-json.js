#!/usr/bin/env node

/**
 * Substack HTML to Sanity JSON Converter
 * 
 * This script extracts HTML files from a Substack export zip file,
 * parses them, and converts them to JSON format compatible with Sanity CMS.
 * 
 * Usage:
 *   node scripts/substack-to-json.js <path-to-substack-export.zip> [output-dir]
 * 
 * Example:
 *   node scripts/substack-to-json.js ~/Downloads/substack-export.zip ./substack-import
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import yauzl from 'yauzl';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to decode HTML entities
function decodeHtmlEntities(text) {
  if (!text) return text;
  // Use a temporary element to decode HTML entities
  const dom = new JSDOM('');
  const document = dom.window.document;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Helper function to clean title - remove leading numbers and fix capitalization
// Preserves apostrophes and other punctuation
function cleanTitle(title) {
  if (!title) return title;
  
  // Decode HTML entities first (e.g., &apos; -> ', &#39; -> ')
  title = decodeHtmlEntities(title);
  
  // Remove leading numbers and dots (e.g., "148828092.ships In The Night" -> "ships In The Night")
  title = title.replace(/^\d+\.?\s*/, '');
  
  // Trim whitespace
  title = title.trim();
  
  // Capitalize first word, lowercase the rest
  // But preserve apostrophes and contractions (it's, you're, I'm, etc.)
  if (title.length > 0) {
    const words = title.split(/\s+/);
    if (words.length > 0) {
      // Capitalize first word, preserving apostrophes
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      for (let i = 1; i < words.length; i++) {
        // Lowercase the word, preserving apostrophes and other punctuation
        words[i] = words[i].toLowerCase();
      }
      title = words.join(' ');
    }
  }
  
  return title;
}

// Helper function to slugify text
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Helper function to extract text content from HTML element
function getTextContent(element) {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

// Helper function to parse date from various formats
function parseDate(dateString) {
  if (!dateString) return null;
  
  // Clean the date string
  dateString = dateString.trim();
  
  // Try to parse as ISO date first
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  // Try parsing as Unix timestamp (seconds or milliseconds)
  const timestamp = parseInt(dateString, 10);
  if (!isNaN(timestamp)) {
    // If it's a 10-digit number, it's seconds; if 13-digit, it's milliseconds
    const ts = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
    date = new Date(ts);
    if (!isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
      return date.toISOString();
    }
  }
  
  // Try common date formats
  const dateFormats = [
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
    /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/, // Month DD, YYYY
  ];
  
  for (const format of dateFormats) {
    const match = dateString.match(format);
    if (match) {
      date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  
  return null;
}

// Extract date from filename (Substack sometimes includes dates in filenames)
function extractDateFromFilename(fileName) {
  if (!fileName) return null;
  
  // Try to extract date patterns from filename
  // Pattern 1: YYYY-MM-DD or YYYY_MM_DD
  const datePattern1 = /(\d{4})[-_](\d{2})[-_](\d{2})/;
  const match1 = fileName.match(datePattern1);
  if (match1) {
    const date = new Date(`${match1[1]}-${match1[2]}-${match1[3]}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  
  // Pattern 2: Unix timestamp at the start (if it's a valid timestamp)
  const timestampMatch = fileName.match(/^(\d{10,13})/);
  if (timestampMatch) {
    const timestamp = parseInt(timestampMatch[1], 10);
    const ts = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
    const date = new Date(ts);
    // Check if it's a reasonable date (between 2000 and 2100)
    if (!isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
      return date.toISOString();
    }
  }
  
  return null;
}

// Calculate read time from content
function calculateReadTime(content) {
  if (!Array.isArray(content)) return '1 min';
  
  let wordCount = 0;
  content.forEach(block => {
    if (block._type === 'block' && block.children) {
      block.children.forEach(child => {
        if (child._type === 'span' && child.text) {
          wordCount += child.text.split(/\s+/).filter(word => word.length > 0).length;
        }
      });
    }
  });
  
  // Average reading speed: 200-250 words per minute
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min`;
}

// Convert HTML to Portable Text blocks
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
      const text = getTextContent(element);
      if (text) {
        blocks.push({
          _type: 'block',
          style: style,
          children: [{ _type: 'span', text: text, marks: [] }],
        });
      }
      return;
    }
    
    // Handle blockquotes
    if (tagName === 'blockquote') {
      const text = getTextContent(element);
      if (text) {
        blocks.push({
          _type: 'block',
          style: 'blockquote',
          children: [{ _type: 'span', text: text, marks: [] }],
        });
      }
      return;
    }
    
    // Handle lists
    if (tagName === 'ul' || tagName === 'ol') {
      const listType = tagName === 'ul' ? 'bullet' : 'number';
      Array.from(element.querySelectorAll('li')).forEach((li) => {
        const text = getTextContent(li);
        if (text) {
          blocks.push({
            _type: 'block',
            listItem: listType,
            style: 'normal',
            children: [{ _type: 'span', text: text, marks: [] }],
          });
        }
      });
      return;
    }
    
    // Handle images (in content)
    if (tagName === 'img') {
      const src = element.getAttribute('src') || element.getAttribute('data-src');
      const alt = element.getAttribute('alt') || '';
      if (src) {
        // Store image URL for later upload
        blocks.push({
          _type: 'image',
          _imageUrl: src, // Temporary field for import script to handle
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
    const text = getTextContent(body);
    if (text) {
      blocks.push({
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: text, marks: [] }],
      });
    }
  }
  
  return blocks;
}

// Parse inline content (spans, links, formatting)
function parseInlineContent(element) {
  const children = [];
  let markDefs = [];
  let markDefIndex = 0;
  
  function processNode(node, inheritedMarks = [], isFirst = false, isLast = false, prevSibling = null, nextSibling = null) {
    if (node.nodeType === 3) {
      // Text node - preserve spaces around links
      let text = node.textContent || '';
      
      // Check if adjacent siblings are links - if so, preserve spaces
      const prevIsLink = prevSibling && prevSibling.nodeType === 1 && prevSibling.tagName?.toLowerCase() === 'a';
      const nextIsLink = nextSibling && nextSibling.nodeType === 1 && nextSibling.tagName?.toLowerCase() === 'a';
      
      // Only trim if it's the first or last node in the parent, and not adjacent to links
      if (isFirst && isLast) {
        // Only node, trim both sides
        text = text.trim();
      } else if (isFirst && !nextIsLink) {
        // First node, trim leading whitespace but preserve trailing (unless next is link)
        text = text.replace(/^\s+/, '');
      } else if (isLast && !prevIsLink) {
        // Last node, trim trailing whitespace but preserve leading (unless prev is link)
        text = text.replace(/\s+$/, '');
      } else if (prevIsLink || nextIsLink) {
        // Adjacent to a link, preserve all whitespace
        // Don't trim at all
      } else {
        // Middle node, preserve all whitespace
      }
      
      if (text) {
        children.push({ _type: 'span', text: text, marks: [...inheritedMarks] });
      }
    } else if (node.nodeType === 1) {
      // Element node
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
        const text = getTextContent(node);
        if (text && href) {
          const markKey = `link-${markDefIndex++}`;
          markDefs.push({
            _key: markKey,
            _type: 'link',
            href: href,
          });
          children.push({
            _type: 'span',
            text: text,
            marks: [...currentMarks, markKey],
          });
        }
      } else {
        // Process child nodes recursively, passing down accumulated marks
        const childNodes = Array.from(node.childNodes);
        if (childNodes.length === 0) {
          // Empty element, might be a line break
          if (tagName === 'br') {
            children.push({ _type: 'span', text: '\n', marks: [] });
          }
        } else {
          childNodes.forEach((child, index) => {
            const prevSibling = index > 0 ? childNodes[index - 1] : null;
            const nextSibling = index < childNodes.length - 1 ? childNodes[index + 1] : null;
            processNode(child, currentMarks, index === 0, index === childNodes.length - 1, prevSibling, nextSibling);
          });
        }
      }
    }
  }
  
  const childNodes = Array.from(element.childNodes);
  childNodes.forEach((node, index) => {
    const prevSibling = index > 0 ? childNodes[index - 1] : null;
    const nextSibling = index < childNodes.length - 1 ? childNodes[index + 1] : null;
    processNode(node, [], index === 0, index === childNodes.length - 1, prevSibling, nextSibling);
  });
  
  return { children, markDefs };
}

// Extract post metadata and content from HTML
function parseSubstackHTML(htmlContent, fileName = '', postsCSV = new Map()) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  // Try to find title - common Substack patterns
  let title = '';
  
  // First, try meta tags (most reliable)
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
      // Decode HTML entities in meta content
      if (title) {
        const dom = new JSDOM('');
        const doc = dom.window.document;
        const textarea = doc.createElement('textarea');
        textarea.innerHTML = title;
        title = textarea.value;
        break;
      }
    }
  }
  
  // If not found in meta tags, try HTML elements
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
      'h2.post-title',
      'h2.entry-title',
      'title',
    ];
    
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        title = getTextContent(element);
        // Clean up title - remove common suffixes like " | Substack"
        if (title) {
          title = title.replace(/\s*\|\s*.*$/, '').trim();
          if (title) break;
        }
      }
    }
  }
  
  // If still no title, try to extract from filename
  if (!title && fileName) {
    // Remove .html extension and path
    const baseName = path.basename(fileName, path.extname(fileName));
    // Decode URL-encoded filenames and clean up
    try {
      title = decodeURIComponent(baseName).replace(/[-_]/g, ' ').trim();
      // Capitalize first letter of each word
      title = title.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    } catch (e) {
      title = baseName.replace(/[-_]/g, ' ').trim();
    }
  }
  
  // If still no title, use default
  if (!title) {
    title = 'Untitled Post';
  }
  
  // Clean the title - remove leading numbers and fix capitalization
  title = cleanTitle(title);
  
  // Try to find published date
  let publishedAt = null;
  
  // First, try to get date from CSV file (most reliable)
  if (fileName && postsCSV.size > 0) {
    const baseName = path.basename(fileName, path.extname(fileName));
    // Try matching by full filename
    if (postsCSV.has(baseName)) {
      publishedAt = postsCSV.get(baseName);
    } else {
      // Try matching by removing leading numbers (e.g., "148808966trying-vs-doing" -> "trying-vs-doing")
      const slugPart = baseName.replace(/^\d+/, '');
      if (slugPart && postsCSV.has(slugPart)) {
        publishedAt = postsCSV.get(slugPart);
      } else {
        // Try matching by post_id format (number.slug)
        const postIdMatch = baseName.match(/^(\d+)(.+)$/);
        if (postIdMatch) {
          const postId = `${postIdMatch[1]}.${postIdMatch[2]}`;
          if (postsCSV.has(postId)) {
            publishedAt = postsCSV.get(postId);
          }
        }
      }
    }
  }
  
  // If not found in CSV, try extracting from filename
  if (!publishedAt && fileName) {
    const filenameDate = extractDateFromFilename(fileName);
    if (filenameDate) {
      publishedAt = filenameDate;
    }
  }
  
  // Try to extract from JSON-LD structured data
  if (!publishedAt) {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const jsonData = JSON.parse(script.textContent);
        // Check for datePublished in structured data
        if (jsonData.datePublished) {
          const parsed = parseDate(jsonData.datePublished);
          if (parsed) {
            publishedAt = parsed;
            break;
          }
        }
        // Also check if it's an array
        if (Array.isArray(jsonData)) {
          for (const item of jsonData) {
            if (item.datePublished) {
              const parsed = parseDate(item.datePublished);
              if (parsed) {
                publishedAt = parsed;
                break;
              }
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
      if (publishedAt) break;
    }
  }
  
  // Then try HTML selectors
  if (!publishedAt) {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="publish_date"]',
      'meta[property="publish_date"]',
      'meta[name="date"]',
      'meta[property="date"]',
      'time[datetime]',
      'time.publish-date',
      'time.date',
      'time[itemprop="datePublished"]',
      '.publish-date',
      '.publishDate',
      '.date',
      '.post-date',
      '.entry-date',
      '[datetime]',
      '[itemprop="datePublished"]',
      'time',
    ];
    
    for (const selector of dateSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const dateValue = element.getAttribute('datetime') || 
                         element.getAttribute('content') || 
                         element.getAttribute('data-date') ||
                         element.getAttribute('pubdate') ||
                         getTextContent(element);
        if (dateValue) {
          const parsed = parseDate(dateValue);
          if (parsed) {
            publishedAt = parsed;
            break;
          }
        }
      }
      if (publishedAt) break;
    }
  }
  
  // If still no date found, try searching the entire document for date patterns
  if (!publishedAt) {
    const bodyText = document.body?.textContent || '';
    // Look for common date patterns in the text
    const datePatterns = [
      /\b(\d{4})-(\d{2})-(\d{2})\b/, // YYYY-MM-DD
      /\b([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/, // Month DD, YYYY
      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, // MM/DD/YYYY
    ];
    
    for (const pattern of datePatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const parsed = parseDate(match[0]);
        if (parsed) {
          // Make sure it's not a future date or too old
          const date = new Date(parsed);
          const now = new Date();
          const year2000 = new Date('2000-01-01');
          if (date <= now && date >= year2000) {
            publishedAt = parsed;
            break;
          }
        }
      }
    }
  }
  
  // If still no date found, use current date as fallback
  if (!publishedAt) {
    publishedAt = new Date().toISOString();
  }
  
  // Try to find excerpt/description
  let excerpt = '';
  const excerptSelectors = [
    'meta[name="description"]',
    'meta[property="og:description"]',
    '.excerpt',
    '.summary',
  ];
  
  for (const selector of excerptSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      excerpt = element.getAttribute('content') || getTextContent(element);
      if (excerpt) break;
    }
  }
  
  // Extract main content
  const contentSelectors = [
    '.post-content',
    '.entry-content',
    'article',
    '.content',
    'main',
    'body',
  ];
  
  let contentHTML = '';
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      contentHTML = element.innerHTML;
      break;
    }
  }
  
  // If no content found, use body
  if (!contentHTML) {
    contentHTML = document.body?.innerHTML || '';
  }
  
  // Convert HTML to Portable Text
  const content = htmlToPortableText(contentHTML);
  
  // If title is still "Untitled Post", try to extract from first heading in content
  if (title === 'Untitled Post' && content.length > 0) {
    const firstHeading = content.find(b => 
      b._type === 'block' && 
      ['h1', 'h2', 'h3', 'h4'].includes(b.style) && 
      b.children && 
      b.children.length > 0
    );
    if (firstHeading && firstHeading.children.length > 0) {
      const headingText = firstHeading.children
        .filter(c => c._type === 'span' && c.text)
        .map(c => c.text)
        .join(' ')
        .trim();
      if (headingText) {
        title = headingText;
      }
    }
  }
  
  // Generate excerpt from first paragraph if not found
  if (!excerpt && content.length > 0) {
    const firstBlock = content.find(b => b._type === 'block' && b.children);
    if (firstBlock && firstBlock.children.length > 0) {
      const firstText = firstBlock.children
        .filter(c => c._type === 'span' && c.text)
        .map(c => c.text)
        .join(' ')
        .substring(0, 200);
      excerpt = firstText;
    }
  }
  
  // Try to find main image
  let imageUrl = '';
  const imageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'img[src]',
  ];
  
  for (const selector of imageSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      imageUrl = element.getAttribute('content') || 
                element.getAttribute('src') || 
                '';
      if (imageUrl) break;
    }
  }
  
  // Calculate read time
  const readTime = calculateReadTime(content);
  
  // Clean title one more time before returning (in case it was set from content)
  const cleanedTitle = cleanTitle(title);
  
  return {
    title: cleanedTitle,
    slug: slugify(cleanedTitle),
    publishedAt,
    excerpt: excerpt.substring(0, 200), // Max 200 chars
    image: imageUrl,
    readTime,
    content,
    // Note: category will need to be set manually or extracted from Substack metadata
    // Default will be applied during import
  };
}

// Extract zip file
function extractZip(zipPath, outputDir) {
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

// Load CSV data to get publish dates
function loadPostsCSV(zipPath) {
  const csvMap = new Map();
  
  try {
    // Try to find posts.csv in the same directory as the zip file
    const zipDir = path.dirname(zipPath);
    const zipBaseName = path.basename(zipPath, path.extname(zipPath));
    
    // Try multiple possible locations
    const possiblePaths = [
      path.join(zipDir, 'posts.csv'), // Same directory as zip
      path.join(zipDir, zipBaseName, 'posts.csv'), // In extracted folder
      path.join(zipDir, 'substack-export', 'posts.csv'), // In substack-export folder
    ];
    
    let csvPath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        csvPath = possiblePath;
        break;
      }
    }
    
    if (csvPath) {
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n');
      
      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line (handling quoted fields)
        const fields = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current);
        
        if (fields.length >= 2) {
          const postId = fields[0].trim();
          const postDate = fields[1].trim();
          
          if (postId && postDate) {
            // Store by post_id (e.g., "176682678.language-is-leverage")
            csvMap.set(postId, postDate);
            // Also store by just the slug part for matching
            const slugPart = postId.split('.').slice(1).join('.');
            if (slugPart) {
              csvMap.set(slugPart, postDate);
            }
          }
        }
      }
      
      console.log(`📅 Loaded ${csvMap.size} publish dates from posts.csv`);
    }
  } catch (error) {
    console.warn(`⚠️  Could not load posts.csv: ${error.message}`);
  }
  
  return csvMap;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/substack-to-json.js <path-to-substack-export.zip> [output-dir]');
    process.exit(1);
  }
  
  const zipPath = path.resolve(args[0]);
  const outputDir = args[1] ? path.resolve(args[1]) : path.join(__dirname, '..', 'substack-import');
  
  // Load CSV data for publish dates
  const postsCSV = loadPostsCSV(zipPath);
  
  if (!fs.existsSync(zipPath)) {
    console.error(`Error: Zip file not found: ${zipPath}`);
    process.exit(1);
  }
  
  console.log(`📦 Extracting HTML files from: ${zipPath}`);
  console.log(`📁 Output directory: ${outputDir}`);
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    // Extract HTML files from zip
    const htmlFiles = await extractZip(zipPath, outputDir);
    console.log(`✅ Found ${htmlFiles.length} HTML files`);
    
    // Process each HTML file
    const posts = [];
    for (const file of htmlFiles) {
      console.log(`\n📄 Processing: ${file.fileName}`);
      
      try {
        const postData = parseSubstackHTML(file.content, file.fileName, postsCSV);
        posts.push(postData);
        
        // Save individual JSON file
        const jsonFileName = `${postData.slug}.json`;
        const jsonPath = path.join(outputDir, jsonFileName);
        fs.writeFileSync(jsonPath, JSON.stringify(postData, null, 2));
        console.log(`  ✅ Created: ${jsonFileName}`);
      } catch (error) {
        console.error(`  ❌ Error processing ${file.fileName}:`, error.message);
      }
    }
    
    // Save combined JSON file
    const combinedPath = path.join(outputDir, 'all-posts.json');
    fs.writeFileSync(combinedPath, JSON.stringify(posts, null, 2));
    console.log(`\n✅ Created combined file: all-posts.json`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Total posts: ${posts.length}`);
    console.log(`   - Output directory: ${outputDir}`);
    console.log(`\n💡 Next step: Run the import script to upload to Sanity:`);
    console.log(`   node scripts/import-to-sanity.js ${outputDir}/all-posts.json`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

