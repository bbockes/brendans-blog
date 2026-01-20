/**
 * Schema.org structured data utilities for SEO
 * Generates JSON-LD markup for blog posts, organization, and website
 */

interface BlogPost {
  id: string;
  title: string;
  excerpt?: string;
  subheader?: string;
  content?: any[];
  category?: string;
  readTime?: string | number;
  publishedAt?: string;
  created_at?: string;
  image?: string;
  slug?: string;
}

interface OrganizationSchema {
  "@context": string;
  "@type": string;
  name: string;
  url: string;
  logo?: string;
  description: string;
  sameAs?: string[];
}

interface WebSiteSchema {
  "@context": string;
  "@type": string;
  name: string;
  url: string;
  description: string;
  publisher: {
    "@type": string;
    name: string;
  };
  potentialAction?: {
    "@type": string;
    target: string;
    "query-input": string;
  };
}

interface BlogPostingSchema {
  "@context": string;
  "@type": string;
  headline: string;
  description: string;
  image?: string;
  author: {
    "@type": string;
    name: string;
  };
  publisher: {
    "@type": string;
    name: string;
    logo?: {
      "@type": string;
      url: string;
    };
  };
  datePublished: string;
  dateModified: string;
  mainEntityOfPage: {
    "@type": string;
    "@id": string;
  };
  articleSection?: string;
  wordCount?: number;
  timeRequired?: string;
  url: string;
}

interface BlogSchema {
  "@context": string;
  "@type": string;
  name: string;
  description: string;
  url: string;
  publisher: {
    "@type": string;
    name: string;
  };
  mainEntityOfPage: {
    "@type": string;
    "@id": string;
  };
}

// Default organization data
const ORGANIZATION_DATA = {
  name: "Brendan's Blog",
  url: "https://blog.brendanbockes.com",
  description: "The personal blog of Brendan Bockes. Thoughts on productivity, technology, and building.",
  logo: "https://blog.brendanbockes.com/images/logo.png",
  sameAs: [
    "https://www.linkedin.com/in/brendanbockes"
  ]
};

// Person data for author schema
const PERSON_DATA = {
  name: "Brendan Bockes",
  url: "https://blog.brendanbockes.com",
  sameAs: [
    "https://www.linkedin.com/in/brendanbockes"
  ]
};

// Extract text content from Portable Text for word count and description
function extractTextFromPortableText(content: any[]): string {
  if (!Array.isArray(content)) return '';
  
  return content
    .filter(block => block._type === 'block')
    .map(block => {
      if (!block.children || !Array.isArray(block.children)) return '';
      return block.children
        .filter((child: any) => child._type === 'span' && child.text)
        .map((child: any) => child.text)
        .join(' ');
    })
    .join(' ');
}

// Calculate word count from content
function getWordCount(content: any[]): number {
  const text = extractTextFromPortableText(content);
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Generate description from post data
function generateDescription(post: BlogPost): string {
  return post.excerpt || 
         post.subheader || 
         (post.content ? extractTextFromPortableText(post.content).substring(0, 160) : '') ||
         'A post from Brendan\'s Blog';
}

// Convert read time to ISO 8601 duration format
function formatReadTime(readTime: string | number): string {
  const timeStr = String(readTime || '5 min');
  const minutes = parseInt(timeStr.replace(/\D/g, '')) || 5;
  return `PT${minutes}M`;
}

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema(): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORGANIZATION_DATA.name,
    url: ORGANIZATION_DATA.url,
    logo: ORGANIZATION_DATA.logo,
    description: ORGANIZATION_DATA.description,
    sameAs: ORGANIZATION_DATA.sameAs
  };
}

/**
 * Generate Person schema for the blog author
 */
export function generatePersonSchema(): any {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: PERSON_DATA.name,
    url: PERSON_DATA.url,
    sameAs: PERSON_DATA.sameAs,
    jobTitle: "Writer, Builder, Thinker",
    description: "Personal blog about productivity, technology, and building."
  };
}

/**
 * Generate WebSite schema with search functionality
 */
export function generateWebSiteSchema(): WebSiteSchema {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: ORGANIZATION_DATA.name,
    url: ORGANIZATION_DATA.url,
    description: ORGANIZATION_DATA.description,
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${ORGANIZATION_DATA.url}/?search={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
}

/**
 * Generate Blog schema for the main blog page
 */
export function generateBlogSchema(): BlogSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: ORGANIZATION_DATA.name,
    description: ORGANIZATION_DATA.description,
    url: ORGANIZATION_DATA.url,
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": ORGANIZATION_DATA.url
    }
  };
}

/**
 * Generate BlogPosting schema for individual blog posts
 */
export function generateBlogPostSchema(post: BlogPost, postUrl: string): BlogPostingSchema {
  const publishedDate = post.publishedAt || post.created_at || new Date().toISOString();
  const description = generateDescription(post);
  const wordCount = post.content ? getWordCount(post.content) : 0;
  
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: description,
    image: post.image,
    author: {
      "@type": "Person",
      name: PERSON_DATA.name,
      url: PERSON_DATA.url
    },
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name,
      logo: ORGANIZATION_DATA.logo ? {
        "@type": "ImageObject",
        url: ORGANIZATION_DATA.logo
      } : undefined
    },
    datePublished: publishedDate,
    dateModified: publishedDate, // Using same date since we don't track modifications
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": postUrl
    },
    articleSection: post.category,
    wordCount: wordCount > 0 ? wordCount : undefined,
    timeRequired: post.readTime ? formatReadTime(post.readTime) : undefined,
    url: postUrl
  };
}

/**
 * Generate Article schema for the About page
 */
export function generateAboutPageSchema(): any {
  const aboutUrl = `${ORGANIZATION_DATA.url}/about`;
  
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About Brendan's Blog",
    description: "Learn about Brendan's Blog, the personal blog of Brendan Bockes.",
    url: aboutUrl,
    mainEntity: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name,
      description: ORGANIZATION_DATA.description,
      url: ORGANIZATION_DATA.url
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": aboutUrl
    }
  };
}

/**
 * Generate HowTo schema for tutorial/workflow content
 */
export function generateHowToSchema(post: BlogPost, postUrl: string): any {
  const description = generateDescription(post);
  const publishedDate = post.publishedAt || post.created_at || new Date().toISOString();
  
  // Extract steps from content if it's a how-to article
  const steps = extractStepsFromContent(post.content || []);
  
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: post.title,
    description: description,
    image: post.image,
    totalTime: post.readTime ? formatReadTime(post.readTime) : "PT5M",
    estimatedCost: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: "0"
    },
    supply: steps.supplies,
    tool: steps.tools,
    step: steps.instructions,
    author: {
      "@type": "Person",
      name: PERSON_DATA.name,
      url: PERSON_DATA.url
    },
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name,
      logo: ORGANIZATION_DATA.logo ? {
        "@type": "ImageObject",
        url: ORGANIZATION_DATA.logo
      } : undefined
    },
    datePublished: publishedDate,
    url: postUrl
  };
}

/**
 * Generate Review schema for tool/app reviews
 */
export function generateReviewSchema(post: BlogPost, postUrl: string): any {
  const description = generateDescription(post);
  const publishedDate = post.publishedAt || post.created_at || new Date().toISOString();
  
  // Try to extract tool name from title or content
  const toolName = extractToolNameFromContent(post);
  
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: toolName,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web, iOS, Android" // Default, could be customized per tool
    },
    author: {
      "@type": "Person",
      name: PERSON_DATA.name,
      url: PERSON_DATA.url
    },
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name
    },
    datePublished: publishedDate,
    headline: post.title,
    reviewBody: description,
    url: postUrl,
    reviewRating: {
      "@type": "Rating",
      ratingValue: "4", // Default rating, could be extracted from content
      bestRating: "5",
      worstRating: "1"
    }
  };
}

/**
 * Generate SoftwareApplication schema for detailed tool reviews
 */
export function generateSoftwareApplicationSchema(post: BlogPost, postUrl: string): any {
  const description = generateDescription(post);
  const toolName = extractToolNameFromContent(post);
  
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: toolName,
    description: description,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android",
    offers: {
      "@type": "Offer",
      price: "0", // Most productivity tools have free tiers
      priceCurrency: "USD"
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.5",
      reviewCount: "1",
      bestRating: "5",
      worstRating: "1"
    },
    review: {
      "@type": "Review",
      author: {
        "@type": "Person",
        name: PERSON_DATA.name,
        url: PERSON_DATA.url
      },
      datePublished: post.publishedAt || post.created_at || new Date().toISOString(),
      headline: post.title,
      reviewBody: description,
      reviewRating: {
        "@type": "Rating",
        ratingValue: "4",
        bestRating: "5"
      }
    },
    url: postUrl
  };
}

/**
 * Generate Course schema for educational/learning content
 */
export function generateCourseSchema(post: BlogPost, postUrl: string): any {
  const description = generateDescription(post);
  const publishedDate = post.publishedAt || post.created_at || new Date().toISOString();
  
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: post.title,
    description: description,
    provider: {
      "@type": "Organization",
      name: ORGANIZATION_DATA.name,
      url: ORGANIZATION_DATA.url
    },
    educationalLevel: "Beginner to Intermediate",
    about: {
      "@type": "Thing",
      name: post.category || "Productivity"
    },
    teaches: description,
    timeRequired: post.readTime ? formatReadTime(post.readTime) : "PT5M",
    courseMode: "Online",
    isAccessibleForFree: true,
    datePublished: publishedDate,
    url: postUrl,
    image: post.image
  };
}

/**
 * Generate FAQPage schema for Q&A style content
 */
export function generateFAQSchema(post: BlogPost, postUrl: string): any {
  const faqs = extractFAQsFromContent(post.content || []);
  
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    name: post.title,
    mainEntity: faqs.map((faq, index) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    })),
    url: postUrl,
    datePublished: post.publishedAt || post.created_at || new Date().toISOString(),
    author: {
      "@type": "Person",
      name: PERSON_DATA.name,
      url: PERSON_DATA.url
    }
  };
}

/**
 * Auto-detect appropriate schema type based on post content
 */
export function detectSchemaType(post: BlogPost): string {
  const title = post.title.toLowerCase();
  const content = post.content ? extractTextFromPortableText(post.content).toLowerCase() : '';
  const category = post.category?.toLowerCase() || '';
  
  // Check for HowTo indicators
  const howToKeywords = ['how to', 'step by step', 'tutorial', 'guide', 'workflow', 'process'];
  const hasHowToKeywords = howToKeywords.some(keyword => 
    title.includes(keyword) || content.includes(keyword)
  );
  
  // Check for Review indicators
  const reviewKeywords = ['review', 'vs', 'comparison', 'tool', 'app', 'software', 'best'];
  const hasReviewKeywords = reviewKeywords.some(keyword => 
    title.includes(keyword) || content.includes(keyword)
  );
  
  // Check for FAQ indicators
  const faqKeywords = ['faq', 'questions', 'answers', 'q&a'];
  const hasFAQKeywords = faqKeywords.some(keyword => 
    title.includes(keyword) || content.includes(keyword)
  );
  
  // Check for Course/Learning indicators
  const courseKeywords = ['learn', 'course', 'training', 'masterclass', 'lesson'];
  const hasCourseKeywords = courseKeywords.some(keyword => 
    title.includes(keyword) || content.includes(keyword) || category.includes(keyword)
  );
  
  // Return appropriate schema type
  if (hasFAQKeywords) return 'FAQPage';
  if (hasHowToKeywords) return 'HowTo';
  if (hasReviewKeywords) return 'Review';
  if (hasCourseKeywords) return 'Course';
  
  // Default to BlogPosting
  return 'BlogPosting';
}

/**
 * Generate appropriate schema based on post content
 */
export function generateContextualSchema(post: BlogPost, postUrl: string): any {
  const schemaType = detectSchemaType(post);
  
  switch (schemaType) {
    case 'HowTo':
      return generateHowToSchema(post, postUrl);
    case 'Review':
      return generateReviewSchema(post, postUrl);
    case 'Course':
      return generateCourseSchema(post, postUrl);
    case 'FAQPage':
      return generateFAQSchema(post, postUrl);
    default:
      return generateBlogPostSchema(post, postUrl);
  }
}

// Helper functions for content extraction

/**
 * Extract steps from content for HowTo schema
 */
function extractStepsFromContent(content: any[]): { supplies: any[], tools: any[], instructions: any[] } {
  const supplies: any[] = [];
  const tools: any[] = [];
  const instructions: any[] = [];
  
  let stepCounter = 1;
  
  content.forEach(block => {
    if (block._type === 'block') {
      const text = block.children?.map((child: any) => child.text).join(' ') || '';
      
      // Look for numbered steps or bullet points that seem like instructions
      if (block.listItem || text.match(/^\d+\./) || text.toLowerCase().includes('step')) {
        instructions.push({
          "@type": "HowToStep",
          position: stepCounter++,
          name: text.substring(0, 100), // First 100 chars as name
          text: text
        });
      }
      
      // Look for tool mentions
      const toolKeywords = ['use', 'tool', 'app', 'software', 'platform', 'website'];
      if (toolKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
        // Extract potential tool names (this is basic - could be enhanced)
        const toolMatches = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g);
        if (toolMatches) {
          toolMatches.forEach(tool => {
            if (tool.length > 2 && !tools.find(t => t.name === tool)) {
              tools.push({
                "@type": "HowToTool",
                name: tool
              });
            }
          });
        }
      }
    }
  });
  
  // If no specific steps found, create a general step
  if (instructions.length === 0) {
    instructions.push({
      "@type": "HowToStep",
      position: 1,
      name: "Follow the guide",
      text: "Follow the detailed instructions in this article to complete the task."
    });
  }
  
  return { supplies, tools, instructions };
}

/**
 * Extract tool name from post content
 */
function extractToolNameFromContent(post: BlogPost): string {
  const title = post.title;
  
  // Try to extract tool name from title
  const toolPatterns = [
    /(?:using|with|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/i,
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:review|guide|tutorial)/i,
    /^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/
  ];
  
  for (const pattern of toolPatterns) {
    const match = title.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      return match[1].trim();
    }
  }
  
  // Default to category or generic name
  return post.category || 'Productivity Tool';
}

/**
 * Extract FAQs from content
 */
function extractFAQsFromContent(content: any[]): { question: string, answer: string }[] {
  const faqs: { question: string, answer: string }[] = [];
  
  for (let i = 0; i < content.length - 1; i++) {
    const currentBlock = content[i];
    const nextBlock = content[i + 1];
    
    if (currentBlock._type === 'block' && nextBlock._type === 'block') {
      const currentText = currentBlock.children?.map((child: any) => child.text).join(' ') || '';
      const nextText = nextBlock.children?.map((child: any) => child.text).join(' ') || '';
      
      // Look for question patterns
      if (currentText.includes('?') || currentText.toLowerCase().startsWith('q:')) {
        faqs.push({
          question: currentText.replace(/^Q:\s*/i, '').trim(),
          answer: nextText.replace(/^A:\s*/i, '').trim()
        });
      }
    }
  }
  
  // If no FAQs found but it's detected as FAQ content, create a general one
  if (faqs.length === 0) {
    const allText = extractTextFromPortableText(content);
    faqs.push({
      question: "What is this about?",
      answer: allText.substring(0, 200) + "..."
    });
  }
  
  return faqs;
}

/**
 * Insert JSON-LD script tag into document head
 */
export function insertStructuredData(schema: any): void {
  // Remove existing schema script if it exists
  const existingScript = document.querySelector('script[data-schema-type]');
  if (existingScript) {
    existingScript.remove();
  }

  // Create and insert new schema script
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-schema-type', schema['@type']);
  script.textContent = JSON.stringify(schema, null, 2);
  document.head.appendChild(script);
}

/**
 * Insert multiple schema objects
 */
export function insertMultipleStructuredData(schemas: any[]): void {
  // Remove existing schema scripts
  const existingScripts = document.querySelectorAll('script[data-schema-type]');
  existingScripts.forEach(script => script.remove());

  // Insert each schema
  schemas.forEach((schema, index) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-schema-type', schema['@type']);
    script.setAttribute('data-schema-index', index.toString());
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
  });
}

/**
 * Get current page URL
 */
export function getCurrentUrl(): string {
  return window.location.href;
}

/**
 * Generate breadcrumb schema for blog posts
 */
export function generateBreadcrumbSchema(post: BlogPost): any {
  const baseUrl = ORGANIZATION_DATA.url;
  const postUrl = `${baseUrl}/posts/${post.slug || post.id}`;
  
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl
      },
      {
        "@type": "ListItem",
        position: 2,
        name: post.category || "Blog",
        item: `${baseUrl}/?category=${encodeURIComponent(post.category || '')}`
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: postUrl
      }
    ]
  };
}