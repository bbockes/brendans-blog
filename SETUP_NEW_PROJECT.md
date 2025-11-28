# Setting Up a New Project Instance

This guide will help you clone this project and set it up with a new Sanity CMS instance and Netlify deployment.

## Step 1: Create a New Sanity Project

1. Go to [sanity.io](https://www.sanity.io) and sign in
2. Create a new project (or use an existing one)
3. Note down:
   - **Project ID** (e.g., `abc123xyz`)
   - **Dataset name** (usually `production` or `development`)
   - **API Version** (usually `2023-12-01` or latest)

## Step 2: Clone/Copy the Project

### Option A: Create a new repository (Recommended)
```bash
# Create a new directory for your new project
cd /path/to/your/projects
mkdir super-productive-v2  # or whatever name you prefer
cd super-productive-v2

# Copy all files from the original project
cp -r /Users/Brendan/Repos/super_productive/* .
cp -r /Users/Brendan/Repos/super_productive/.* . 2>/dev/null || true

# Initialize new git repo
git init
git add .
git commit -m "Initial commit - cloned from super-productive"
```

### Option B: Fork/Clone from GitHub
If the project is already on GitHub:
```bash
git clone https://github.com/yourusername/super-productive.git super-productive-v2
cd super-productive-v2
```

## Step 3: Update Sanity Configuration

### 3.1 Update Studio Configuration

**Edit `studio-super-productive/sanity.config.ts`:**
- Change `projectId` to your new Sanity project ID
- Update `dataset` if needed (usually keep as `production`)
- Optionally change the `title` to match your new project name

**Edit `studio-super-productive/sanity.cli.ts`:**
- Change `projectId` to your new Sanity project ID
- Update `dataset` if needed

### 3.2 Create Environment Variables File
Create a `.env` file in the root directory:
```bash
VITE_SANITY_PROJECT_ID=your_new_project_id_here
VITE_SANITY_DATASET=production
VITE_SANITY_API_VERSION=2023-12-01
```

**Important:** The `.env` file is already in `.gitignore`, so it won't be committed to git.

### 3.3 Set Up Netlify Environment Variables
When deploying to Netlify, you'll need to add these same environment variables:
1. Go to your Netlify site settings
2. Navigate to **Site configuration** → **Environment variables**
3. Add:
   - `VITE_SANITY_PROJECT_ID` = your new project ID
   - `VITE_SANITY_DATASET` = production (or your dataset name)
   - `VITE_SANITY_API_VERSION` = 2023-12-01

## Step 4: Set Up Sanity Studio Schema

1. Navigate to the studio directory:
   ```bash
   cd studio-super-productive
   npm install
   ```

2. Deploy your schema to the new Sanity project:
   ```bash
   npm run deploy
   ```
   This will deploy the studio to Sanity's hosting and sync your schema types.

3. Alternatively, you can run the studio locally:
   ```bash
   npm run dev
   ```
   Then access it at `http://localhost:3333` to configure your new project.

## Step 5: Install Dependencies

In the root directory:
```bash
npm install
```

## Step 6: Test Locally

```bash
npm run dev
```

Visit `http://localhost:5173` (or the port Vite assigns) to verify everything works.

## Step 7: Deploy to Netlify

### Option A: Connect via Git (Recommended)
1. Push your new project to GitHub/GitLab/Bitbucket
2. Go to [Netlify](https://app.netlify.com)
3. Click **Add new site** → **Import an existing project**
4. Connect your repository
5. Configure build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Add environment variables (see Step 3.3)
7. Deploy!

### Option B: Manual Deploy
```bash
npm run build
netlify deploy --prod --dir=dist
```

## Step 8: Update Project-Specific Content

Consider updating:
- Site title/name in `studio-super-productive/sanity.config.ts`
- **Base URL in `scripts/prerender.js`** (line 114) - update to your new domain
- **Base URL in `scripts/generate-sitemap.js`** (line 38) - update to your new domain
- Domain name in `public/robots.txt` and `public/sitemap.xml` (if generated)
- Any hardcoded references to "super-productive" in the codebase
- Favicon and logo files in `public/` directory

**Note:** The build scripts (`prerender.js` and `generate-sitemap.js`) have fallback Sanity project IDs. While they use environment variables first, you may want to update the fallback values if you're not using `.env` files.

## Quick Checklist

- [ ] Created new Sanity project
- [ ] Cloned/copied project files
- [ ] Updated `studio-super-productive/sanity.config.ts` with new project ID
- [ ] Updated `studio-super-productive/sanity.cli.ts` with new project ID
- [ ] Created `.env` file with new Sanity credentials
- [ ] Installed dependencies (`npm install` in root and studio)
- [ ] Deployed Sanity studio schema (`cd studio-super-productive && npm run deploy`)
- [ ] Tested locally (`npm run dev`)
- [ ] Set up Netlify site with environment variables
- [ ] Deployed to Netlify
- [ ] Verified site works with new Sanity content

## Notes

- The original project uses Sanity project ID: `2osuh55w`
- The main app reads Sanity config from environment variables (good for flexibility)
- The studio has hardcoded project ID (needs manual update)
- Both projects can coexist - they use different Sanity projects
- You can reuse the same Netlify account, just create a new site

