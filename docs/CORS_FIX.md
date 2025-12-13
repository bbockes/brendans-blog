# Fixing CORS Issues with Sanity on Netlify

## Problem
Your site is deployed but posts aren't loading due to CORS (Cross-Origin Resource Sharing) errors. The browser console shows errors like:
```
Access to XMLHttpRequest at 'https://wxzoc64y.apicdn.sanity.io/...' has been blocked by CORS policy
```

## Solution

### Step 1: Add CORS Origin in Sanity

1. Go to [https://sanity.io/manage](https://sanity.io/manage)
2. Select your project: **wxzoc64y** (Brendans Blog)
3. Navigate to **API** → **CORS origins** (or **Settings** → **API** → **CORS origins**)
4. Click **Add CORS origin**
5. Add your Netlify domain:
   - **Origin**: `https://brendansblog.netlify.app`
   - **Allow credentials**: Leave unchecked (for public read access)
6. Click **Save**

### Step 2: Verify Environment Variables in Netlify

1. Go to your Netlify dashboard: [https://app.netlify.com](https://app.netlify.com)
2. Select your site: **brendansblog**
3. Go to **Site settings** → **Environment variables**
4. Verify these variables are set:
   - `VITE_SANITY_PROJECT_ID` = `wxzoc64y`
   - `VITE_SANITY_DATASET` = `production`
   - `VITE_SANITY_API_VERSION` = `2023-12-01`
   - `EMAILOCTOPUS_API_KEY` = (your API key)
   - `EMAILOCTOPUS_LIST_ID` = (your list ID)

### Step 3: Trigger a New Deployment

After adding the CORS origin:
1. Go to your Netlify dashboard
2. Click **Deploys**
3. Click **Trigger deploy** → **Deploy site**
4. Wait for the deployment to complete

### Step 4: Clear Browser Cache

Sometimes browsers cache CORS errors. Try:
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Or open the site in an incognito/private window

## Additional Notes

- If you add a custom domain later, you'll need to add that domain to CORS origins as well
- For local development, you may also want to add `http://localhost:5173` (or your local dev port)
- The CORS settings can take a few minutes to propagate

## Still Having Issues?

If CORS errors persist after adding the origin:
1. Double-check the exact domain in Sanity (must match exactly, including `https://`)
2. Wait 2-3 minutes for changes to propagate
3. Check the browser console for any other errors
4. Verify your Sanity project ID is correct in both Sanity and Netlify

