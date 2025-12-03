import React, { useState, useEffect, useRef } from 'react';
import { useNewsletter } from '../hooks/useNewsletter';
import { useWindowSize } from '../hooks/useWindowSize';
import { CheckIcon, LoaderIcon, ArrowLeftRight } from 'lucide-react';

interface SearchSubscribeToggleProps {
  placeholder?: string;
  buttonText?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  onSearch?: (query: string) => void;
}

export function SearchSubscribeToggle({
  placeholder = "Enter your email address",
  buttonText = "Subscribe",
  className = "",
  inputClassName = "",
  buttonClassName = "",
  onSearch
}: SearchSubscribeToggleProps) {
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { isLoading, isSuccess, error, subscribe, reset } = useNewsletter();
  const { width } = useWindowSize();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset success state after 3 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        reset();
        setInputValue('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, reset]);

  // Focus input when switching TO search mode
  useEffect(() => {
    if (isSearchMode) {
      // Focus input when switching to search mode
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isSearchMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted, isSearchMode:', isSearchMode, 'inputValue:', inputValue);
    
    if (!isSearchMode) {
      // Handle newsletter subscription
      await subscribe(inputValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // For search mode, trigger search immediately as user types
    if (isSearchMode && onSearch) {
      console.log('Dynamic search with query:', value);
      onSearch(value);
    }
  };

  const toggleMode = () => {
    const newMode = !isSearchMode;
    setIsSearchMode(newMode);
    
    // Clear input and search when switching away from search mode
    if (isSearchMode && onSearch) {
      setInputValue('');
      onSearch('');
    }
    // Don't clear input when switching to search mode - let user continue typing
  };

  // Determine search placeholder based on screen size
  const getSearchPlaceholder = () => {
    if (width < 575) {
      return "Search the blog";
    }
    if (width >= 770 && width <= 860) {
      return "Search the blog";
    }
    return "Search the blog";
  };

  const currentPlaceholder = isSearchMode ? getSearchPlaceholder() : placeholder;
  const currentButtonText = isSearchMode ? "Search" : buttonText;

  if (isSuccess && !isSearchMode) {
    return (
      <div className={`flex items-center gap-2 text-green-600 dark:text-green-400 ${className}`}>
        <CheckIcon className="w-5 h-5" />
        <span className="font-medium">Nice! Now check your inbox to opt-in :)</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              ref={inputRef}
              type={isSearchMode ? "text" : "email"}
              value={inputValue}
              onChange={handleInputChange}
              placeholder={currentPlaceholder}
              disabled={isLoading}
              className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-600 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed ${inputClassName}`}
              required={!isSearchMode}
            />
          </div>
          <button
            type={isSearchMode ? "button" : "submit"}
            disabled={isLoading || (!isSearchMode && !inputValue)}
            onClick={isSearchMode ? () => inputRef.current?.focus() : undefined}
            className={`px-10 py-2 bg-blue-500 text-white rounded-lg font-medium ${!isSearchMode ? 'hover:bg-blue-600' : 'hover:bg-blue-600'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0 w-28 ${buttonClassName}`}
          >
            {isLoading && <LoaderIcon className="w-4 h-4 animate-spin" />}
            {isSearchMode ? "Search" : currentButtonText}
          </button>
          <button
            type="button"
            onClick={toggleMode}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={isSearchMode ? "Switch to newsletter" : "Switch to search"}
          >
            <ArrowLeftRight className="w-5 h-5" />
          </button>
        </div>
      </form>
      {error && !isSearchMode && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}