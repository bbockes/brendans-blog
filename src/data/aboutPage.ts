// Define the type for our simplified content structure
type ListBlock = {
  type: 'list';
  listItems: string[];
};

type TextBlock = {
  type: 'paragraph' | 'heading1' | 'heading2' | 'listItem' | 'ps';
  text: string;
  style?: 'strong' | 'em' | 'strong em';
};

type ContentBlock = TextBlock | ListBlock;

type BlogPost = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  image: string;
  content: any[];
  psContent?: any[];
};

// Helper function to parse text for markdown-style formatting
const parseText = (text: string): { children: any[]; markDefs: any[] } => {
  const markDefs: any[] = [];
  const children: any[] = [];
  
  // Process text and create spans with appropriate marks
  const processTextWithMarks = (input: string): any[] => {
    const spans: any[] = [];
    let currentIndex = 0;
    
    // Find all markdown patterns and their positions
    const patterns = [
      { regex: /\*\*\*(.*?)\*\*\*/g, type: 'strongEm' },
      { regex: /\*\*(.*?)\*\*/g, type: 'strong' },
      { regex: /\*(.*?)\*/g, type: 'em' }
    ];
    
    const matches: Array<{ start: number; end: number; content: string; type: string }> = [];
    
    // Find all matches for all patterns
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(input)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1],
          type: pattern.type
        });
      }
    }
    
    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Remove overlapping matches (keep the first one)
    const filteredMatches = [];
    for (const match of matches) {
      const hasOverlap = filteredMatches.some(existing => 
        (match.start < existing.end && match.end > existing.start)
      );
      if (!hasOverlap) {
        filteredMatches.push(match);
      }
    }
    
    // Create spans
    let lastIndex = 0;
    
    for (const match of filteredMatches) {
      // Add text before the match (if any)
      if (match.start > lastIndex) {
        const beforeText = input.substring(lastIndex, match.start);
        if (beforeText) {
          spans.push({
            _type: 'span',
            text: beforeText,
            marks: []
          });
        }
      }
      
      // Add the formatted text
      const markKey = `${match.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      markDefs.push({
        _key: markKey,
        _type: match.type
      });
      
      spans.push({
        _type: 'span',
        text: match.content,
        marks: [markKey]
      });
      
      lastIndex = match.end;
    }
    
    // Add remaining text (if any)
    if (lastIndex < input.length) {
      const remainingText = input.substring(lastIndex);
      if (remainingText) {
        spans.push({
          _type: 'span',
          text: remainingText,
          marks: []
        });
      }
    }
    
    // If no matches found, return the original text as a single span
    if (spans.length === 0) {
      spans.push({
        _type: 'span',
        text: input,
        marks: []
      });
    }
    
    return spans;
  };
  
  const processedSpans = processTextWithMarks(text);
  
  return {
    children: processedSpans,
    markDefs
  };
};

// Helper function to convert our simplified format to the format expected by the frontend
const createContentBlocks = (blocks: ContentBlock[]): any[] => {
  const allMarkDefs: any[] = [];
  const processedBlocks: any[] = [];
  
  // Process text for markdown-style formatting
  const processText = (text: string) => {
    const { children, markDefs } = parseText(text || '');
    allMarkDefs.push(...markDefs);
    return children;
  };
  
  // Process each block based on its type
  for (const block of blocks) {
    if (block.type === 'list') {
      // Process list items
      for (const item of block.listItems) {
        const specialEmoji = ['🧩', '🛠️', '⚡'].some(emoji => item.startsWith(emoji));
        const style = specialEmoji ? 'normal' : 'listItem';
        const children = processText(item);
        
        processedBlocks.push({
          _type: 'block',
          style,
          children
        });
      }
    } else if ('text' in block) {
      // Process text-based blocks
      if (block.type === 'heading1' || block.type === 'heading2' || block.type === 'paragraph') {
        const children = processText(block.text);
        
        processedBlocks.push({
          _type: 'block',
          style: block.type === 'heading1' ? 'h1' : block.type === 'heading2' ? 'h2' : 'normal',
          children
        });
      } else if (block.type === 'listItem') {
        const specialEmoji = ['🧩', '🛠️', '⚡'].some(emoji => block.text.startsWith(emoji));
        const style = specialEmoji ? 'normal' : 'listItem';
        const children = processText(block.text);
        
        processedBlocks.push({
          _type: 'block',
          style,
          children
        });
      } else if (block.type === 'ps') {
        const children = processText(block.text);
        
        processedBlocks.push({
          _type: 'block',
          style: 'blockquote',
          children
        });
      } else {
        // Default case for any other text block type
        const children = processText(block.text);
        
        processedBlocks.push({
          _type: 'block',
          style: 'normal',
          children
        });
      }
    }
  }
  
  // Add markDefs to the first block if we have any
  if (allMarkDefs.length > 0 && processedBlocks.length > 0) {
    const firstBlock = processedBlocks[0];
    firstBlock.markDefs = [
      ...(firstBlock.markDefs || []),
      ...allMarkDefs
    ];
  }
  
  return processedBlocks;
};

// Define the about page content in a more readable format
const aboutContent: ContentBlock[] = [
  {
    type: 'paragraph',
    text: "**These days, everyone's a builder.**"
  },
  {
    type: 'paragraph',
    text: "Whether you're a **full-time developer, a vibe coder, or an aspiring entrepreneur**, it's never been easier to **start a business, a movement, or a community**. With the right mindset and a bit of know-how, **anyone can build something meaningful from their laptop — no gatekeepers, no waiting**."
  },
  {
    type: 'paragraph',
    text: "If only it were as simple as having an idea and watching it come to life."
  },
  {
    type: 'paragraph',
    text: 'Building something impactful takes more than inspiration—**it takes the right approach to:**'
  },
  {
    type: 'list',
    listItems: [
      '**solve problems people care about**',
      '**reach the right audience**',
      '**iterate quickly based on feedback**',
      '**work with people to get things done**'
    ]
  },
  {
    type: 'paragraph',
    text: '**In other words: execution matters.**'
  },
  {
    type: 'paragraph',
    text: "That's where **modern tools can make all the difference.** Using AI and software can create enormous leverage—***if* you use them right.**"
  },
  {
    type: 'paragraph',
    text: "The problem is… **most people don't.**"
  },
  {
    type: 'paragraph',
    text: '**They treat AI like a slot machine**—guess, tweak, and hope for the best.'
  },
  {
    type: 'paragraph',
    text: "And they **choose apps and workflows** based on what's **familiar** or **popular**, not what actually works."
  },
  {
    type: 'paragraph',
    text: "The result? **Wasted time.** **Needless frustration.** **Ideas that never ship.**"
  },
  {
    type: 'paragraph',
    text: "You don't need a pile of hacks or a library of prompts. You need a guide who can show you how to **combine tools with best practices** to get real results."
  },
  {
    type: 'paragraph',
    text: "That's where I can help."
  },
  {
    type: 'paragraph',
    text: "Hi, I'm **Brendan**. I'm a **web designer**, **writer**, and **tech enthusiast** who believes there's always a smarter way to get things done."
  },
  {
    type: 'paragraph',
    text: "I've always chased better tools. But I learned that even the **best apps or AI models** are only as good as **how you use them.**"
  },
  {
    type: 'paragraph',
    text: "Productivity isn't about stacking tools—it's about using the right ones, the right way."
  },
  {
    type: 'paragraph',
    text: "**Brendan's Blog** is my personal blog where I share thoughts on productivity, technology, and building."
  },
  {
    type: 'paragraph',
    text: 'In every post, I share:'
  },
  {
    type: 'paragraph',
    text: '🧩 **One real-world problem** — something that might be slowing you down'
  },
  {
    type: 'paragraph',
    text: '🛠️ **One prompt, tool, or tactic** — a smarter, faster way to solve it'
  },
  {
    type: 'paragraph',
    text: '⚡ **One repeatable process** — simple steps to deliver repeatable results'
  },
  {
    type: 'paragraph',
    text: 'No fluff. No overwhelm. Just **smart, practical ways to use AI with intention**, **make the most of the right tools**, and **supercharge your productivity.**'
  },
  {
    type: 'paragraph',
    text: 'Whether you\'re:'
  },
  {
    type: 'list',
    listItems: [
      'finding a problem to solve',
      'designing a solution to solve it',
      'building, marketing, and scaling your project',
      'or simply trying to save time, stay organized, and focus'
    ]
  },
  {
    type: 'paragraph',
    text: "…you'll find **practical tech tips to help you build with confidence** — no matter where you are on the journey."
  },
  {
    type: 'paragraph',
    text: '👉 Subscribe today'
  },
  {
    type: 'paragraph',
    text: 'and **join a community of builders** turning ideas into successful projects—**one email at a time.**'
  }
];

// PS content
const psContent: ContentBlock[] = [
  {
    type: 'ps',
    text: 'P.S. A newsletter about saving time should respect yours.'
  },
  {
    type: 'ps',
    text: "That's why each post is:"
  },
  {
    type: 'listItem',
    text: '✅ Bite-sized'
  },
  {
    type: 'listItem',
    text: '⏱️ Super short — just look for the read-time icon'
  },
  {
    type: 'listItem',
    text: '💡 Packed with insights you can use immediately'
  }
];

// Create the final about post object
export const aboutPost: BlogPost = {
  id: 'about',
  title: "Brendan's Blog",
  excerpt: '',
  category: 'About',
  readTime: '1 min',
  image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&h=250&fit=crop',
  content: createContentBlocks(aboutContent),
  psContent: createContentBlocks(psContent)
};

export default aboutPost;
