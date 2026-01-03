import React from 'react';
import { MenuIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface MobileHeaderProps {
  onMenuToggle: () => void;
  onLogoClick?: () => void;
}

export function MobileHeader({ onMenuToggle, onLogoClick }: MobileHeaderProps) {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

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
  };

  const handleHeaderClick = () => {
    // Scroll to top when clicking on header background
    if (onLogoClick) {
      onLogoClick();
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
      const scrollContainer = document.querySelector('div[class*="overflow-y-auto"]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <header 
      className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5 cursor-pointer"
      onClick={handleHeaderClick}
    >
      <div className="flex justify-between items-center">
        <div onClick={(e) => { e.stopPropagation(); handleLogoClick(); }} className="cursor-pointer">
          <img 
            src={`/images/${isDarkMode ? 'dark-mode-logo.png' : 'logo.png'}`}
            alt="Brendan's Blog Logo" 
            className="block h-auto object-contain"
            style={{ maxWidth: '170px', width: 'auto', height: 'auto', display: 'block', transform: 'scale(0.98)' }}
            onError={(e) => {
              console.error('Failed to load logo image:', e.currentTarget.src);
              // Fallback to text if image fails
              const fallback = document.createElement('div');
              fallback.innerHTML = '<h1 class="text-lg font-bold text-gray-900 dark:text-white">Brendan\'s Blog</h1>';
              e.currentTarget.parentNode?.replaceChild(fallback, e.currentTarget);
            }}
          />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Open menu"
        >
          <MenuIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </button>
      </div>
    </header>
  );
}