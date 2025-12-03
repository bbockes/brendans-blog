import { useEffect, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BlogLayout } from './components/BlogLayout';
import { ThemeProvider } from './contexts/ThemeContext';

// Component to scroll to top on route change and disable scroll restoration
function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // Disable browser's scroll restoration globally
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    // Force scroll to top immediately (synchronously before paint)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  useEffect(() => {
    // Aggressive scroll-to-top with multiple attempts to catch late-rendering content
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (window.scrollTo) window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    
    // Immediate scroll
    scrollToTop();
    
    // Use requestAnimationFrame for next frame
    requestAnimationFrame(() => {
      scrollToTop();
      // Multiple attempts to catch any late-rendering content or scroll restoration
      requestAnimationFrame(() => {
        scrollToTop();
        setTimeout(scrollToTop, 0);
        setTimeout(scrollToTop, 50);
        setTimeout(scrollToTop, 100);
        setTimeout(scrollToTop, 200);
        setTimeout(scrollToTop, 300);
        setTimeout(scrollToTop, 500);
        setTimeout(scrollToTop, 750);
        setTimeout(scrollToTop, 1000);
      });
    });
    
    // Add a scroll event listener that forces scroll to top if page scrolls away
    // This catches any scroll restoration that happens after our initial attempts
    let isNavigating = true;
    const forceScrollToTop = () => {
      if (isNavigating && (window.scrollY > 5 || document.documentElement.scrollTop > 5)) {
        scrollToTop();
      }
    };
    
    // Monitor scroll for the first 2 seconds after navigation
    window.addEventListener('scroll', forceScrollToTop, { passive: true });
    const timeoutId = setTimeout(() => {
      isNavigating = false;
      window.removeEventListener('scroll', forceScrollToTop);
    }, 2000);
    
    return () => {
      isNavigating = false;
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', forceScrollToTop);
    };
  }, [pathname]);

  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
          <Routes>
            <Route path="/" element={<BlogLayout />} />
            <Route path="/posts/:slug" element={<BlogLayout />} />
            <Route path="/about" element={<BlogLayout />} />
            <Route path="/about/" element={<BlogLayout />} />
            <Route path="/404" element={<BlogLayout />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
