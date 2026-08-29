import React, { useState, useEffect } from 'react';

interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkItem[];
  path?: string; // Added to track folder location
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [recentBookmarks, setRecentBookmarks] = useState<BookmarkItem[]>([]);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [savedStatus, setSavedStatus] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // --- Traversal State ---
  const [currentFolder, setCurrentFolder] = useState<BookmarkItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string, title: string}[]>([]);

  // --- Theme State ---
  const [theme, setTheme] = useState<'light'|'dark'>(() => (localStorage.getItem('fm_theme') as 'light'|'dark') || 'dark');
  useEffect(() => { localStorage.setItem('fm_theme', theme); }, [theme]);

  const fetchBookmarks = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        if (tree && tree[0] && tree[0].children) {
          setBookmarks(tree[0].children);
        }
      });
      chrome.bookmarks.getRecent(5, (recent) => {
        setRecentBookmarks(recent);
      });
    }
  };

  useEffect(() => {
    fetchBookmarks();
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].title) {
          setActiveTab({ title: tabs[0].title, url: tabs[0].url });
        }
      });
    }
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, currentFolder]);

  const handleBookmarkCurrentTab = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks && activeTab) {
      chrome.bookmarks.create(
        { title: activeTab.title, url: activeTab.url },
        () => {
          setSavedStatus(true);
          setTimeout(() => setSavedStatus(false), 2000);
          fetchBookmarks();
        }
      );
    }
  };

  // Modified to recursively track the folder path
  const flattenBookmarks = (nodes: BookmarkItem[], currentPath = ''): BookmarkItem[] => {
    let list: BookmarkItem[] = [];
    nodes.forEach((node) => {
      const nodePath = currentPath ? `${currentPath} / ${node.title}` : node.title;
      if (node.url) {
        list.push({ ...node, path: currentPath }); // Attach the parent folder path
      }
      if (node.children) {
        list = list.concat(flattenBookmarks(node.children, nodePath));
      }
    });
    return list;
  };

  // --- Unified Rendering Array ---
  let visibleItems: BookmarkItem[] = [];
  
  if (searchQuery.trim()) {
    const allBookmarks = flattenBookmarks(bookmarks);
    visibleItems = allBookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.url && b.url.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  } else if (currentFolder) {
    visibleItems = currentFolder.children || [];
  } else {
    visibleItems = [...recentBookmarks, ...bookmarks];
  }

  // --- Folder Traversal Logic ---
  const handleOpenFolder = (folder: BookmarkItem) => {
    setCurrentFolder(folder);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, title: folder.title }]);
  };

  const handleGoBack = (index: number) => {
    if (index === -1) {
      setCurrentFolder(null);
      setBreadcrumbs([]);
    } else {
      const targetBreadcrumb = breadcrumbs[index];
      const findFolder = (nodes: BookmarkItem[], id: string): BookmarkItem | null => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findFolder(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      const found = findFolder(bookmarks, targetBreadcrumb.id);
      if (found) {
        setCurrentFolder(found);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      }
    }
  };

  // --- Keyboard Navigation ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery) {
          e.preventDefault(); // Stops Chrome from closing the extension
          setSearchQuery('');
        } else if (currentFolder) {
          e.preventDefault(); // Stops Chrome from closing the extension
          handleGoBack(breadcrumbs.length - 2);
        }
        return; // If at home screen, allow default Escape to close popup
      }

      if (visibleItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < visibleItems.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = visibleItems[selectedIndex];
        if (selectedItem) {
          if (selectedItem.url) {
            window.open(selectedItem.url, '_blank');
          } else {
            handleOpenFolder(selectedItem);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, selectedIndex, searchQuery, currentFolder, breadcrumbs]);

  // Strict Native Chrome Palette
  const themeVars = theme === 'dark' ? {
    '--bg-main': '#202124',
    '--bg-hover': '#35363a',
    '--bg-active': 'rgba(138, 180, 248, 0.08)',
    '--border-divider': '#3c4043',
    '--text-primary': '#e8eaed',
    '--text-secondary': '#9aa0a6',
    '--accent': '#8ab4f8',
  } : {
    '--bg-main': '#ffffff',
    '--bg-hover': '#f1f3f4',
    '--bg-active': 'rgba(26, 115, 232, 0.08)',
    '--border-divider': '#dadce0',
    '--text-primary': '#202124',
    '--text-secondary': '#5f6368',
    '--accent': '#1a73e8',
  };

  return (
    <div 
      className="flex flex-col w-[800px] h-[600px] overflow-hidden transition-colors duration-150"
      style={{ 
        ...themeVars,
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--bg-main)',
        color: 'var(--text-primary)',
      } as React.CSSProperties}
    >
      
      {/* Search Header */}
      <div className="flex flex-col shrink-0" style={{ borderBottom: '1px solid var(--border-divider)' }}>
        <div className="flex items-center px-4 py-3">
          <svg className="w-5 h-5 mr-3 shrink-0" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input
            type="text"
            autoFocus
            placeholder="Search bookmarks..."
            className="w-full bg-transparent text-[15px] outline-none placeholder-opacity-70"
            style={{ color: 'var(--text-primary)' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md ml-2 transition-colors cursor-pointer shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Toggle Theme"
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            )}
          </button>
        </div>

        {/* Breadcrumbs */}
        {!searchQuery && breadcrumbs.length > 0 && (
          <div className="flex items-center px-4 py-1.5 text-[12px] overflow-x-auto hide-scrollbar" style={{ backgroundColor: 'var(--bg-hover)', borderTop: '1px solid var(--border-divider)' }}>
            <button onClick={() => handleGoBack(-1)} className="hover:underline opacity-80 transition-opacity hover:opacity-100" style={{ color: 'var(--text-secondary)' }}>Home</button>
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.id}>
                <span className="mx-1.5 opacity-50" style={{ color: 'var(--text-secondary)' }}>/</span>
                <button 
                  onClick={() => handleGoBack(i)}
                  className={`hover:underline transition-opacity ${i === breadcrumbs.length - 1 ? 'font-medium' : 'opacity-80 hover:opacity-100'}`}
                  style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {bc.title}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {searchQuery ? (
              <>
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>No results found for "{searchQuery}"</p>
                <p className="text-[11px] mt-1 opacity-70" style={{ color: 'var(--text-secondary)' }}>Press <kbd className="px-1 rounded border border-gray-500/30">Esc</kbd> to clear</p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mb-3 opacity-20" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>This folder is empty</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const isFolder = !item.url;
              
              let header = null;
              if (!searchQuery && !currentFolder) {
                if (index === 0 && recentBookmarks.length > 0) {
                  header = <h2 className="text-[10px] font-bold uppercase tracking-wider mt-2 mb-1.5 px-3" style={{ color: 'var(--text-secondary)' }}>Recently Added</h2>;
                }
                if (index === recentBookmarks.length) {
                  header = <h2 className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-1.5 px-3" style={{ color: 'var(--text-secondary)' }}>Bookmarks</h2>;
                }
              }

              return (
                <React.Fragment key={`${item.id}-${index}`}>
                  {header}
                  <a 
                    onClick={() => isFolder ? handleOpenFolder(item) : window.open(item.url, '_blank')}
                    className="group flex items-center px-3 py-2.5 rounded-md transition-colors cursor-pointer relative"
                    style={{ backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent' }}
                    onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; setSelectedIndex(index); }}
                    onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-md" style={{ backgroundColor: 'var(--accent)' }} />}
                    
                    {isFolder ? (
                      <svg className="w-4 h-4 shrink-0 opacity-70" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                    ) : (
                      <img src={`https://www.google.com/s2/favicons?domain=${item.url}&sz=32`} alt="" className="w-4 h-4 rounded-sm shrink-0 grayscale-[20%] group-hover:grayscale-0 transition-all" />
                    )}
                    
                    <div className="ml-3 flex flex-col overflow-hidden w-full">
                      <p className="text-[13px] font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>{item.title || item.url}</p>
                      
                      {!isFolder && (
                        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                          {/* Folder Path (Only shown during search) */}
                          {searchQuery && item.path && (
                            <span className="text-[10px] px-1.5 py-[1px] rounded shrink-0 opacity-80" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                              {item.path}
                            </span>
                          )}
                          <p className="text-[12px] truncate opacity-70" style={{ color: 'var(--text-secondary)' }}>{item.url}</p>
                        </div>
                      )}
                    </div>
                  </a>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Toolbar */}
      <div className="px-4 py-2.5 flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--border-divider)', backgroundColor: 'var(--bg-main)' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <kbd className="px-1.5 py-0.5 rounded border mr-1 font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)' }}>↑↓</kbd> Navigate
          </span>
          <span className="flex items-center text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <kbd className="px-1.5 py-0.5 rounded border mr-1 font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)' }}>↵</kbd> Open
          </span>
          <span className="flex items-center text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <kbd className="px-1.5 py-0.5 rounded border mr-1 font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)' }}>Esc</kbd> Back / Clear
          </span>
        </div>

        <button
          onClick={handleBookmarkCurrentTab}
          className="flex items-center px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer"
          style={{ color: savedStatus ? '#81c995' : 'var(--accent)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {savedStatus ? '✓ Saved' : '+ Save Tab'}
        </button>
      </div>
    </div>
  );
}