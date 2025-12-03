/**
 * Convert a string to a URL-friendly slug
 * @param text - The text to convert to a slug
 * @returns A URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove all non-word chars except hyphens
    .replace(/[^\w\-]+/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/\-\-+/g, '-')
    // Remove hyphens from start and end
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Find a post by its slug
 * @param posts - Array of posts
 * @param slug - The slug to search for
 * @returns The matching post or undefined
 */
export function findPostBySlug(posts: any[], slug: string) {
  return posts.find(post => {
    // Check if post has a slug field, otherwise use title
    const postSlug = post.slug || slugify(post.title);
    return postSlug === slug;
  });
}

/**
 * Extract plain text from Portable Text content
 * @param content - Array of Portable Text blocks
 * @returns Extracted plain text as a string
 */
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

/**
 * Extract the first sentence from Portable Text content
 * @param content - Array of Portable Text blocks
 * @returns The first sentence as a string
 */
export function extractFirstSentence(content: any[]): string {
  if (!Array.isArray(content)) return '';
  
  const fullText = extractTextFromPortableText(content);
  if (!fullText) return '';
  
  // Match the first sentence (ending with . ! or ? followed by space or end of string)
  const sentenceMatch = fullText.match(/^[^.!?]*[.!?](?:\s|$)/);
  if (sentenceMatch) {
    return sentenceMatch[0].trim();
  }
  
  // If no sentence ending found, return first 200 characters
  return fullText.substring(0, 200).trim();
}

/**
 * Extract the sentence containing the search term from Portable Text content
 * @param content - Array of Portable Text blocks
 * @param searchTerm - The search term to find
 * @returns The sentence containing the search term, or first sentence if not found
 */
export function extractSentenceWithMatch(content: any[], searchTerm: string): string {
  if (!Array.isArray(content) || !searchTerm) return '';
  
  const fullText = extractTextFromPortableText(content);
  if (!fullText) return '';
  
  const lowerSearchTerm = searchTerm.toLowerCase().trim();
  const lowerText = fullText.toLowerCase();
  
  // Find the position of the search term in the text
  const matchIndex = lowerText.indexOf(lowerSearchTerm);
  if (matchIndex === -1) {
    // If not found, return first sentence
    return extractFirstSentence(content);
  }
  
  // Find the start of the sentence containing the match
  let sentenceStart = 0;
  for (let i = matchIndex; i >= 0; i--) {
    if (fullText[i] === '.' || fullText[i] === '!' || fullText[i] === '?') {
      sentenceStart = i + 1;
      break;
    }
  }
  
  // Find the end of the sentence containing the match
  let sentenceEnd = fullText.length;
  for (let i = matchIndex; i < fullText.length; i++) {
    if (fullText[i] === '.' || fullText[i] === '!' || fullText[i] === '?') {
      sentenceEnd = i + 1;
      break;
    }
  }
  
  return fullText.substring(sentenceStart, sentenceEnd).trim();
}


/**
 * Filter posts by search query across title, excerpt, and content
 * @param posts - Array of posts to filter
 * @param query - Search query string
 * @returns Filtered array of posts matching the search query
 */
export function filterPostsBySearchQuery(posts: any[], query: string): any[] {
  if (!query || query.trim() === '') {
    return posts;
  }

  const searchTerm = query.toLowerCase().trim();

  return posts.filter(post => {
    // Search in title
    const title = (post.title || '').toLowerCase();
    if (title.includes(searchTerm)) {
      return true;
    }

    // Search in excerpt/subheader
    const excerpt = (post.excerpt || post.subheader || '').toLowerCase();
    if (excerpt.includes(searchTerm)) {
      return true;
    }

    // Search in content
    if (post.content) {
      const contentText = extractTextFromPortableText(post.content).toLowerCase();
      if (contentText.includes(searchTerm)) {
        return true;
      }
    }

    return false;
  });
}