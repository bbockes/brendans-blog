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
});

// GROQ queries
export const POSTS_QUERY = `*[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
  _id,
  title,
  slug,
  excerpt,
  category,
  readTime,
  publishedAt,
  content,
  "image": image.asset->url,
  subheader
}`;

export const CATEGORIES_QUERY = `*[_type == "post" && defined(category)] | order(category asc) {
  category
}`;

export const POST_BY_SLUG_QUERY = `*[_type == "post" && slug.current == $slug][0] {
  _id,
  title,
  slug,
  excerpt,
  category,
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