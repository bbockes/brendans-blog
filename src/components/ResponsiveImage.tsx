import React from 'react';
import { getImagePropsWithFallback } from '../utils/imageUtils';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  isModal?: boolean;
  priority?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * ResponsiveImage component that automatically generates responsive image props
 * using Sanity's image transformation API
 */
export function ResponsiveImage({ 
  src, 
  alt, 
  className = '', 
  isModal = false,
  priority = false,
  style,
  onClick
}: ResponsiveImageProps) {
  const imageProps = getImagePropsWithFallback(src, alt, isModal, priority);

  return (
    <img
      {...imageProps}
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}