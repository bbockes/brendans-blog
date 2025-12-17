import { cachedFetch, ABOUT_PAGE_QUERY } from './sanityClient';

export interface AboutPageData {
  _id: string;
  title: string;
  excerpt?: string;
  readTime: string;
  content: any[];
  psContent?: any[];
  image?: {
    asset: {
      url: string;
    };
  };
  headshot?: string;
  headshotAlt?: string;
}

export async function fetchAboutPage(): Promise<AboutPageData | null> {
  try {
    const aboutPage = await cachedFetch<AboutPageData>(ABOUT_PAGE_QUERY);
    
    if (aboutPage) {
      console.log('✅ About page fetched successfully:', aboutPage.title);
      return aboutPage;
    }
    
    console.warn('No about page found in Sanity');
    return null;
  } catch (error) {
    console.error('Error fetching about page:', error);
    return null;
  }
}

export function transformAboutPageToBlogPost(aboutPageData: AboutPageData): any {
  if (!aboutPageData) return null;

  return {
    id: 'about',
    title: aboutPageData.title,
    excerpt: aboutPageData.excerpt || "About Brendan's Blog",
    category: 'About',
    readTime: aboutPageData.readTime,
    image: aboutPageData.image?.asset?.url || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&h=250&fit=crop',
    headshot: aboutPageData.headshot,
    headshotAlt: aboutPageData.headshotAlt,
    content: aboutPageData.content, // Keep main content separate
    psContent: aboutPageData.psContent, // Keep P.S. content separate for modal display
    slug: 'about',
    publishedAt: new Date().toISOString(),
    _id: aboutPageData._id
  };
}
