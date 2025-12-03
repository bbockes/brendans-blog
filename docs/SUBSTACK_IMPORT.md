# Importing Posts from Substack to Sanity

This guide explains how to export your Substack posts and import them into Sanity CMS.

## Prerequisites

1. **Export your Substack posts**: 
   - Go to your Substack settings
   - Navigate to Export
   - Download your posts as a ZIP file (this will contain HTML files for each post)

2. **Get your Sanity API Token**:
   - Go to https://sanity.io/manage
   - Select your project
   - Go to API > Tokens
   - Create a new token with "Editor" permissions
   - Add it to your `.env` file: `SANITY_API_TOKEN=your-token-here`

## Step 1: Convert Substack HTML to JSON

Run the conversion script to extract and convert HTML files from your Substack export:

```bash
node scripts/substack-to-json.js <path-to-substack-export.zip> [output-dir]
```

**Example:**
```bash
node scripts/substack-to-json.js ~/Downloads/substack-export.zip ./substack-import
```

This will:
- Extract all HTML files from the ZIP
- Parse each HTML file to extract:
  - Title
  - Published date
  - Content (converted to Sanity Portable Text format)
  - Excerpt
  - Main image
  - Read time (calculated automatically)
- Create individual JSON files for each post
- Create a combined `all-posts.json` file

**Output:**
- Individual JSON files: `./substack-import/<slug>.json`
- Combined file: `./substack-import/all-posts.json`

## Step 2: Import to Sanity

### Dry Run (Recommended First)

Test the import without actually creating posts:

```bash
node scripts/import-to-sanity.js ./substack-import/all-posts.json --dry-run
```

This will show you what would be imported without making any changes.

### Actual Import

Once you're satisfied with the dry run, import the posts:

```bash
node scripts/import-to-sanity.js ./substack-import/all-posts.json
```

This will:
- Upload images to Sanity assets
- Create posts in your Sanity dataset
- Skip posts that already exist (based on slug)
- Show progress and summary

## Notes

### Categories
The script will default to "Writing" category for all posts. You can:
1. Edit the JSON files before importing to set categories
2. Update categories manually in Sanity Studio after import
3. Modify the script to extract categories from Substack metadata if available

### Images
- Main images and images in content will be uploaded to Sanity
- Images must be accessible via HTTP/HTTPS (absolute URLs)
- Relative image URLs will be skipped with a warning

### Content Formatting
The script converts HTML to Sanity Portable Text format:
- Headings (H1-H4)
- Paragraphs
- Lists (bulleted and numbered)
- Blockquotes
- Links
- Bold, italic, and code formatting
- Images
- Code blocks

### Read Time
Read time is automatically calculated based on word count (200 words per minute).

## Troubleshooting

### "SANITY_API_TOKEN environment variable is required"
- Make sure you've created a `.env` file in the project root
- Add: `SANITY_API_TOKEN=your-token-here`

### "Post already exists"
- The script skips posts that already exist (based on slug)
- To re-import, delete the post from Sanity Studio first, or modify the slug in the JSON

### Images not uploading
- Check that image URLs are absolute (start with http:// or https://)
- Verify the URLs are accessible
- Check your internet connection

### Content looks wrong
- Substack HTML structure may vary
- You may need to adjust the selectors in `substack-to-json.js` to match your specific export format
- Check the generated JSON files to see what was extracted

## Manual Adjustments

After importing, you may want to:
1. Review posts in Sanity Studio
2. Update categories to match your blog's categories
3. Add or update excerpts
4. Verify images uploaded correctly
5. Check that formatting looks correct
