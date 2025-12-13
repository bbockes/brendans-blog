import React from 'react';
import { PortableText } from '@portabletext/react';
import { ExternalLinkIcon } from 'lucide-react';
import { ResponsiveImage } from './ResponsiveImage';

interface LinkCardProps {
  linkCard: {
    _id: string;
    hook: any[] | string;
    image: string;
    url: string;
  };
}

export function LinkCard({ linkCard }: LinkCardProps) {
  const handleClick = () => {
    window.open(linkCard.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div 
      onClick={handleClick}
      className="bg-gray-900 dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer hover:transform hover:scale-105 transition-all duration-200 group relative border border-gray-200 dark:border-gray-800"
    >
      <div className="aspect-video bg-gray-800 dark:bg-gray-700 relative">
        <ResponsiveImage
          src={linkCard.image}
          alt={typeof linkCard.hook === 'string' ? linkCard.hook : linkCard.title}
          className="w-full h-full object-cover group-hover:blur-sm transition-all duration-300" 
        />
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-85 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-4">
            <div className="text-white text-center leading-relaxed" style={{ fontSize: '20px' }}>
              {Array.isArray(linkCard.hook) && linkCard.hook.length > 0 ? (
                <PortableText
                  value={linkCard.hook}
                  components={{
                    block: {
                      normal: ({ children }) => <p className="text-white text-center leading-relaxed mb-0">{children}</p>,
                    },
                    marks: {
                      strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                      em: ({ children }) => <em className="italic text-white">{children}</em>,
                    },
                  }}
                />
              ) : typeof linkCard.hook === 'string' ? (
                <span>{linkCard.hook}</span>
              ) : null}
            </div>
          </div>
        </div>
        
        {/* Link icon in lower right */}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ExternalLinkIcon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}