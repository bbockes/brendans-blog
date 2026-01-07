import React from 'react';
import { ClockIcon } from 'lucide-react';
import { getCategoryColor } from '../utils/categoryColorUtils';
import { ResponsiveImage } from './ResponsiveImage';

export function BlogCard({
  post,
  onClick
}) {
  // Format read time - just return as string, allowing custom units
  const formatReadTime = (readTime) => {
    // Convert to string and return as-is
    return String(readTime || '5 min');
  };

  const handleClick = (event) => {
    console.log('🖱️ BlogCard clicked:', post.title);
    if (onClick) {
      onClick();
    }
  };

  return <div onClick={handleClick} className="bg-gray-900 dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer hover:transform hover:scale-105 transition-all duration-200">
      <div className="aspect-video bg-gray-800 dark:bg-gray-700 relative">
        <ResponsiveImage
          src={post.image} 
          alt={post.title} 
          className="w-full h-full object-cover" 
        />
        {/* Subtle dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <div className="flex items-center gap-1 text-white text-sm">
            <ClockIcon className="w-4 h-4" />
            {formatReadTime(post.read_time || post.readTime)}
          </div>
          {post.category && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getCategoryColor(post.category)}`}>
              {post.category}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-white font-semibold text-lg leading-tight">
          {post.title}
        </h3>
        <p className="text-gray-400 dark:text-gray-300 text-sm mt-2 line-clamp-2">
          {post.subheader || post.excerpt}
        </p>
      </div>
    </div>;
}