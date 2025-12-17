import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { PortableText } from '@portabletext/react';
import { XIcon, ClockIcon, CopyIcon, CheckIcon, TwitterIcon, LinkedinIcon, FacebookIcon, MailIcon, MessageCircleIcon, ShareIcon } from 'lucide-react';
import { NewsletterForm } from './NewsletterForm';
import { getCategoryColor } from '../utils/categoryColorUtils';
import { ResponsiveImage } from './ResponsiveImage';
import { useTheme } from '../contexts/ThemeContext';
import { 
  generateBlogPostSchema,
  generateContextualSchema,
  generateAboutPageSchema, 
  generateBreadcrumbSchema,
  insertMultipleStructuredData,
  getCurrentUrl 
} from '../utils/schemaUtils';

// Copy button component for code blocks
function CopyButton({ code, filename }: { code: string; filename?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors group"
      title={`Copy ${filename ? filename : 'code'}`}
    >
      {copied ? (
        <CheckIcon className="w-4 h-4 text-green-400" />
      ) : (
        <CopyIcon className="w-4 h-4" />
      )}
    </button>
  );
}

// Inline code component with copy feedback
function InlineCodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const handleCopy = async () => {
    // Get the actual text content from the rendered code element
    let text = codeRef.current?.textContent || '';
    
    // Remove the surrounding quotes that are added for display purposes
    if (text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    }
    
    // Always append a trailing space to the copied text
    text = text + ' ';
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <span className="inline-code-wrapper relative inline-block group">
      <code 
        ref={codeRef}
        className={`px-2 py-1 rounded transition-all duration-200 cursor-pointer text-17px ${
          copied 
            ? 'bg-green-200 dark:bg-green-400 text-green-900 dark:text-gray-900' 
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
        }`}
        onClick={handleCopy}
        style={{ 
          fontFamily: 'inherit',
          display: 'inline-block'
        }}
      >
        "{children}"
      </code>
      <button
        onClick={handleCopy}
        className={`absolute opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-200 inline-flex items-center ${
          copied
            ? 'bg-green-200 dark:bg-green-400 text-green-700 dark:text-gray-900 opacity-100'
            : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 text-gray-600 dark:text-gray-400'
        }`}
        style={{ left: 'calc(100% + 4px)', top: '50%', transform: 'translateY(-50%)' }}
        title="Copy code"
      >
        {copied ? (
          <CheckIcon className="w-3.5 h-3.5" />
        ) : (
          <CopyIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </span>
  );
}

export function BlogModal({
  post,
  onClose
}) {
  const { isDarkMode } = useTheme();
  
  // Debug: Log psContent for about page
  React.useEffect(() => {
    if (post?.id === 'about') {
      console.log('🔍 About page psContent:', post.psContent);
      console.log('🔍 About page psContent length:', post.psContent?.length);
      console.log('🔍 About page full post:', post);
    }
  }, [post]);

  // Add structured data when modal opens
  React.useEffect(() => {
    const schemas = [];
    
    if (post.id === 'about') {
      // About page schema
      schemas.push(generateAboutPageSchema());
    } else if (post.id !== '404') {
      // Blog post schema
      const postUrl = `${window.location.origin}/posts/${post.slug || post.id}`;
      schemas.push(generateContextualSchema(post, postUrl));
      schemas.push(generateBreadcrumbSchema(post));
    }
    
    if (schemas.length > 0) {
      insertMultipleStructuredData(schemas);
    }

    // Cleanup function to remove structured data when modal closes
    return () => {
      // The structured data will be updated when the modal closes
      // and BlogLayout's useEffect runs again
    };
  }, [post]);

  // Format read time - just return as string, allowing custom units
  const formatReadTime = (readTime) => {
    // Convert to string and return as-is
    return String(readTime || '5 min');
  };

  // Determine the post URL - special handling for about page
  const getPostLink = () => {
    if (post.id === 'about') {
      return '/about';
    }
    const postSlug = post.slug || post.id;
    return `/posts/${postSlug}`;
  };

  // Generate the current post URL for sharing
  const getPostUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}${getPostLink()}`;
  };

  // Get share text for social media
  const getShareText = () => {
    const description = post.subheader || post.excerpt || 'Check out this article';
    return `${post.title} - ${description}`;
  };

  // Social media share URLs
  const shareUrls = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}&url=${encodeURIComponent(getPostUrl())}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getPostUrl())}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getPostUrl())}`,
    email: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(`${getShareText()}\n\n${getPostUrl()}`)}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${getShareText()} ${getPostUrl()}`)}`,
  };

  return (
    <div 
      className="fixed inset-0 bg-white bg-opacity-70 dark:bg-black dark:bg-opacity-70 flex items-center justify-center modal-container z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-none md:rounded-xl max-w-[800px] w-full h-full md:max-h-[calc(100vh-60px)] md:h-auto flex flex-col overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 relative" 
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* X button positioned in top right of modal */}
        <button 
          onClick={onClose} 
          className="absolute top-3 right-4 z-10 bg-white dark:bg-gray-700 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          <XIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </button>
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-16 py-8">
          {/* Header content now inside scrollable area */}
          <div className="mb-8">
            {post.id !== 'about' && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 text-sm">
                  <ClockIcon className="w-4 h-4" />
                  {formatReadTime(post.read_time || post.readTime)}
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium text-white ${getCategoryColor(post.category)}`}>
                  {post.category}
                </span>
              </div>
            )}
            <h1 className="text-3xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2 pt-[5px]">
              <Link 
                to={getPostLink()}
                onClick={onClose}
                className="hover:underline transition-all"
              >
                {post.title}
              </Link>
            </h1>
            {(post.subheader || post.excerpt) && post.id !== 'about' && (
              <p className="text-gray-600 dark:text-gray-400 text-lg">{post.subheader || post.excerpt}</p>
            )}
          </div>
          
          {/* Separator line */}
          <div className="border-t border-gray-200 dark:border-gray-700 mb-8"></div>
          
          {post.id === 'about' && post.headshot ? (
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-8 items-start">
              <div className="flex-shrink-0 md:mt-2" style={{ flexBasis: 'auto' }}>
                <img 
                  src={post.headshot}
                  alt={post.headshotAlt || 'Headshot'}
                  className="rounded-lg w-auto h-auto"
                  style={{ 
                    maxWidth: '272px', 
                    maxHeight: '272px', 
                    width: 'auto', 
                    height: 'auto',
                    transform: 'rotate(-0.5deg)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                />
              </div>
              <div className="flex-1 prose prose-lg max-w-none dark:prose-invert">
            <div className="markdown-content text-17px">
              <PortableText 
                value={post.content}
                components={{
                  block: {
                    h1: ({children}) => <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 mt-8">{children}</h1>,
                    h2: ({children}) => <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-6">{children}</h2>,
                    h3: ({children}) => <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 mt-5">{children}</h3>,
                    normal: ({children}) => <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4 text-17px">{children}</p>,
                    blockquote: ({children}) => (
                      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 mb-4 text-17px">
                        {children}
                      </blockquote>
                    ),
                  },
                  marks: {
                    strong: ({children}) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
                    em: ({children}) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                    code: ({children}) => <InlineCodeBlock>{children}</InlineCodeBlock>,
                    link: ({children, value}) => (
                      <a 
                        href={value?.href}
                        className="text-[#6184ED] dark:text-[#809FFF] hover:text-[#4a6bd8] dark:hover:text-[#9bb3ff] underline transition-colors cursor-pointer" 
                        {...(value?.href?.startsWith('/') || value?.href?.startsWith('.') || !value?.href?.includes('://') 
                          ? { 
                              onClick: (e) => {
                                e.preventDefault();
                                onClose();
                                // Small delay to ensure modal closes before navigation
                                setTimeout(() => {
                                  window.location.href = value.href;
                                }, 100);
                              }
                            }
                          : { 
                              target: "_blank", 
                              rel: "noopener noreferrer" 
                            }
                        )}
                      >
                        {children}
                      </a>
                    ),
                  },
                  list: {
                    bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                    number: ({children}) => <ol className="list-decimal list-outside mb-4 space-y-2 ml-6">{children}</ol>,
                  },
                  listItem: {
                    bullet: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                    number: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                  },
                  types: {
                    image: ({value}) => (
                      <ResponsiveImage
                        src={value?.asset?.url} 
                        alt={value?.alt || ''} 
                        className="w-full !max-w-none mx-[-10] md:mx-[-22] h-auto rounded-lg shadow-md mb-4 pt-[5px] pb-[10px]"
                        isModal={true}
                      />
                    ),
                    code: ({value}) => (
                      <div className="relative mb-6">
                        {value?.filename && (
                          <div className="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-t-lg border-b border-gray-300 dark:border-gray-500">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {value.filename}
                            </span>
                          </div>
                        )}
                        <div className="relative">
                          <pre className={`bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 ${
                            value?.filename ? 'rounded-b-lg' : 'rounded-lg'
                          } overflow-x-auto text-17px leading-relaxed`} style={{ fontFamily: 'inherit' }}>
                            <code style={{ fontFamily: 'inherit' }}>{value?.code}</code>
                          </pre>
                          <CopyButton 
                            code={value?.code || ''} 
                            filename={value?.filename}
                          />
                        </div>
                      </div>
                    ),
                    codeBlock: ({value}) => (
                      <div className="relative mb-6">
                        {value?.filename && (
                          <div className="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-t-lg border-b border-gray-300 dark:border-gray-500">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {value.filename}
                            </span>
                          </div>
                        )}
                        <div className="relative">
                          <pre className={`bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 ${
                            value?.filename ? 'rounded-b-lg' : 'rounded-lg'
                          } overflow-x-auto text-17px leading-relaxed`} style={{ fontFamily: 'inherit' }}>
                            <code style={{ fontFamily: 'inherit' }}>{value?.code}</code>
                          </pre>
                          <CopyButton 
                            code={value?.code || ''} 
                            filename={value?.filename}
                          />
                        </div>
                      </div>
                    ),
                  },
                }}
              />
              </div>
            </div>
            
            {/* Colophon (P.S. section) for About page with headshot - appears after main content */}
            {post.id === 'about' && post.psContent && (Array.isArray(post.psContent) ? post.psContent.length > 0 : true) && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 mt-8 mb-4"></div>
                <div className="w-full max-w-[530px] prose prose-lg max-w-none dark:prose-invert">
                  <div className="markdown-content text-17px">
                    <PortableText 
                      value={post.psContent}
                      components={{
                        block: {
                          normal: ({children}) => <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4 text-17px">{children}</p>,
                          blockquote: ({children}) => (
                            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 mb-4 text-17px">
                              {children}
                            </blockquote>
                          ),
                        },
                        list: {
                          bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                        },
                        listItem: {
                          bullet: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                        },
                        marks: {
                          strong: ({children}) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
                          em: ({children}) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                        },
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          ) : (
          <div className="prose prose-lg max-w-none dark:prose-invert">
            <div className="markdown-content text-17px">
              <PortableText 
                value={post.content}
                components={{
                  block: {
                    h1: ({children}) => <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 mt-8">{children}</h1>,
                    h2: ({children}) => <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-6">{children}</h2>,
                    h3: ({children}) => <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 mt-5">{children}</h3>,
                    normal: ({children}) => <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4 text-17px">{children}</p>,
                    blockquote: ({children}) => (
                      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 mb-4 text-17px">
                        {children}
                      </blockquote>
                    ),
                  },
                  marks: {
                    strong: ({children}) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
                    em: ({children}) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                    code: ({children}) => <InlineCodeBlock>{children}</InlineCodeBlock>,
                    link: ({children, value}) => (
                      <a 
                        href={value?.href}
                        className="text-[#6184ED] dark:text-[#809FFF] hover:text-[#4a6bd8] dark:hover:text-[#9bb3ff] underline transition-colors cursor-pointer" 
                        {...(value?.href?.startsWith('/') || value?.href?.startsWith('.') || !value?.href?.includes('://') 
                          ? { 
                              onClick: (e) => {
                                e.preventDefault();
                                onClose();
                                // Small delay to ensure modal closes before navigation
                                setTimeout(() => {
                                  window.location.href = value.href;
                                }, 100);
                              }
                            }
                          : { 
                              target: "_blank", 
                              rel: "noopener noreferrer" 
                            }
                        )}
                      >
                        {children}
                      </a>
                    ),
                  },
                  list: {
                    bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                    number: ({children}) => <ol className="list-decimal list-outside mb-4 space-y-2 ml-6">{children}</ol>,
                  },
                  listItem: {
                    bullet: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                    number: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                  },
                  types: {
                    image: ({value}) => (
                      <ResponsiveImage
                        src={value?.asset?.url} 
                        alt={value?.alt || ''} 
                        className="w-full !max-w-none mx-[-10] md:mx-[-22] h-auto rounded-lg shadow-md mb-4 pt-[5px] pb-[10px]"
                        isModal={true}
                      />
                    ),
                    code: ({value}) => (
                      <div className="relative mb-6">
                        {value?.filename && (
                          <div className="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-t-lg border-b border-gray-300 dark:border-gray-500">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {value.filename}
                            </span>
                          </div>
                        )}
                        <div className="relative">
                          <pre className={`bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 ${
                            value?.filename ? 'rounded-b-lg' : 'rounded-lg'
                          } overflow-x-auto text-17px leading-relaxed`} style={{ fontFamily: 'inherit' }}>
                            <code style={{ fontFamily: 'inherit' }}>{value?.code}</code>
                          </pre>
                          <CopyButton 
                            code={value?.code || ''} 
                            filename={value?.filename}
                          />
                        </div>
                      </div>
                    ),
                    codeBlock: ({value}) => (
                      <div className="relative mb-6">
                        {value?.filename && (
                          <div className="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-t-lg border-b border-gray-300 dark:border-gray-500">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {value.filename}
                            </span>
                          </div>
                        )}
                        <div className="relative">
                          <pre className={`bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 ${
                            value?.filename ? 'rounded-b-lg' : 'rounded-lg'
                          } overflow-x-auto text-17px leading-relaxed`} style={{ fontFamily: 'inherit' }}>
                            <code style={{ fontFamily: 'inherit' }}>{value?.code}</code>
                          </pre>
                          <CopyButton 
                            code={value?.code || ''} 
                            filename={value?.filename}
                          />
                        </div>
                      </div>
                    ),
                  },
                }}
              />
            </div>
            
            {/* Colophon (P.S. section) for About page without headshot - appears after main content */}
            {post.id === 'about' && post.psContent && (Array.isArray(post.psContent) ? post.psContent.length > 0 : true) && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 mt-8 mb-4"></div>
                <div className="w-full max-w-[530px] prose prose-lg max-w-none dark:prose-invert">
                  <div className="markdown-content text-17px">
                    <PortableText 
                      value={post.psContent}
                      components={{
                        block: {
                          normal: ({children}) => <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4 text-17px">{children}</p>,
                          blockquote: ({children}) => (
                            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 mb-4 text-17px">
                              {children}
                            </blockquote>
                          ),
                        },
                        list: {
                          bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                        },
                        listItem: {
                          bullet: ({children}) => <li className="text-gray-800 dark:text-gray-200 text-17px pl-2">{children}</li>,
                        },
                        marks: {
                          strong: ({children}) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
                          em: ({children}) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                        },
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          )}
              
              {/* Social Media Share Section - only show for actual blog posts, not About or 404 pages */}
              {post.id !== 'about' && post.id !== '404' && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <ShareIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300 font-medium">Like this post? → Click to share</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap social-share-buttons">
                    <a
                      href={shareUrls.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors flex-shrink-0 mb-2"
                      title="Share on LinkedIn"
                    >
                      <LinkedinIcon className="w-4 h-4" />
                    </a>
                    <a
                      href={shareUrls.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors flex-shrink-0 mb-2"
                      title="Share on Twitter"
                    >
                      <TwitterIcon className="w-4 h-4" />
                    </a>
                    <a
                      href={shareUrls.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors flex-shrink-0 mb-2"
                      title="Share on Facebook"
                    >
                      <FacebookIcon className="w-4 h-4" />
                    </a>
                    <a
                      href={shareUrls.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors flex-shrink-0 mb-2"
                      title="Share on WhatsApp"
                    >
                      <MessageCircleIcon className="w-4 h-4" />
                    </a>
                    <a
                      href={shareUrls.email}
                      className="flex items-center justify-center p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors flex-shrink-0 mb-2"
                      title="Share via Email"
                    >
                      <MailIcon className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}
              
              {/* Newsletter form for About page - placed at bottom of content */}
              {post.id === 'about' && (
                <div className="mt-2 pt-2">
                  <div className="w-full max-w-[530px]">
                    {/* Mobile version with shorter placeholder */}
                    <div className="md:hidden">
                      <NewsletterForm 
                        className="w-full"
                        placeholder="Enter your email address"
                        buttonText="Subscribe"
                      />
                    </div>
                    {/* Tablet and desktop version with longer placeholder */}
                    <div className="hidden md:block">
                      <NewsletterForm 
                        className="w-full"
                        placeholder="Enter your email address"
                        buttonText="Subscribe"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}