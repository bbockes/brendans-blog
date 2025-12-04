import React from 'react';
import { MenuIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const { isDarkMode } = useTheme();

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex justify-between items-center">
        <div>
          <img 
            src={`/${isDarkMode ? 'dark-mode-logo.png' : 'logo.png'}`}
            alt="Super Productive Logo" 
            className="block max-w-full h-auto object-contain"
            style={{ width: 'auto', display: 'block', transform: 'scale(0.95)' }}
            onError={(e) => {
              console.error('Failed to load logo image:', e.currentTarget.src);
              // Fallback to text if image fails
              const fallback = document.createElement('div');
              fallback.innerHTML = '<h1 class="text-xl font-bold text-gray-900 dark:text-white">Super Productive</h1>';
              e.currentTarget.parentNode?.replaceChild(fallback, e.currentTarget);
            }}
          />
        </div>
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Open menu"
        >
          <MenuIcon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        </button>
      </div>
    </header>
  );
}