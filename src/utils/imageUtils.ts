/**
 * Utility functions for responsive image handling with Sanity
 */

interface ImageSizes {
  mobile: number;
  tablet: number;
  desktop: number;
  large: number;
}

interface ResponsiveImageOptions {
  baseUrl: string;
  alt: string;
  sizes?: string;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png';
  aspectRatio?: string;
}

// Define standard image sizes for different breakpoints
const BLOG_CARD_SIZES: ImageSizes = {
  mobile: 400,   // Small screens
  tablet: 600,   // Medium screens  
  desktop: 800,  // Large screens
  large: 1200    // Extra large screens
};

const MODAL_IMAGE_SIZES: ImageSizes = {
  mobile: 500,   // Small screens
  tablet: 800,   // Medium screens
  desktop: 1200, // Large screens
  large: 1600    // Extra large screens
};

/**
 * Generate Sanity image URL with transformations
 */
export function generateSanityImageUrl(
  baseUrl: string, 
  width: number, 
  options: {
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
    fit?: 'crop' | 'fill' | 'fillmax' | 'max' | 'scale' | 'clip' | 'min';
  } = {}
): string {
  if (!baseUrl || !baseUrl.includes('sanity')) {
    return baseUrl; // Return original URL if not a Sanity image
  }

  const params = new URLSearchParams();
  params.set('w', width.toString());
  
  if (options.height) {
    params.set('h', options.height.toString());
  }
  
  if (options.quality) {
    params.set('q', options.quality.toString());
  }
  
  if (options.format) {
    params.set('format', options.format);
  }
  
  if (options.fit) {
    params.set('fit', options.fit);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate srcSet string for responsive images
 */
export function generateSrcSet(baseUrl: string, sizes: ImageSizes, format: 'webp' | 'jpg' = 'webp'): string {
  if (!baseUrl || !baseUrl.includes('sanity')) {
    return baseUrl; // Return original URL if not a Sanity image
  }

  const srcSetEntries = [
    `${generateSanityImageUrl(baseUrl, sizes.mobile, { format, quality: 85 })} ${sizes.mobile}w`,
    `${generateSanityImageUrl(baseUrl, sizes.tablet, { format, quality: 85 })} ${sizes.tablet}w`,
    `${generateSanityImageUrl(baseUrl, sizes.desktop, { format, quality: 85 })} ${sizes.desktop}w`,
    `${generateSanityImageUrl(baseUrl, sizes.large, { format, quality: 85 })} ${sizes.large}w`
  ];

  return srcSetEntries.join(', ');
}

/**
 * Generate responsive image props for blog cards
 */
export function getBlogCardImageProps(imageUrl: string, alt: string) {
  if (!imageUrl || !imageUrl.includes('sanity')) {
    return {
      src: imageUrl,
      alt,
      loading: 'lazy' as const
    };
  }

  return {
    src: generateSanityImageUrl(imageUrl, BLOG_CARD_SIZES.desktop, { format: 'webp', quality: 85 }),
    srcSet: generateSrcSet(imageUrl, BLOG_CARD_SIZES, 'webp'),
    sizes: '(max-width: 640px) 400px, (max-width: 1024px) 600px, (max-width: 1280px) 800px, 1200px',
    alt,
    loading: 'lazy' as const
  };
}

/**
 * Generate responsive image props for modal content images
 */
export function getModalImageProps(imageUrl: string, alt: string) {
  if (!imageUrl || !imageUrl.includes('sanity')) {
    return {
      src: imageUrl,
      alt,
      loading: 'lazy' as const
    };
  }

  return {
    src: generateSanityImageUrl(imageUrl, MODAL_IMAGE_SIZES.desktop, { format: 'webp', quality: 90 }),
    srcSet: generateSrcSet(imageUrl, MODAL_IMAGE_SIZES, 'webp'),
    sizes: '(max-width: 640px) 500px, (max-width: 1024px) 800px, (max-width: 1280px) 1200px, 1600px',
    alt,
    loading: 'lazy' as const
  };
}

/**
 * Check if browser supports WebP format
 */
export function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
}

/**
 * Generate fallback image props with JPEG format for older browsers
 */
export function getImagePropsWithFallback(
  imageUrl: string, 
  alt: string, 
  isModal: boolean = false,
  priority: boolean = false
) {
  const sizes = isModal ? MODAL_IMAGE_SIZES : BLOG_CARD_SIZES;
  const sizesAttr = isModal 
    ? '(max-width: 640px) 500px, (max-width: 1024px) 800px, (max-width: 1280px) 1200px, 1600px'
    : '(max-width: 640px) 400px, (max-width: 1024px) 600px, (max-width: 1280px) 800px, 1200px';

  if (!imageUrl || !imageUrl.includes('sanity')) {
    return {
      src: imageUrl,
      alt,
      loading: (priority ? 'eager' : 'lazy') as 'eager' | 'lazy',
      ...(priority && { fetchpriority: 'high' as const })
    };
  }

  return {
    src: generateSanityImageUrl(imageUrl, sizes.desktop, { format: 'webp', quality: 85 }),
    srcSet: generateSrcSet(imageUrl, sizes, 'webp'),
    sizes: sizesAttr,
    alt,
    loading: (priority ? 'eager' : 'lazy') as 'eager' | 'lazy',
    ...(priority && { fetchpriority: 'high' as const }),
    // Fallback for browsers that don't support WebP
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.src.includes('format=webp')) {
        // Switch to JPEG if WebP fails
        img.src = generateSanityImageUrl(imageUrl, sizes.desktop, { format: 'jpg', quality: 85 });
        img.srcSet = generateSrcSet(imageUrl, sizes, 'jpg');
      }
    }
  };
}