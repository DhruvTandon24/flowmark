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

  useEffect(() => {
    // Fetch native Chrome bookmarks
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        if (tree && tree[0] && tree[0].children) {
          setBookmarks(tree[0].children);
        }
      });
    }

    // Get active browser tab info
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].title) {
          setActiveTab({ title: tabs[0].title, url: tabs[0].url });
        }
      });
    }
  }, []);

  // Save current open tab to bookmarks
  const handleBookmarkCurrentTab = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks && activeTab) {
      chrome.bookmarks.create(
        {
          title: activeTab.title,
          url: activeTab.url,
        },
        () => {
          setSavedStatus(true);
          setTimeout(() => setSavedStatus(false), 2000);
          // Refresh bookmark list
          chrome.bookmarks.getTree((tree) => {
            if (tree && tree[0] && tree[0].children) {
              setBookmarks(tree[0].children);
            }
          });
        }
      );
    }
  };

  // Flatten nested folders for instant search
  const flattenBookmarks = (nodes: BookmarkItem[]): BookmarkItem[] => {
    let list: BookmarkItem[] = [];
    nodes.forEach((node) => {
      if (node.url) {
        list.push(node);
      }
      if (node.children) {
        list = list.concat(flattenBookmarks(node.children));
      }
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

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-800 font-sans">
      {/* Header & Search */}
      <div className="p-4 bg-white border-b border-gray-200 sticky top-0 shadow-xs">
        <h1 className="text-base font-bold text-gray-900 mb-2">FlowMark</h1>
        <input
          type="text"
          autoFocus
          placeholder="Search titles or URLs..."
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Main List Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredBookmarks !== null ? (
          /* Search Filter View */
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Results ({filteredBookmarks.length})
            </p>
            {filteredBookmarks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No bookmarks match your search.</p>
            ) : (
              filteredBookmarks.map((bm) => (
                <a
                  key={bm.id}
                  href={bm.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-2 rounded-md hover:bg-blue-50 transition border border-transparent hover:border-blue-100"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{bm.title || bm.url}</p>
                  <p className="text-xs text-gray-400 truncate">{bm.url}</p>
                </a>
              ))
            )}
          </div>
        ) : (
          /* Native Folder Tree View */
          bookmarks.map((folder) => (
            <div key={folder.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-2xs">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                📁 {folder.title}
              </h2>
              <div className="space-y-1">
                {folder.children && folder.children.length > 0 ? (
                  folder.children.map((bm) =>
                    bm.url ? (
                      <a
                        key={bm.id}
                        href={bm.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-1.5 rounded-md hover:bg-gray-100 transition truncate text-sm text-blue-600 font-medium"
                      >
                        {bm.title || bm.url}
                      </a>
                    ) : (
                      <div key={bm.id} className="text-xs text-gray-400 italic py-0.5">
                        📂 {bm.title} ({bm.children?.length || 0} items)
                      </div>
                    )
                  )
                ) : (
                  <p className="text-xs text-gray-400 italic">Folder is empty</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Quick Action */}
      <div className="p-3 bg-white border-t border-gray-200">
        <button
          onClick={handleBookmarkCurrentTab}
          className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition text-white ${
            savedStatus ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {savedStatus ? '✓ Saved Page!' : 'Bookmark Current Tab'}
        </button>
      </div>
    </div>
  );
}