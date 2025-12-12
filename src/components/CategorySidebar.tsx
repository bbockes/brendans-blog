import { useState } from 'react';
import { XIcon, ArrowLeftRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

interface Post {
  id: string;
  title: string;
  slug?: string | { current: string };
  [key: string]: any;
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
  onLogoClick
}: CategorySidebarProps) {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);

  const handleAboutClick = () => {
    onAboutClick();
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleLogoClick = () => {
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

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
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
                      alt="Super Productive Logo" 
                      className="block h-auto object-contain"
                      style={{ display: 'block', maxWidth: '200px', width: 'auto', height: 'auto', transform: 'scale(0.95) translateX(-12px)' }}
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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Super Productive</h1>
                  </button>
                </div>
              )}
            </>
          )}
          
          {/* Best of the blog section */}
          {!isLinkMode && posts.length > 0 && onPostClick && (
            <div className="mb-8" style={{ paddingTop: '10px' }}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Best of the blog</h2>
              <div className="space-y-3">
                {posts.slice(0, 3).map((post) => {
                  return (
                    <button
                      key={post.id}
                      onClick={() => {
                        onPostClick(post);
                        if (isMobile && onClose) {
                          onClose();
                        }
                      }}
                      className="w-full text-left text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {post.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Work with Brendan section */}
          {!isLinkMode && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Work with Brendan</h2>
              <div className="space-y-3">
                <a
                  href="https://brendan-bockes.webflow.io/" target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Web Strategy & Design
                </a>
                <a
                  href="https://www.clippings.me/users/brendanbockes" target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Copywriting
                </a>
                <a
                  href="https://www.linkedin.com/in/brendanbockes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Linkedin
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6 pt-0 flex-shrink-0">
        <button 
          onClick={handleAboutClick}
          className="w-full mb-3 px-6 py-2 bg-transparent border-2 border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-[#6184ED]/20 hover:border-[#6184ED] dark:hover:bg-[#809FFF]/30 dark:hover:border-[#809FFF] transition-all duration-200"
        >
          About
        </button>
        {onToggleLinkMode && (
          <button 
            onClick={onToggleLinkMode}
            className="w-full px-6 py-2 bg-transparent border-2 border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-blue-50/30 hover:border-blue-400 dark:hover:bg-blue-900/20 dark:hover:border-blue-500 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLinkMode ? 'Posts' : 'Blogroll'}
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}