import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { BlogCard } from './BlogCard';
import { BlogPost } from './BlogPost';
import { LinkCard } from './LinkCard';
import { CategorySidebar } from './CategorySidebar';
import { MobileHeader } from './MobileHeader';
import { DarkModeToggle } from './DarkModeToggle';
import { NewsletterForm } from './NewsletterForm';
import { SearchSubscribeToggle } from './SearchSubscribeToggle';
import { fetchAboutPage, transformAboutPageToBlogPost } from '../lib/aboutPageService';
import { LinkedinIcon } from 'lucide-react';
import { sanityClient, POSTS_QUERY, CATEGORIES_QUERY, LINK_CARDS_QUERY } from '../lib/sanityClient';
import { slugify, findPostBySlug, filterPostsBySearchQuery, extractFirstSentence, extractSentenceWithMatch } from '../utils/slugify';
import { generateMetaDescription, generatePageTitle, DEFAULT_OG_IMAGE } from '../utils/seoUtils.js';
import { getCategoryColor } from '../utils/categoryColorUtils';
import { getCategoryDisplayName, getSchemaCategory } from '../utils/categoryMappingUtils';
import { 
  generateOrganizationSchema, 
  generateWebSiteSchema, 
  generateBlogSchema,
  insertMultipleStructuredData 
} from '../utils/schemaUtils';

// Add type definitions for posts and categories
interface Post {
  id: string;
  title: string;
  image?: string;
  read_time?: number | string;
  readTime?: number | string;
  created_at?: string;
  publishedAt?: string;
  slug: string;
  category?: string;
  subheader?: string;
  excerpt?: string;
  [key: string]: any;
}

interface LinkCard {
  _id: string;
  title: string;
  hook: any[] | string;
  image: string;
  url: string;
}

interface Category {
  name: string;
  color: string;
}

// Helper function to set or update a meta tag
function setMetaTag(property: string, content: string, isName = false) {
  const attributeName = isName ? 'name' : 'property';
  let element = document.querySelector(`meta[${attributeName}="${property}"]`) as HTMLMetaElement;
  
  if (element) {
    element.content = content;
  } else {
    element = document.createElement('meta');
    element.setAttribute(attributeName, property);
    element.content = content;
    document.head.appendChild(element);
  }
}

// Helper function to remove a meta tag
function removeMetaTag(property: string, isName = false) {
  const attributeName = isName ? 'name' : 'property';
  const element = document.querySelector(`meta[${attributeName}="${property}"]`);
  if (element) {
    element.remove();
  }
}

// Helper function to set canonical URL
function setCanonicalUrl(url: string) {
  let canonicalElement = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  
  if (canonicalElement) {
    canonicalElement.href = url;
  } else {
    canonicalElement = document.createElement('link');
    canonicalElement.rel = 'canonical';
    canonicalElement.href = url;
    document.head.appendChild(canonicalElement);
  }
}

// Helper function to get the current full URL
function getCurrentUrl(): string {
  return window.location.href;
}

// Helper function to get canonical URL without trailing slash
function getCanonicalUrl(): string {
  const baseUrl = window.location.origin;
  const pathname = window.location.pathname;
  
  // Remove trailing slash except for root
  const cleanPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  return `${baseUrl}${cleanPath}`;
}

export function BlogLayout() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const location = useLocation();
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [linkCards, setLinkCards] = useState<LinkCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [linkLoading, setLinkLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isLinkMode, setIsLinkMode] = useState<boolean>(false);
  const [aboutPageData, setAboutPageData] = useState<Post | null>(null);
  const [aboutPageLoading, setAboutPageLoading] = useState<boolean>(false);
  const [visiblePostsCount, setVisiblePostsCount] = useState<number>(5); // Start with 5 posts
  const postsPerLoad = 5; // Load 5 more posts at a time
  const observerTarget = useRef<HTMLDivElement>(null);
  const filteredPostsRef = useRef<any[]>([]);
  const scrollableContainerRef = useRef<HTMLDivElement>(null);

  // Function to get category color based on name
  const getCategoryColor = (categoryName) => {
    const colorMap = {
      'All': 'bg-gray-800',
      'Writing': 'bg-blue-500',
      'Learning': 'bg-red-500',
      'Planning': 'bg-green-500',
      'Building': 'bg-pink-500',
      'Creativity': 'bg-yellow-500',
      'Growth': 'bg-purple-500',
      'Focus': 'bg-orange-500',
      'Communication': 'bg-indigo-500',
      'Thinking': 'bg-teal-500',
      'Shortcuts': 'bg-emerald-500'
    };
    return colorMap[categoryName] || 'bg-gray-500';
  };

  // Fetch blog posts and categories from Supabase
  useEffect(() => {
    async function fetchData() {
      console.log('🔧 Sanity Config:', {
        projectId: import.meta.env.VITE_SANITY_PROJECT_ID,
        dataset: import.meta.env.VITE_SANITY_DATASET,
        apiVersion: import.meta.env.VITE_SANITY_API_VERSION
      });
      
      setLoading(true);
      
      try {
        // Fetch posts from Sanity
        const postsData = await sanityClient.fetch(POSTS_QUERY);
        
        // Transform Sanity data to match expected format
        const transformedPosts = postsData.map(post => ({
          ...post,
          id: post._id,
          read_time: post.readTime,
          created_at: post.publishedAt,
          slug: post.slug?.current || slugify(post.title)
        }));

        setPosts(transformedPosts);

        // Fetch categories from Sanity
        const categoriesData = await sanityClient.fetch(CATEGORIES_QUERY);
        
        // Extract unique categories and format them with colors
        const uniqueCategories = [...new Set(categoriesData.map(item => item.category).filter(Boolean))];
        const formattedCategories = [
          { name: 'All', color: getCategoryColor('All') },
          ...uniqueCategories.map(categoryName => ({
            name: categoryName,
            color: getCategoryColor(categoryName)
          }))
        ];

        setCategories(formattedCategories);
      } catch (err: any) {
        console.error('❌ Error fetching blog data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fetch link cards and categories from Sanity
  useEffect(() => {
    async function fetchLinkData() {
      console.log('🔗 Fetching link cards...');
      setLinkLoading(true);
      
      try {
        // Fetch link cards from Sanity
        const linkCardsData = await sanityClient.fetch(LINK_CARDS_QUERY);
        setLinkCards(linkCardsData);
      } catch (err: any) {
        console.error('❌ Error fetching link data:', err);
        setLinkError(err.message);
      } finally {
        setLinkLoading(false);
      }
    }

    fetchLinkData();
  }, []);

  // Handle URL-based post selection
  useEffect(() => {
    // Check if we're on the 404 page first
    if (location.pathname === '/404') {
      console.log('✅ On 404 page, setting selectedPost to notFoundPost');
      setSelectedPost({
        id: '404',
        title: 'Uh-oh. Looks like that page doesn\'t exist.',
        excerpt: '',
        category: 'Errors',
        readTime: '404 sec',
        image: 'https://images.unsplash.com/photo-1594736797933-d0d92e2d0b3d?w=400&h=250&fit=crop',
        content: [
          {
            _type: 'block',
            style: 'normal',
            children: [
              {
                _type: 'span',
                marks: [],
                text: 'It either wandered off or never existed in the first place.'
              }
            ]
          },
          {
            _type: 'block',
            style: 'normal',
            markDefs: [
              {
                _key: 'homepage-link',
                _type: 'link',
                href: '/'
              }
            ],
            children: [
              {
                _type: 'span',
                marks: [],
                text: 'You can head back to the '
              },
              {
                _type: 'span',
                marks: ['homepage-link'],
                text: 'homepage'
              },
              {
                _type: 'span',
                marks: [],
                text: ' — or, if you\'re up for it, just start clicking buttons.'
              }
            ]
          },
          {
            _type: 'block',
            style: 'normal',
            children: [
              {
                _type: 'span',
                marks: [],
                text: '(No promises it\'ll be productive, but it might be fun.)'
              }
            ]
          }
        ]
      });
      return;
    }
    
    console.log('🔍 Current pathname:', location.pathname);
    console.log('🔍 URL slug from params:', slug);
    console.log('📝 Posts available:', posts.length);
    
    // Check if we're on the about page
    if (location.pathname === '/about' || location.pathname === '/about/') {
      console.log('✅ On about page, loading aboutPage data');
      if (!aboutPageData && !aboutPageLoading) {
        setAboutPageLoading(true);
        fetchAboutPage().then(data => {
          if (data) {
            const transformedData = transformAboutPageToBlogPost(data);
            setAboutPageData(transformedData);
            setSelectedPost(transformedData);
            console.log('📄 aboutPage loaded:', transformedData);
          } else {
            console.error('❌ Failed to load about page data');
          }
          setAboutPageLoading(false);
        }).catch(error => {
          console.error('❌ Error loading about page:', error);
          setAboutPageLoading(false);
        });
      } else if (aboutPageData) {
        setSelectedPost(aboutPageData);
        console.log('📄 Using cached aboutPage data:', aboutPageData);
      }
    } else if (slug && posts.length > 0) {
      console.log('🔎 Looking for post with slug:', slug);
      const post = findPostBySlug(posts, slug);
      if (post) {
        console.log('✅ Found post, setting selectedPost:', post.title);
        // Reset visible posts count when navigating to a post
        setVisiblePostsCount(5);
        setSelectedPost(post);
      } else {
        console.log('❌ Post not found, redirecting to home');
        // Post not found, redirect to home
        navigate('/', { replace: true });
        setSelectedPost(null);
        setVisiblePostsCount(5);
      }
    } else if (location.pathname === '/' || location.pathname === '/super_productive/' || location.pathname === '/super_productive') {
      console.log('🏠 On home page, clearing selectedPost');
      setSelectedPost(null);
      // Reset visible posts count when navigating to homepage
      setVisiblePostsCount(5);
    }
  }, [slug, posts, navigate, location.pathname]);

  // Debug selectedPost changes
  useEffect(() => {
    console.log('🎯 selectedPost state changed:', selectedPost ? selectedPost.title : 'null');
    console.log('🎯 selectedPost full object:', selectedPost);
  }, [selectedPost]);

  // Scroll to top when route changes - handle both post pages and homepage
  useLayoutEffect(() => {
    // Always reset visible posts count on route change to prevent infinite scroll issues
    setVisiblePostsCount(5);
    
    // Scroll to top immediately (synchronously before paint)
    // Scroll the scrollable container (the div with overflow-y-auto)
    if (scrollableContainerRef.current) {
      scrollableContainerRef.current.scrollTop = 0;
    }
    // Also scroll window/document as fallback
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  // Aggressive scroll to top when route or selectedPost changes
  useEffect(() => {
    const scrollToTop = () => {
      // Scroll the scrollable container first (primary scroll target)
      if (scrollableContainerRef.current) {
        scrollableContainerRef.current.scrollTop = 0;
      }
      // Also scroll window/document as fallback
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (window.scrollTo) window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    
    // Immediate scroll
    scrollToTop();
    
    // Use requestAnimationFrame for next frame
    requestAnimationFrame(() => {
      scrollToTop();
      // Multiple attempts to catch any late-rendering content
      requestAnimationFrame(() => {
        scrollToTop();
        setTimeout(scrollToTop, 0);
        setTimeout(scrollToTop, 50);
        setTimeout(scrollToTop, 100);
        setTimeout(scrollToTop, 200);
        setTimeout(scrollToTop, 300);
        setTimeout(scrollToTop, 500);
      });
    });
  }, [location.pathname, selectedPost]);

  // Filter posts by category and search query
  const filteredPosts = useMemo(() => {
    if (isLinkMode) {
      // Filter link cards - no category filtering, only search
      let filtered = linkCards;
      
      // Apply search filter if there's a search query
      if (searchQuery.trim()) {
        const searchTerm = searchQuery.toLowerCase().trim();
        filtered = filtered.filter((card: LinkCard) => {
          // Extract text from hook (handles both string and Portable Text array)
          let hookText = '';
          if (typeof card.hook === 'string') {
            hookText = card.hook;
          } else if (Array.isArray(card.hook)) {
            hookText = card.hook
              .filter((block: any) => block._type === 'block')
              .map((block: any) => {
                if (!block.children || !Array.isArray(block.children)) return '';
                return block.children
                  .filter((child: any) => child._type === 'span' && child.text)
                  .map((child: any) => child.text)
                  .join(' ');
              })
              .join(' ');
          }
          return hookText.toLowerCase().includes(searchTerm) || 
                 card.title.toLowerCase().includes(searchTerm);
        });
      }
      
      return filtered;
    }
    
    // Filter blog posts (existing logic)
    let filtered = selectedCategory === 'All' 
      ? posts 
      : posts.filter((post: Post) => post.category === selectedCategory);
    
    // Apply search filter if there's a search query
    if (searchQuery.trim()) {
      filtered = filterPostsBySearchQuery(filtered, searchQuery);
    }
    
    return filtered;
  }, [posts, linkCards, selectedCategory, searchQuery, isLinkMode]);

  // Reset visible posts count when filters change or when navigating to homepage
  useEffect(() => {
    // Reset when navigating back to homepage (selectedPost is cleared) or when filters change
    const isHomePage = location.pathname === '/' || location.pathname === '/super_productive/' || location.pathname === '/super_productive';
    if (isHomePage && !selectedPost) {
      // Only reset when we're actually on homepage showing all posts
      setVisiblePostsCount(postsPerLoad);
    }
  }, [selectedCategory, searchQuery, isLinkMode, location.pathname, postsPerLoad, selectedPost]);

  // Keep ref in sync with filteredPosts for infinite scroll
  useEffect(() => {
    filteredPostsRef.current = filteredPosts as any[];
  }, [filteredPosts]);

  // Visible posts for infinite scroll (only for blog posts, not link mode)
  const visiblePosts = useMemo(() => {
    if (isLinkMode) {
      return [];
    }
    return (filteredPosts as Post[]).slice(0, visiblePostsCount);
  }, [filteredPosts, visiblePostsCount, isLinkMode]);

  // Infinite scroll observer
  useEffect(() => {
    // Don't use infinite scroll for link mode or when showing a single post
    if (isLinkMode) return;
    
    const isHomePage = location.pathname === '/' || location.pathname === '/super_productive/' || location.pathname === '/super_productive';
    const isSinglePostPage = location.pathname.startsWith('/posts/') || location.pathname === '/about' || location.pathname === '/about/';
    
    // Only attach observer on homepage when showing list of posts (not single post)
    if (!isHomePage || selectedPost || isSinglePostPage) {
      console.log('⏸️ Skipping infinite scroll - isHomePage:', isHomePage, 'selectedPost:', !!selectedPost, 'isSinglePostPage:', isSinglePostPage);
      return;
    }
    
    let observer: IntersectionObserver | null = null;
    
    // Wait for DOM to update, then create and attach observer
    const timeoutId = setTimeout(() => {
      const currentTarget = observerTarget.current;
      const scrollContainer = scrollableContainerRef.current;
      
      if (!currentTarget || !scrollContainer) {
        console.log('⚠️ Observer target or scroll container not found');
        return;
      }
      
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Use ref to get latest filteredPosts
              const currentFilteredPosts = filteredPostsRef.current;
              const totalPosts = currentFilteredPosts.length;
              
              setVisiblePostsCount(prev => {
                if (prev < totalPosts) {
                  const newCount = Math.min(prev + postsPerLoad, totalPosts);
                  console.log('🔄 Loading more posts. Previous:', prev, 'New:', newCount, 'Total:', totalPosts);
                  return newCount;
                }
                return prev;
              });
            }
          });
        },
        { 
          threshold: 0.1,
          rootMargin: '200px', // Start loading 200px before the element comes into view
          root: scrollContainer // Use the scrollable container as the root
        }
      );
      
      observer.observe(currentTarget);
      console.log('👁️ Observer attached to trigger element with scroll container as root');
    }, 300); // Increased timeout slightly to ensure DOM is ready

    return () => {
      clearTimeout(timeoutId);
      if (observer) {
        const currentTarget = observerTarget.current;
        if (currentTarget) {
          observer.unobserve(currentTarget);
        }
        observer.disconnect();
      }
    };
  }, [filteredPosts.length, isLinkMode, postsPerLoad, location.pathname, selectedPost]); // Recreate observer when route or selectedPost changes

  const handlePostClick = post => {
    console.log('🖱️ Post clicked:', post.title);
    // Use the same logic as findPostBySlug to ensure consistency
    const postSlug = post.slug?.current || post.slug || slugify(post.title);
    console.log('🔗 Navigating to slug:', postSlug);
    // Reset visible posts count to prevent infinite scroll from interfering
    setVisiblePostsCount(5);
    // Force scroll to top before navigation
    if (scrollableContainerRef.current) {
      scrollableContainerRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    navigate(`/posts/${postSlug}`);
  };

  const handleAboutClick = () => {
    console.log('ℹ️ About button clicked, navigating to /about');
    if (isLinkMode) {
      setIsLinkMode(false);
    }
    // Scroll to top before navigation
    if (scrollableContainerRef.current) {
      scrollableContainerRef.current.scrollTop = 0;
    }
    navigate('/about');
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setIsMobileMenuOpen(false);
    
    // Navigate to home page when "All" is selected
    if (category === 'All') {
      // Scroll to top before navigation
      if (scrollableContainerRef.current) {
        scrollableContainerRef.current.scrollTop = 0;
      }
      navigate('/');
      // Clear search query to show all posts
      setSearchQuery('');
    }
  };

  const handleToggleMode = () => {
    setIsLinkMode(!isLinkMode);
    setSelectedCategory('All'); // Reset category when switching modes
    setSearchQuery(''); // Clear search when switching modes
    // Scroll to top when switching modes
    if (scrollableContainerRef.current) {
      scrollableContainerRef.current.scrollTop = 0;
    }
  };

  const handleLogoClick = () => {
    // Scroll to top of the scrollable container
    if (scrollableContainerRef.current) {
      scrollableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Also scroll window as fallback
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = useCallback((query: string) => {
    console.log('Search called with query:', query);
    setSearchQuery(query);
    // Clear selected post when searching so results show in main content area
    if (query.trim()) {
      setSelectedPost(null);
      // Navigate to home if on a post page
      if (location.pathname.startsWith('/posts/') || location.pathname === '/about' || location.pathname === '/about/') {
        navigate('/', { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="flex h-screen w-full overflow-x-hidden">
      {/* Desktop/Tablet Sidebar - shows on medium screens and up */}
      <div className="hidden md:block flex-shrink-0">
        <CategorySidebar 
          categories={categories} 
          selectedCategory={selectedCategory} 
          onCategorySelect={handleCategorySelect} 
          onAboutClick={handleAboutClick}
          isLinkMode={isLinkMode}
          onToggleLinkMode={handleToggleMode}
          posts={posts}
          onPostClick={handlePostClick}
          onLogoClick={handleLogoClick}
          linkCards={linkCards}
        />
      </div>

      {/* Mobile Menu Overlay - only shows on small screens */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={toggleMobileMenu}>
          <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <CategorySidebar 
              categories={categories} 
              selectedCategory={selectedCategory} 
              onCategorySelect={handleCategorySelect} 
              onAboutClick={handleAboutClick}
              isLinkMode={isLinkMode}
              onToggleLinkMode={handleToggleMode}
              isMobile={true}
              onClose={toggleMobileMenu}
              posts={posts.slice(0, 3)}
              onPostClick={handlePostClick}
              onLogoClick={handleLogoClick}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 w-full">
        {/* Mobile Header - only shows on small screens */}
        <div className="md:hidden flex-shrink-0">
          <MobileHeader onMenuToggle={toggleMobileMenu} />
        </div>

        <div ref={scrollableContainerRef} className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
          <div className="max-w-7xl mx-auto w-full">
            {/* Desktop Header - shows on large screens and up only */}
            <div className="hidden lg:block mb-8 relative">
              {isLinkMode ? (
                <div className="w-full max-w-5xl mx-auto">
                  <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                    <span className="text-[#6184ED] dark:text-[#809FFF]">Blogs you know.</span> <span className="text-gray-800 dark:text-gray-200">Blogs you don't.</span>
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    A few of my favorite blogs—well worth your time and attention.
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-4xl mx-auto" style={{ paddingLeft: '60px' }}>
                  <div className="flex items-center">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm flex items-center overflow-hidden" style={{ width: '600px', maxWidth: '600px', minWidth: '600px', minHeight: '64px' }}>
                      <div className="px-4 py-4 w-full">
                        <SearchSubscribeToggle 
                          className="w-full" 
                          onSearch={handleSearch}
                          placeholder="Never miss a post! Get free email updates"
                        />
                      </div>
                    </div>
                    <div className="hidden md:flex bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm items-center flex-shrink-0 ml-5">
                      <div className="flex items-center gap-3">
                        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                          <LinkedinIcon className="w-5 h-5" />
                        </a>
                        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600"></div>
                        <DarkModeToggle />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tablet Subscribe Section - shows on medium screens only */}
            {!isLinkMode ? (
              <div className="hidden md:block lg:hidden mb-6">
                <div className="flex items-start gap-6" style={{ paddingLeft: '60px', paddingTop: '30px' }}>
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex-1 tablet-subscribe-container">
                    <div className="px-4 py-4">
                      <SearchSubscribeToggle 
                        className="w-full"
                        onSearch={handleSearch}
                        placeholder="Enter your email address"
                      />
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm flex-shrink-0 tablet-social-container">
                    <div className="flex items-center gap-3">
                      <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <LinkedinIcon className="w-5 h-5" />
                      </a>
                      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600"></div>
                      <DarkModeToggle />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:flex lg:hidden justify-between items-center mb-6">
                <div className="flex-1 flex justify-start">
                  <div className="w-full">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white text-left">
                      <span className="text-[#6184ED] dark:text-[#809FFF]">Blogs you know.</span> <span className="text-gray-800 dark:text-gray-200">Blogs you don't.</span>
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1 text-left">
                      A few of my favorite blogs—well worth your time and attention.
                    </p>
                  </div>
                </div>
                {!isLinkMode && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <LinkedinIcon className="w-5 h-5" />
                      </a>
                      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600"></div>
                      <DarkModeToggle />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Subscribe Section - only shows on small screens */}
            {!isLinkMode ? (
              <div className="md:hidden mb-6 mobile-subscribe-container">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-4 py-4">
                    <SearchSubscribeToggle 
                      className="w-full mobile-search-toggle"
                      onSearch={handleSearch}
                      placeholder="Enter your email address"
                    />
                    <NewsletterForm 
                      className="w-full mobile-newsletter-fallback hidden"
                      placeholder="Enter your email address"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:hidden mb-6">
                <div>
                  <h1 className="text-xl font-bold text-gray-800 dark:text-white text-left">
                    <span className="text-[#6184ED] dark:text-[#809FFF]">Blogs you know.</span> <span className="text-gray-800 dark:text-gray-200">Blogs you don't.</span>
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-left">
                    A few of my favorite blogs—well worth your time and attention.
                  </p>
                </div>
              </div>
            )}

            {/* Loading and Error States */}
            {(isLinkMode ? linkLoading : loading) && (
              <div className="flex justify-center items-center py-12">
                <div className="text-gray-600 dark:text-gray-400">
                  Loading {isLinkMode ? 'links' : 'posts'}...
                </div>
              </div>
            )}

            {(isLinkMode ? linkError : error) && (
              <div className="flex justify-center items-center py-12">
                <div className="text-red-500">
                  Error loading {isLinkMode ? 'links' : 'posts'}: {isLinkMode ? linkError : error}
                </div>
              </div>
            )}

            {/* Content - Blog Posts (consecutive) or Link Cards (grid) */}
            {!(isLinkMode ? linkLoading : loading) && !(isLinkMode ? linkError : error) && (
              <>
                {isLinkMode ? (
                  <div className="w-full max-w-5xl mx-auto">
                    <div className={`grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2`} style={{ width: '90%' }}>
                      {filteredPosts.map((linkCard: any) => (
                        <LinkCard key={linkCard._id} linkCard={linkCard} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-4xl mx-auto md:pl-[60px] px-4 md:px-0" style={{ paddingTop: '10px' }}>
                    {/* Show single post if on a post route, otherwise show all visible posts */}
                    {selectedPost && (location.pathname.startsWith('/posts/') || location.pathname === '/about' || location.pathname === '/about/') ? (
                      <div key={selectedPost.id} id={`post-${selectedPost.slug?.current || selectedPost.slug || selectedPost.id}`}>
                        <BlogPost post={selectedPost} />
                      </div>
                    ) : searchQuery.trim() ? (
                      /* Show search results with title and matching sentence */
                      <div className="w-full" style={{ maxWidth: '650px' }}>
                        {visiblePosts.map((post: any) => {
                          const postSlug = post.slug?.current || post.slug || slugify(post.title);
                          const matchingSentence = post.content 
                            ? extractSentenceWithMatch(post.content, searchQuery.trim())
                            : (post.excerpt || post.subheader || '');
                          const searchTerm = searchQuery.trim();
                          
                          // Helper function to highlight search term in text
                          const highlightText = (text: string) => {
                            if (!text || !searchTerm) return text;
                            const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                            const parts = text.split(regex);
                            return parts.map((part, index) => {
                              if (part.toLowerCase() === searchTerm.toLowerCase()) {
                                return (
                                  <mark key={index} className="bg-blue-200 dark:bg-blue-400 px-1 rounded">
                                    {part}
                                  </mark>
                                );
                              }
                              return <React.Fragment key={index}>{part}</React.Fragment>;
                            });
                          };
                          
                          return (
                            <div 
                              key={post.id} 
                              className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                            >
                              <h2 className="text-3xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                                <button
                                  onClick={() => handlePostClick(post)}
                                  className="hover:underline transition-all text-left"
                                >
                                  {highlightText(post.title)}
                                </button>
                              </h2>
                              {matchingSentence && (
                                <p className="text-gray-600 dark:text-gray-400 text-lg">
                                  {highlightText(matchingSentence)}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {/* Infinite scroll trigger */}
                        {(() => {
                          const totalPosts = (filteredPosts as Post[]).length;
                          if (visiblePostsCount >= totalPosts) return null;
                          return (
                            <div 
                              ref={observerTarget} 
                              className="h-20 w-full flex items-center justify-center py-4"
                              style={{ minHeight: '80px' }}
                            >
                              <div className="text-gray-600 dark:text-gray-400 text-sm">Loading more posts...</div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <>
                        {visiblePosts.map((post: any) => (
                          <div key={post.id} id={`post-${post.slug?.current || post.slug || post.id}`}>
                            <BlogPost post={post} />
                          </div>
                        ))}
                        {/* Infinite scroll trigger */}
                        {(() => {
                          const totalPosts = (filteredPosts as Post[]).length;
                          if (visiblePostsCount >= totalPosts) return null;
                          return (
                            <div 
                              ref={observerTarget} 
                              className="h-20 w-full flex items-center justify-center py-4"
                              style={{ minHeight: '80px' }}
                            >
                              <div className="text-gray-600 dark:text-gray-400 text-sm">Loading more posts...</div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* No content message - only show when not displaying a single selected post */}
            {!(isLinkMode ? linkLoading : loading) && !(isLinkMode ? linkError : error) && filteredPosts.length === 0 && !(selectedPost && (location.pathname.startsWith('/posts/') || location.pathname === '/about' || location.pathname === '/about/')) && (
              <div className="flex justify-center items-center py-12">
                <div className="text-gray-600 dark:text-gray-400">
                  {isLinkMode ? (
                    searchQuery.trim() ? (
                      `No links found for "${searchQuery}"${selectedCategory !== 'All' ? ` in "${selectedCategory}" category` : ''}.`
                    ) : (
                      selectedCategory === 'All' ? 'No links found.' : `No links found in "${selectedCategory}" category.`
                    )
                  ) : (
                    searchQuery.trim() ? (
                      `No posts found for "${searchQuery}"${selectedCategory !== 'All' ? ` in "${selectedCategory}" category` : ''}.`
                    ) : (
                      selectedCategory === 'All' ? 'No posts found. Make sure to add some blog posts in your Sanity studio!' : `No posts found in "${selectedCategory}" category.`
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}