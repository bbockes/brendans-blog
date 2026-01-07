import { createClient } from '@sanity/client';

export const sanityClient = createClient({
  projectId: import.meta.env.VITE_SANITY_PROJECT_ID || 'wxzoc64y',
  dataset: import.meta.env.VITE_SANITY_DATASET || 'production',
  apiVersion: import.meta.env.VITE_SANITY_API_VERSION || '2023-12-01',
  useCdn: true, // Set to false if you want to ensure fresh content
  perspective: 'published', // Use published perspective for public content
  stega: {
    enabled: false, // Disable stega encoding for production
  },
  // Add request tag for better CDN caching
  requestTagPrefix: 'blog',
});

// Simple in-memory cache for queries
const queryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cached fetch wrapper
export async function cachedFetch<T>(query: string, params?: any): Promise<T> {
  const cacheKey = `${query}:${JSON.stringify(params || {})}`;
  const cached = queryCache.get(cacheKey);
  
  // Return cached data if it's still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  
  // Fetch fresh data
  const data = await sanityClient.fetch<T>(query, params || {});
  
  // Cache the result
  queryCache.set(cacheKey, { data, timestamp: Date.now() });
  
  return data;
}

// GROQ queries
// Optimized query - fetch only needed fields, use efficient ordering
// Filter out future-dated posts to enable scheduling based on publishedAt date
export const POSTS_QUERY = `*[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc) {
  _id,
  title,
  slug,
  excerpt,
  readTime,
  publishedAt,
  content,
  "image": image.asset->url,
  subheader
}`;

export const CATEGORIES_QUERY = `*[_type == "post" && publishedAt <= now()] | order(_createdAt desc) {
  _id
}`;

export const POST_BY_SLUG_QUERY = `*[_type == "post" && slug.current == $slug && publishedAt <= now()][0] {
  _id,
  title,
  slug,
  excerpt,
  readTime,
  publishedAt,
  content,
  "image": image.asset->url,
  subheader
}`;

export const LINK_CARDS_QUERY = `*[_type == "linkCard"] | order(_createdAt asc) {
  _id,
  title,
  hook,
  "image": image.asset->url,
  url
}`;

export const LINK_CARD_CATEGORIES_QUERY = `*[_type == "linkCard" && defined(category)] | order(category asc) {
  category
}`;

export const ABOUT_PAGE_QUERY = `*[_type == "aboutPage"][0] {
  _id,
  title,
  excerpt,
  readTime,
  content,
  psContent,
  "image": image.asset->url,
  "headshot": headshot.asset->url,
  "headshotAlt": headshot.alt
}`;