# About Page Setup with Sanity CMS

This document explains how the about page has been migrated from static content to Sanity CMS for better content management.

## Overview

The about page is now managed through Sanity CMS as a separate content type, which means:
- ✅ Rich text editing with proper formatting
- ✅ Separate from blog posts (won't appear in homepage listings)
- ✅ Easy content updates without code changes
- ✅ Proper bold/italic formatting that actually works

## Setup Steps

### 1. Schema Added
- Created `aboutPageType.ts` in your Sanity schema
- Added to `schemaTypes/index.ts`
- Includes rich text content and optional P.S. section

### 2. Data Fetching
- Added `ABOUT_PAGE_QUERY` to `sanityClient.ts`
- Created `aboutPageService.ts` for fetching and transforming data
- Updated `BlogLayout.tsx` to fetch from Sanity instead of static data

### 3. Initial Content Creation
Run the setup script to create your initial about page:

```bash
# Set your Sanity write token
export SANITY_WRITE_TOKEN="your_token_here"

# Run the creation script
node scripts/createAboutPage.js
```

## How It Works

1. **Route Access**: When users visit `/about`, the app fetches the about page from Sanity
2. **Caching**: The about page data is cached in component state to avoid repeated API calls
3. **Fallback**: If Sanity is unavailable, the app handles it gracefully
4. **Rich Text**: Content is rendered using Sanity's rich text format with proper formatting

## Content Management

### Editing Content
1. Go to your Sanity Studio
2. Look for "About Page" in the content types
3. Edit using the rich text editor
4. Changes appear immediately on your website

### Content Structure
- **Title**: Page title (defaults to "Brendan's Blog")
- **Excerpt**: Optional meta description
- **Read Time**: Display read time
- **Main Content**: Rich text with bold, italic, lists, etc.
- **P.S. Section**: Optional additional content section
- **Header Image**: Optional hero image

## Benefits

### For Content Editing
- WYSIWYG rich text editor
- Proper bold/italic formatting
- Easy to add links, lists, etc.
- No need to understand markdown or code

### For Development
- Cleaner separation of content and code
- No more complex parsing functions
- Standard Sanity rich text rendering
- Better maintainability

## Migration Notes

The old static about page files can be removed:
- `src/data/aboutPage.ts` - No longer needed
- Complex markdown parsing functions - Replaced by Sanity's rich text

## Troubleshooting

### About page not loading?
1. Check Sanity Studio - make sure about page content exists
2. Verify environment variables are set correctly
3. Check browser console for API errors

### Formatting not working?
1. Use Sanity Studio's rich text editor instead of markdown
2. Bold/italic should work automatically with the editor
3. Check that content is saved in Sanity Studio

### Content not updating?
1. Clear browser cache
2. Check if content is published in Sanity Studio
3. Verify API connection is working
