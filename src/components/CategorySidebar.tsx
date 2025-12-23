import { useEffect, useRef, useState } from 'react';
import { XIcon, MoonIcon, SunIcon, Archive as ArchiveIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

interface Post {
  id: string;
  title: string;
  slug?: string | { current: string };
  [key: string]: any;
}

interface LinkCard {
  _id: string;
  title: string;
  hook: any[] | string;
  image: string;
  url: string;
}

interface CategorySidebarProps {
  categories: Array<{ name: string; color: string }>;
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  onAboutClick: () => void;
  isLinkMode?: boolean;
  onToggleLinkMode?: () => void;
  isMobile?: boolean;
  onClose?: () => void;
  posts?: Post[];
  onPostClick?: (post: Post) => void;
  onLogoClick?: () => void;
  linkCards?: LinkCard[];
}

export function CategorySidebar({
  categories,
  selectedCategory,
  onCategorySelect,
  onAboutClick,
  isLinkMode = false,
  onToggleLinkMode,
  isMobile = false,
  onClose,
  posts = [],
  onPostClick,
  onLogoClick,
  linkCards = []
}: CategorySidebarProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isAboutPage = !isLinkMode && (location.pathname === '/about' || location.pathname === '/about/');
  const isArchivePage = !isLinkMode && location.pathname === '/archive';
  const isBlogrollPage = location.pathname === '/blogroll' || location.pathname === '/blogroll/';
  const [logoError, setLogoError] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateBottomFade = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Show fade only when there is more content below the current scroll position
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const canScroll = el.scrollHeight > el.clientHeight + 4;
    setShowBottomFade(canScroll && !atBottom);
  };

  useEffect(() => {
    // Only needed on mobile where the sidebar is a scrollable sheet
    if (!isMobile) return;
    // Defer until layout is stable
    const t = window.setTimeout(updateBottomFade, 0);
    window.addEventListener('resize', updateBottomFade);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', updateBottomFade);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, posts.length, linkCards.length, isLinkMode]);

  const handleAboutClick = () => {
    onAboutClick();
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleLogoClick = () => {
    // Switch back to posts view if in link mode
    if (isLinkMode && onToggleLinkMode) {
      onToggleLinkMode();
    }
    
    const isHomePage = location.pathname === '/' || location.pathname === '/super_productive/' || location.pathname === '/super_productive';
    
    if (isHomePage) {
      // Scroll to top if already on homepage
      if (onLogoClick) {
        onLogoClick();
      } else {
        // Fallback: scroll window and try to find scrollable container
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
        const scrollContainer = document.querySelector('div[class*="overflow-y-auto"]');
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } else {
      // Navigate to homepage
      navigate('/');
    }
    
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleLogoError = () => {
    console.error('Failed to load logo image in sidebar');
    setLogoError(true);
  };

  return (
    <aside className={`${isMobile ? 'w-full h-full' : 'w-64 h-full'} bg-white dark:bg-gray-800 ${!isMobile ? 'border-r border-gray-200 dark:border-gray-700' : ''} flex flex-col overflow-hidden`}>
      {isMobile && (
        <div className="flex justify-between items-center p-6 pb-4 flex-shrink-0">
          <div></div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close menu"
          >
            <XIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 relative flex flex-col min-h-0">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0"
          onScroll={isMobile ? updateBottomFade : undefined}
        >
          <div className={`p-6 ${isMobile ? 'pb-10' : ''}`}>
          {!isMobile && (
            <>
              {!logoError ? (
                <div className="mb-8">
                  <button
                    onClick={handleLogoClick}
                    className="cursor-pointer hover:opacity-80 transition-opacity block"
                    aria-label="Go to homepage"
                    style={{ background: 'transparent', border: 'none', padding: 0 }}
                  >
                    <img 
                      src={`/${isDarkMode ? 'dark-mode-logo.png' : 'logo.png'}`}
                      alt="Brendan's Blog Logo" 
                      className="block h-auto object-contain"
                      style={{ display: 'block', maxWidth: '205px', width: 'auto', height: 'auto', transform: 'scale(0.98) translateX(-12px)' }}
                      onLoad={() => console.log('Logo loaded successfully:', isDarkMode ? 'dark-mode-logo.png' : 'logo.png')}
                      onError={(e) => {
                        console.error('Failed to load logo:', e.currentTarget.src);
                        handleLogoError();
                      }}
                    />
                  </button>
                </div>
              ) : (
                <div className="mb-8">
                  <button
                    onClick={handleLogoClick}
                    className="cursor-pointer hover:opacity-80 transition-opacity text-left"
                    aria-label="Go to homepage"
                  >
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Brendan's Blog</h1>
                  </button>
                </div>
              )}
            </>
          )}
          
          {/* Best of the blog section */}
          {posts.length > 0 && onPostClick && (() => {
            // Define the posts to show
            const favoritePostTitles = [
              'Language is leverage',
              'Mindful messaging',
              'Ships in the night',
              'Technical sophistication'
            ];
            
            // Filter posts by title and exclude the ones to remove
            const excludedTitles = ['Time and death', 'Service fatigue'];
            const favoritePosts = favoritePostTitles
              .map(title => posts.find(post => post.title === title))
              .filter(post => post !== undefined && !excludedTitles.includes(post.title))
              // Sort by publication date, newest first
              .sort((a, b) => {
                const dateA = new Date(a.publishedAt || a.created_at || 0).getTime();
                const dateB = new Date(b.publishedAt || b.created_at || 0).getTime();
                return dateB - dateA; // Descending order (newest first)
              });
            
            return favoritePosts.length > 0 ? (
              <div className="mb-8" style={{ paddingTop: '10px' }}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Best of the blog</h2>
                <div className="space-y-3">
                  {favoritePosts.map((post) => {
                    return (
                      <button
                        key={post.id}
                        onClick={() => {
                          // Switch back to posts view if in link mode
                          if (isLinkMode && onToggleLinkMode) {
                            onToggleLinkMode();
                          }
                          onPostClick(post);
                          if (isMobile && onClose) {
                            onClose();
                          }
                        }}
                        className="w-full text-left text-base text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        {post.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}
          
          {/* Work with Brendan section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Work with Brendan</h2>
            <div className="space-y-3">
              <a
                href="https://brendan-bockes.webflow.io/" target="_blank" rel="noopener noreferrer"
                className="block text-base text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Web Strategy & Design
              </a>
              <a
                href="https://www.linkedin.com/in/brendanbockes"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-base text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Linkedin
              </a>
            </div>
          </div>
          
          {/* Extras section */}
          <div className="mb-8" style={{ paddingTop: '10px' }}>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Extras</h2>
            <div className="space-y-3">
              {onToggleLinkMode && (
                <button
                  onClick={() => {
                    if (onToggleLinkMode) {
                      onToggleLinkMode();
                    }
                    if (isMobile && onClose) {
                      onClose();
                    }
                  }}
                  className={`block w-full text-left text-base transition-colors ${
                    isBlogrollPage
                      ? 'text-gray-900 dark:text-white font-semibold'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Blogroll
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
        {/* Fade pinned to bottom of the scroll viewport (mobile only), hidden when user is at the bottom */}
        {isMobile && showBottomFade && (
          <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none bg-gradient-to-b from-transparent via-white/40 to-white dark:via-gray-800/40 dark:to-gray-800" />
        )}
      </div>
      
      <div className="p-6 pt-0 flex-shrink-0">
        {isMobile && (
          <button
            onClick={toggleDarkMode}
            className="w-full mb-4 px-6 py-4 bg-transparent border-2 border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 flex items-center justify-center"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <SunIcon className="w-8 h-8 text-gray-600 dark:text-gray-300" />
            ) : (
              <MoonIcon className="w-8 h-8 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        )}
        <button 
          onClick={handleAboutClick}
          className={`w-full mb-3 px-6 py-2 bg-transparent border-2 rounded-lg font-medium transition-all duration-200 ${
            isAboutPage 
              ? 'bg-blue-50/30 border-blue-400 dark:bg-blue-900/20 dark:border-blue-500 text-gray-900 dark:text-white' 
              : 'border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-blue-50/30 hover:border-blue-400 dark:hover:bg-blue-900/20 dark:hover:border-blue-500'
          }`}
        >
          About
        </button>
        <button 
          onClick={() => {
            // Switch back to posts view if in link mode
            if (isLinkMode && onToggleLinkMode) {
              onToggleLinkMode();
            }
            navigate('/archive');
            if (isMobile && onClose) {
              onClose();
            }
          }}
          className={`w-full mb-3 px-6 py-2 bg-transparent border-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
            isArchivePage 
              ? 'bg-blue-50/30 border-blue-400 dark:bg-blue-900/20 dark:border-blue-500 text-gray-900 dark:text-white' 
              : 'border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-blue-50/30 hover:border-blue-400 dark:hover:bg-blue-900/20 dark:hover:border-blue-500'
          }`}
        >
          <ArchiveIcon className="w-4 h-4" />
          Archive
        </button>
      </div>
    </aside>
  );
}