import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PortableText } from '@portabletext/react';
import { CopyIcon, CheckIcon, TwitterIcon, LinkedinIcon, FacebookIcon, MailIcon, MessageCircleIcon, ArrowLeft } from 'lucide-react';
import { NewsletterForm } from './NewsletterForm';
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
    let text = codeRef.current?.textContent || '';
    
    if (text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    }
    
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

// Helper function to fix internal links that should point to /posts/slug
function fixInternalLink(href: string | undefined): string | undefined {
  if (!href) return href;
  
  // List of paths that should NOT be prefixed with /posts/
  const excludedPaths = ['/posts/', '/about', '/archive', '/blogroll', '/404', '/'];
  
  try {
    // Check if it's a full URL
    if (href.includes('://')) {
      const url = new URL(href);
      const currentOrigin = window.location.origin;
      
      // If it's the same domain and path looks like /slug (not /posts/slug)
      if (url.origin === currentOrigin) {
        const path = url.pathname;
        // Check if it's not already /posts/ and not in excluded paths
        if (!path.startsWith('/posts/') && !excludedPaths.some(excluded => path === excluded || path.startsWith(excluded + '/'))) {
          // It's likely a blog post slug, prepend /posts/
          return `${url.origin}/posts${path}${url.search}${url.hash}`;
        }
      }
      return href;
    }
    
    // Handle relative paths
    if (href.startsWith('/')) {
      // Check if it's not already /posts/ and not in excluded paths
      if (!href.startsWith('/posts/') && !excludedPaths.some(excluded => href === excluded || href.startsWith(excluded + '/'))) {
        // It's likely a blog post slug, prepend /posts/
        return `/posts${href}`;
      }
    }
    
    return href;
  } catch (e) {
    // If URL parsing fails, return original href
    return href;
  }
}

interface BlogPostProps {
  post: any;
}

export function BlogPost({ post }: BlogPostProps) {
  const { isDarkMode } = useTheme();
  const location = useLocation();
  
  // Debug: Log psContent for about page
  React.useEffect(() => {
    if (post?.id === 'about') {
      console.log('🔍 BlogPost - About page psContent:', post.psContent);
      console.log('🔍 BlogPost - About page psContent length:', post.psContent?.length);
      console.log('🔍 BlogPost - About page full post:', post);
    }
  }, [post]);
  
  // Check if we're on a single post page (not homepage)
  const isSinglePostPage = location.pathname.startsWith('/posts/') || location.pathname === '/about' || location.pathname === '/about/';

  // Add structured data when post is rendered
  React.useEffect(() => {
    const schemas = [];
    
    if (post.id === 'about') {
      schemas.push(generateAboutPageSchema());
    } else if (post.id !== '404') {
      const postUrl = `${window.location.origin}/posts/${post.slug || post.id}`;
      schemas.push(generateContextualSchema(post, postUrl));
      schemas.push(generateBreadcrumbSchema(post));
    }
    
    if (schemas.length > 0) {
      insertMultipleStructuredData(schemas);
    }
  }, [post]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      return '';
    }
  };

  const getPostUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/posts/${post.slug || post.id}`;
  };

  const getShareText = () => {
    const description = post.subheader || post.excerpt || 'Check out this article';
    return `${post.title} - ${description}`;
  };

  const shareUrls = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}&url=${encodeURIComponent(getPostUrl())}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getPostUrl())}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getPostUrl())}`,
    email: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(`${getShareText()}\n\n${getPostUrl()}`)}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${getShareText()} ${getPostUrl()}`)}`,
  };

  // Determine the post URL - special handling for about page
  const getPostLink = () => {
    if (post.id === 'about') {
      return '/about';
    }
    const postSlug = post.slug || post.id;
    return `/posts/${postSlug}`;
  };

  return (
    <article className="w-full last:mb-0" style={{ marginBottom: '100px' }}>
      <div className="mb-[18px]">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2 pt-[5px]">
          <Link 
            to={getPostLink()}
            className="hover:underline transition-all"
          >
            {post.title}
          </Link>
        </h1>
        {(post.subheader || post.excerpt) && post.id !== 'about' && (
          <p className="text-gray-600 dark:text-gray-400 text-lg">{post.subheader || post.excerpt}</p>
        )}
      </div>
      
      {post.id === 'about' && post.headshot ? (
        <div className="flex flex-col min-[900px]:flex-row gap-6 min-[900px]:gap-8 mb-6 items-start">
          <div className="flex-shrink-0 min-[900px]:mt-2" style={{ flexBasis: 'auto' }}>
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
            {/* See all posts button (tablet/desktop only) */}
            <div
              className="mt-6 hidden md:flex justify-center"
              data-testid="about-desktop-see-all-posts"
            >
              <Link
                to="/"
                className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                See all posts
              </Link>
            </div>
          </div>
          <div className="flex-1 prose prose-lg max-w-none dark:prose-invert max-w-full min-[900px]:max-w-[650px]">
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
                    link: ({children, value}) => {
                      const fixedHref = fixInternalLink(value?.href);
                      return (
                        <a 
                          href={fixedHref}
                          className="text-[#6184ED] dark:text-[#809FFF] hover:text-[#4a6bd8] dark:hover:text-[#9bb3ff] underline transition-colors cursor-pointer" 
                          {...(fixedHref?.startsWith('/') || fixedHref?.startsWith('.') || !fixedHref?.includes('://') 
                            ? {} 
                            : { 
                                target: "_blank", 
                                rel: "noopener noreferrer" 
                              }
                          )}
                        >
                          {children}
                        </a>
                      );
                    },
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
                        <pre className={`bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg ${value?.filename ? 'rounded-t-none' : ''} overflow-x-auto text-17px leading-relaxed`} style={{ fontFamily: 'inherit' }}>
                          <code>{value?.code || ''}</code>
                        </pre>
                      </div>
                    ),
                  },
                }}
              />
            </div>
            
            {/* Colophon (P.S. section) for About page with headshot - appears after main content */}
            {post.id === 'about' && post.psContent && (Array.isArray(post.psContent) ? post.psContent.length > 0 : true) && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 mt-8 mb-6 opacity-60"></div>
                <div className="w-full max-w-[650px] prose prose-lg max-w-none dark:prose-invert">
                  <div className="markdown-content text-17px">
                    <PortableText 
                      value={post.psContent}
                      components={{
                        block: {
                          normal: ({children}) => <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4 text-17px">{children}</p>,
                          blockquote: ({children}) => (
                            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-500 dark:text-gray-500 mb-4 text-17px opacity-80">
                              {children}
                            </blockquote>
                          ),
                        },
                        list: {
                          bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                        },
                        listItem: {
                          bullet: ({children}) => <li className="text-gray-600 dark:text-gray-400 text-17px pl-2">{children}</li>,
                        },
                        marks: {
                          strong: ({children}) => <strong className="font-bold text-gray-700 dark:text-gray-300">{children}</strong>,
                          em: ({children}) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
                        },
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* See all posts button (mobile only) — at the very bottom of the About page */}
            <div
              className="mt-8 md:hidden"
              data-testid="about-mobile-see-all-posts"
            >
              <Link
                to="/"
                className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                See all posts
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="prose prose-lg max-w-none dark:prose-invert max-w-full md:max-w-[650px] mr-0 md:mr-20">
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
                link: ({children, value}) => {
                  const fixedHref = fixInternalLink(value?.href);
                  return (
                    <a 
                      href={fixedHref}
                      className="text-[#6184ED] dark:text-[#809FFF] hover:text-[#4a6bd8] dark:hover:text-[#9bb3ff] underline transition-colors cursor-pointer" 
                      {...(fixedHref?.startsWith('/') || fixedHref?.startsWith('.') || !fixedHref?.includes('://') 
                        ? {} 
                        : { 
                            target: "_blank", 
                            rel: "noopener noreferrer" 
                          }
                      )}
                    >
                      {children}
                    </a>
                  );
                },
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
          
          {/* Colophon (P.S. section) for About page without headshot - appears after main content */}
          {post.id === 'about' && post.psContent && (Array.isArray(post.psContent) ? post.psContent.length > 0 : true) && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-8 mb-6 opacity-60"></div>
              <div className="w-full max-w-[650px] prose prose-lg max-w-none dark:prose-invert">
                <div className="markdown-content text-17px">
                  <PortableText 
                    value={post.psContent}
                    components={{
                      block: {
                        normal: ({children}) => <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4 text-17px">{children}</p>,
                        blockquote: ({children}) => (
                          <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-500 dark:text-gray-500 mb-4 text-17px opacity-80">
                            {children}
                          </blockquote>
                        ),
                      },
                      list: {
                        bullet: ({children}) => <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>,
                      },
                      listItem: {
                        bullet: ({children}) => <li className="text-gray-600 dark:text-gray-400 text-17px pl-2">{children}</li>,
                      },
                      marks: {
                        strong: ({children}) => <strong className="font-bold text-gray-700 dark:text-gray-300">{children}</strong>,
                        em: ({children}) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
                      },
                    }}
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Social Media Share Section */}
          {post.id !== 'about' && post.id !== '404' && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              {/* Date and See all posts button row - on mobile/tablet (460px to 749px) */}
              <div className="relative min-[460px]:block max-[749px]:block min-[750px]:hidden max-[459px]:hidden">
                <div className="text-gray-600 dark:text-gray-400 text-base flex-shrink-0">
                  {formatDate(post.publishedAt || post.created_at)}
                </div>
                {isSinglePostPage && (
                  <Link
                    to="/"
                    className="see-all-posts-button absolute right-0 top-0 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    See all posts
                  </Link>
                )}
              </div>
              {/* Date only - on very small screens (below 460px) */}
              <div className="max-[459px]:block min-[460px]:hidden">
                <div className="text-gray-600 dark:text-gray-400 text-base text-right">
                  {formatDate(post.publishedAt || post.created_at)}
                </div>
              </div>
              {/* Date only - on desktop */}
              <div className="hidden min-[750px]:block">
                <div className="text-gray-600 dark:text-gray-400 text-base">
                  {formatDate(post.publishedAt || post.created_at)}
                </div>
              </div>
              {/* Social share buttons */}
              <div className="mt-4 flex items-center gap-2 flex-wrap social-share-buttons min-[750px]:mb-0 max-[459px]:justify-end">
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
              {/* See all posts button - show on desktop and very small screens (below 460px) */}
              {isSinglePostPage && (
                <div className="mt-4 max-[459px]:block min-[460px]:max-[749px]:hidden min-[750px]:block max-[459px]:text-right">
                  <Link
                    to="/"
                    className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    See all posts
                  </Link>
                </div>
              )}
            </div>
          )}
          
          {/* See all posts button - show on about page only */}
          {post.id === 'about' && (
            <div className="mt-8">
              <Link
                to="/"
                className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                See all posts
              </Link>
            </div>
          )}
          
          {/* Take me home button - show on 404 page at bottom */}
          {post.id === '404' && (
            <div className="mt-4 pt-2">
              <Link
                to="/"
                className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                Take me home
              </Link>
            </div>
          )}
        </div>
        </div>
      )}
    </article>
  );
}

