import { useState, useEffect } from 'react';

interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkItem[];
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [savedStatus, setSavedStatus] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0); // Tracks keyboard highlight

  const fetchBookmarks = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        if (tree && tree[0] && tree[0].children) {
          setBookmarks(tree[0].children);
        }
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

  // Reset keyboard highlight to the top when typing a new search
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

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

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevents the link from opening when clicking delete
    e.stopPropagation();
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.remove(id, () => {
        fetchBookmarks(); // Instantly refresh UI after deletion
      });
    }
  };

  const flattenBookmarks = (nodes: BookmarkItem[]): BookmarkItem[] => {
    let list: BookmarkItem[] = [];
    nodes.forEach((node) => {
      if (node.url) list.push(node);
      if (node.children) list = list.concat(flattenBookmarks(node.children));
    });
    return list;
  };

  const allBookmarks = flattenBookmarks(bookmarks);
  const filteredBookmarks = searchQuery.trim()
    ? allBookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.url && b.url.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : null;

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filteredBookmarks || filteredBookmarks.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault(); // Stops the whole window from scrolling
        setSelectedIndex((prev) => (prev < filteredBookmarks.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedBookmark = filteredBookmarks[selectedIndex];
        if (selectedBookmark && selectedBookmark.url) {
          window.open(selectedBookmark.url, '_blank'); // Opens link in new tab
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredBookmarks, selectedIndex]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Search Header */}
      <div className="px-6 pt-6 pb-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-100 shadow-sm">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <input
            type="text"
            autoFocus
            placeholder="Search FlowMark..."
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all duration-300 placeholder:text-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {filteredBookmarks !== null ? (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">
              Search Results ({filteredBookmarks.length})
            </p>
            <div className="space-y-2">
              {filteredBookmarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <p>No matches found</p>
                </div>
              ) : (
                filteredBookmarks.map((bm, index) => (
                  <a 
                    key={bm.id} 
                    href={bm.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    // Dynamic styling based on keyboard highlight
                    className={`group flex items-center justify-between p-3 border rounded-xl transition-all duration-200 cursor-pointer ${
                      index === selectedIndex 
                        ? 'bg-indigo-50/50 border-indigo-200 shadow-sm transform -translate-y-0.5' 
                        : 'bg-white border-slate-100 hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center overflow-hidden">
                      <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                        index === selectedIndex ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white'
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                      </div>
                      <div className="ml-4 overflow-hidden">
                        <p className={`text-sm font-semibold truncate transition-colors ${index === selectedIndex ? 'text-indigo-700' : 'text-slate-700 group-hover:text-indigo-600'}`}>{bm.title || bm.url}</p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{bm.url}</p>
                      </div>
                    </div>
                    
                    {/* Delete Button (Visible on Hover/Focus) */}
                    <button 
                      onClick={(e) => handleDelete(bm.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete Bookmark"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </a>
                ))
              )}
            </div>
          </div>
        ) : (
          bookmarks.map((folder) => (
            <div key={folder.id} className="mb-6">
              <h2 className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                  {folder.title}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {folder.children?.map((bm) =>
                  bm.url ? (
                    <a key={bm.id} href={bm.url} target="_blank" rel="noreferrer" className="group flex items-center justify-between p-3.5 bg-white border border-slate-200/60 rounded-xl hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                      <div className="flex items-center flex-1 min-w-0 mr-3">
                        <img src={`https://www.google.com/s2/favicons?domain=${bm.url}&sz=32`} alt="favicon" className="w-5 h-5 rounded-sm opacity-80 shrink-0" />
                        <span className="ml-3 text-[13px] font-medium text-slate-700 truncate">{bm.title || bm.url}</span>
                      </div>
                      {/* Delete Button for Grid View */}
                      <button 
                        onClick={(e) => handleDelete(bm.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </a>
                  ) : null
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Footer */}
      <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
        <button
          onClick={handleBookmarkCurrentTab}
          className={`relative w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-sm font-bold shadow-sm transition-all duration-300 overflow-hidden ${
            savedStatus 
              ? 'bg-emerald-500 text-white shadow-emerald-500/30 ring-4 ring-emerald-500/20' 
              : 'bg-slate-900 text-white hover:bg-indigo-600 hover:shadow-indigo-500/30 active:scale-[0.98]'
          }`}
        >
          {savedStatus ? (
            <span className="flex items-center animate-pulse">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              Page Saved!
            </span>
          ) : (
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
              Bookmark Current Tab
            </span>
          )}
        </button>
      </div>
    </div>
  );
}