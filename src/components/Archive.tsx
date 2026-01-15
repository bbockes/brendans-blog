import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { cachedFetch, POSTS_QUERY } from '../lib/sanityClient';
import { slugify, filterPostsBySearchQuery } from '../utils/slugify';

interface Post {
  id: string;
  _id: string;
  title: string;
  slug?: string | { current: string };
  publishedAt?: string;
  created_at?: string;
  [key: string]: any;
}

interface YearData {
  year: number;
  count: number;
  months: MonthData[];
}

interface MonthData {
  month: number;
  monthName: string;
  count: number;
  posts: Post[];
}

interface ArchiveProps {
  searchQuery?: string;
}

export function Archive({ searchQuery = '' }: ArchiveProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // Fetch posts on mount
  useEffect(() => {
    async function fetchPosts() {
      try {
        const postsData = await cachedFetch(POSTS_QUERY);
        const transformedPosts = postsData.map(post => ({
          ...post,
          id: post._id,
          slug: post.slug?.current || post.slug || slugify(post.title)
        }));
        
        // Sort by publishedAt descending (newest first)
        transformedPosts.sort((a, b) => {
          const dateA = new Date(a.publishedAt || a.created_at || 0).getTime();
          const dateB = new Date(b.publishedAt || b.created_at || 0).getTime();
          return dateB - dateA;
        });
        
        setPosts(transformedPosts);
      } catch (err) {
        console.error('Error fetching archive posts:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPosts();
  }, []);

  // Group posts by year and month
  const archiveData = useMemo(() => {
    // Filter posts by search query first
    const filteredPosts = searchQuery.trim() 
      ? filterPostsBySearchQuery(posts, searchQuery)
      : posts;
    
    const yearMap = new Map<number, Map<number, Post[]>>();
    
    filteredPosts.forEach(post => {
      const dateStr = post.publishedAt || post.created_at;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      
      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      
      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      
      monthMap.get(month)!.push(post);
    });
    
    // Convert to sorted array structure
    const yearData: YearData[] = Array.from(yearMap.entries())
      .map(([year, monthMap]) => {
        const months: MonthData[] = Array.from(monthMap.entries())
          .map(([month, posts]) => ({
            month,
            monthName: new Date(2000, month, 1).toLocaleString('en-US', { month: 'long' }),
            count: posts.length,
            posts: posts.sort((a, b) => {
              const dateA = new Date(a.publishedAt || a.created_at || 0).getTime();
              const dateB = new Date(b.publishedAt || b.created_at || 0).getTime();
              return dateB - dateA; // Newest first within month
            })
          }))
          .sort((a, b) => b.month - a.month); // Reverse chronological (December first)
        
        return {
          year,
          count: Array.from(monthMap.values()).reduce((sum, posts) => sum + posts.length, 0),
          months
        };
      })
      .sort((a, b) => b.year - a.year); // Reverse chronological (newest year first)
    
    return yearData;
  }, [posts, searchQuery]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
        // Also collapse all months in this year
        const yearData = archiveData.find(y => y.year === year);
        if (yearData) {
          setExpandedMonths(prevMonths => {
            const newMonthSet = new Set(prevMonths);
            yearData.months.forEach(m => {
              newMonthSet.delete(`${year}-${m.month}`);
            });
            return newMonthSet;
          });
        }
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
        // Expand year if not already expanded
        setExpandedYears(prevYears => {
          const newYearSet = new Set(prevYears);
          newYearSet.add(year);
          return newYearSet;
        });
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-[14px] py-8">
        <div className="text-center text-gray-600 dark:text-gray-400">Loading archive...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto md:pl-[60px] px-[14px] md:px-0" style={{ paddingTop: '10px', paddingBottom: '100px' }}>
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Archive
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Explore the blog archives by year and month.
        </p>
      </div>

      {archiveData.length === 0 ? (
        <div className="text-center text-gray-600 dark:text-gray-400 py-12">
          {searchQuery.trim() 
            ? `No posts found for "${searchQuery}".`
            : 'No posts found in the archive.'}
        </div>
      ) : (
        <div className="space-y-1">
          {archiveData.map(({ year, count, months }) => {
            const isYearExpanded = expandedYears.has(year);
            
            return (
              <div key={year} className="border-b border-gray-200 dark:border-gray-700 pb-2">
                {/* Year Header */}
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {isYearExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    )}
                    <span className="text-xl font-semibold text-[#6184ED] dark:text-[#809FFF]">
                      {year}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      ({count})
                    </span>
                  </div>
                </button>

                {/* Months */}
                {isYearExpanded && (
                  <div className="ml-7 space-y-1">
                    {months.map(({ month, monthName, count: monthCount, posts }) => {
                      const monthKey = `${year}-${month}`;
                      const isMonthExpanded = expandedMonths.has(monthKey);
                      
                      return (
                        <div key={month} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                          {/* Month Header */}
                          <button
                            onClick={() => toggleMonth(year, month)}
                            className="w-full flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              {isMonthExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              )}
                              <span className="text-lg font-medium text-[#6184ED] dark:text-[#809FFF]">
                                {monthName}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400 text-sm">
                                ({monthCount})
                              </span>
                            </div>
                          </button>

                          {/* Posts */}
                          {isMonthExpanded && (
                            <div className="ml-6 mt-2 space-y-1">
                              {posts.map((post) => {
                                const postSlug = post.slug?.current || post.slug || slugify(post.title);
                                
                                return (
                                  <Link
                                    key={post.id}
                                    to={`/posts/${postSlug}`}
                                    className="block py-2 px-3 text-gray-700 dark:text-gray-300 hover:text-[#6184ED] dark:hover:text-[#809FFF] hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                  >
                                    {post.title}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* See all posts button */}
      <div className="mt-8">
        <Link
          to="/"
          className="see-all-posts-button inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors font-medium text-base"
        >
          <ArrowLeft className="w-4 h-4" />
          See all posts
        </Link>
      </div>
    </div>
  );
}
