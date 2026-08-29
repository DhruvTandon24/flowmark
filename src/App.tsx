import React, { useState, useEffect } from 'react';

interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkItem[];
  path?: string;
  parentId?: string;
}

type ModalType = 'none' | 'settings' | 'addFolder' | 'addBookmark' | 'editBookmark' | 'editFolder' | 'deleteItem';
type ThemeType = 'light' | 'dark' | 'system';
type ViewModeType = 'popup' | 'sidebar';

// Detect if Chrome launched us as a side panel via the manifest URL parameter
const isSidebar = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'sidebar';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [recentBookmarks, setRecentBookmarks] = useState<BookmarkItem[]>([]);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // --- Traversal State ---
  const [currentFolder, setCurrentFolder] = useState<BookmarkItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string, title: string}[]>([]);

  // --- Preferences State ---
  const [theme, setTheme] = useState<ThemeType>(() => (localStorage.getItem('fm_theme') as ThemeType) || 'system');
  const [effectiveTheme, setEffectiveTheme] = useState<'light'|'dark'>('dark');
  const [isCompact, setIsCompact] = useState(() => localStorage.getItem('fm_compact') === 'true');
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('fm_newtab') !== 'false');
  const [viewMode, setViewMode] = useState<ViewModeType>(() => (localStorage.getItem('fm_viewMode') as ViewModeType) || 'popup');
  
  useEffect(() => { localStorage.setItem('fm_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('fm_compact', String(isCompact)); }, [isCompact]);
  useEffect(() => { localStorage.setItem('fm_newtab', String(openInNewTab)); }, [openInNewTab]);
  useEffect(() => { localStorage.setItem('fm_viewMode', viewMode); }, [viewMode]);

  // --- View Mode Engine Switcher ---
  // Tells Chrome to re-route the extension icon click & Alt+B shortcut
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.action && chrome.sidePanel) {
      if (viewMode === 'sidebar') {
        chrome.action.setPopup({ popup: '' }); // Disables popup
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
      } else {
        chrome.action.setPopup({ popup: 'index.html' }); // Re-enables popup
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
      }
    }
  }, [viewMode]);

  // --- Tri-State Theme Engine ---
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      if (theme === 'system') {
        setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setEffectiveTheme(theme);
      }
    };
    updateTheme();
    const listener = () => updateTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  // --- Modal & Form State ---
  const [modalType, setModalType] = useState<ModalType>('none');
  const [activeItem, setActiveItem] = useState<BookmarkItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [formParentId, setFormParentId] = useState('1');

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
      // PATCHED: Changed currentWindow to lastFocusedWindow to catch the actual browser tab
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].title) {
          setActiveTab({ title: tabs[0].title, url: tabs[0].url });
        }
      });
    }
  }, []);

  // --- Auto-Sync UI for Folders ---
  useEffect(() => {
    if (currentFolder && bookmarks.length > 0) {
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
      const updatedFolder = findFolder(bookmarks, currentFolder.id);
      if (updatedFolder) {
        setCurrentFolder(updatedFolder);
      }
    }
  }, [bookmarks]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, currentFolder]);

  // --- Link Routing Engine ---
  const handleOpenLink = (url: string) => {
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.update({ url });
      } else {
        window.location.href = url;
      }
    }
  };

  // --- CRUD Operations ---
  const handleSaveCurrentTab = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks && activeTab) {
      const parentId = currentFolder ? currentFolder.id : '1';
      chrome.bookmarks.create({ parentId, title: activeTab.title, url: activeTab.url }, () => {
        setCreateMenuOpen(false);
        fetchBookmarks();
      });
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;

    if (modalType === 'addFolder') {
      chrome.bookmarks.create({ parentId: formParentId, title: formTitle }, fetchBookmarks);
    } else if (modalType === 'addBookmark') {
      chrome.bookmarks.create({ parentId: formParentId, title: formTitle, url: formUrl }, fetchBookmarks);
    } else if (modalType === 'editBookmark' || modalType === 'editFolder') {
      if (activeItem) {
        chrome.bookmarks.update(activeItem.id, { title: formTitle, url: formUrl || undefined }, fetchBookmarks);
      }
    } else if (modalType === 'deleteItem' && activeItem) {
      if (activeItem.url) {
        chrome.bookmarks.remove(activeItem.id, fetchBookmarks);
      } else {
        chrome.bookmarks.removeTree(activeItem.id, fetchBookmarks);
      }
    }
    
    closeModal();
  };

  const handleQuickDelete = (item: BookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveItem(item);
    setModalType('deleteItem');
  };

  const openEditModal = (item: BookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveItem(item);
    setFormTitle(item.title);
    setFormUrl(item.url || '');
    setModalType(item.url ? 'editBookmark' : 'editFolder');
  };

  const closeModal = () => {
    setModalType('none');
    setActiveItem(null);
    setFormTitle('');
    setFormUrl('');
  };

  const flattenBookmarks = (nodes: BookmarkItem[], currentPath = ''): BookmarkItem[] => {
    let list: BookmarkItem[] = [];
    nodes.forEach((node) => {
      const nodePath = currentPath ? `${currentPath} / ${node.title}` : node.title;
      if (node.url) {
        list.push({ ...node, path: currentPath });
      }
      if (node.children) {
        list = list.concat(flattenBookmarks(node.children, nodePath));
      }
    });
    return list;
  };

  const getFolderList = (nodes: BookmarkItem[], depth = 0): { id: string, title: string, depth: number }[] => {
    let folders: { id: string, title: string, depth: number }[] = [];
    nodes.forEach(node => {
      if (!node.url) {
        folders.push({ id: node.id, title: node.title || 'Untitled', depth });
        if (node.children) {
          folders = folders.concat(getFolderList(node.children, depth + 1));
        }
      }
    });
    return folders;
  };
  const allFolders = getFolderList(bookmarks);

  let visibleItems: BookmarkItem[] = [];
  
  const sortFoldersFirst = (items: BookmarkItem[]) => {
    return [...items].sort((a, b) => {
      const aIsFolder = !a.url;
      const bIsFolder = !b.url;
      if (aIsFolder && !bIsFolder) return -1; 
      if (!aIsFolder && bIsFolder) return 1;  
      return (a.title || '').localeCompare(b.title || '');
    });
  };

  if (searchQuery.trim()) {
    const allBookmarks = flattenBookmarks(bookmarks);
    const query = searchQuery.toLowerCase();
    const searchResults = allBookmarks.filter((b) =>
      b.title.toLowerCase().includes(query) || (b.url && b.url.toLowerCase().includes(query))
    );
    visibleItems = sortFoldersFirst(searchResults);
  } else if (currentFolder) {
    visibleItems = sortFoldersFirst(currentFolder.children || []);
  } else {
    visibleItems = [...recentBookmarks, ...sortFoldersFirst(bookmarks)];
  }

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

  // --- Keyboard & App Navigation ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalType !== 'none') {
        if (e.key === 'Escape') closeModal();
        return;
      }
      if (createMenuOpen && e.key === 'Escape') {
        setCreateMenuOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        if (searchQuery) {
          e.preventDefault();
          setSearchQuery('');
        } else if (currentFolder) {
          e.preventDefault();
          handleGoBack(breadcrumbs.length - 2);
        }
        return;
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
          if (selectedItem.url) handleOpenLink(selectedItem.url);
          else handleOpenFolder(selectedItem);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, selectedIndex, searchQuery, currentFolder, breadcrumbs, modalType, createMenuOpen, openInNewTab]);

  const themeVars = effectiveTheme === 'dark' ? {
    '--bg-main': '#202124',
    '--bg-overlay': 'rgba(0,0,0,0.5)',
    '--bg-hover': '#35363a',
    '--bg-active': 'rgba(138, 180, 248, 0.08)',
    '--border-divider': '#3c4043',
    '--text-primary': '#e8eaed',
    '--text-secondary': '#9aa0a6',
    '--accent': '#8ab4f8',
    '--danger': '#f28b82',
  } : {
    '--bg-main': '#ffffff',
    '--bg-overlay': 'rgba(0,0,0,0.2)',
    '--bg-hover': '#f1f3f4',
    '--bg-active': 'rgba(26, 115, 232, 0.08)',
    '--border-divider': '#dadce0',
    '--text-primary': '#202124',
    '--text-secondary': '#5f6368',
    '--accent': '#1a73e8',
    '--danger': '#d93025',
  };

  return (
    <div 
      // Responsive Container: 100% width in Side Panel, strictly 800x600 in Popup
      className={`relative flex flex-col overflow-hidden transition-colors duration-150 ${isSidebar ? 'w-full h-screen' : 'w-[800px] h-[600px]'}`}
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
            onClick={() => { setModalType('settings'); setCreateMenuOpen(false); }}
            className="p-1.5 rounded-md ml-2 transition-colors cursor-pointer shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
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
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-200">
            {searchQuery ? (
              <>
                <svg className="w-10 h-10 mb-3 opacity-20" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>No bookmarks found</p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mb-3 opacity-20" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>This folder is empty</p>
              </>
            )}
          </div>
        ) : (
          <div className={isCompact ? "space-y-0" : "space-y-0.5"}>
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
                  <div 
                    className={`group flex items-center justify-between px-3 ${isCompact ? 'py-1.5' : 'py-2.5'} rounded-md transition-colors cursor-pointer relative`}
                    style={{ backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent' }}
                    onClick={() => isFolder ? handleOpenFolder(item) : handleOpenLink(item.url as string)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-md" style={{ backgroundColor: 'var(--accent)' }} />}
                    
                    <div className="flex items-center overflow-hidden flex-1 min-w-0 pr-2">
                      {isFolder ? (
                        <svg className="w-4 h-4 shrink-0 opacity-70" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                      ) : (
                        <img src={`https://www.google.com/s2/favicons?domain=${item.url}&sz=32`} alt="" className="w-4 h-4 rounded-sm shrink-0 grayscale-[20%] group-hover:grayscale-0 transition-all" />
                      )}
                      
                      <div className="ml-3 flex flex-col overflow-hidden w-full">
                        <p className="text-[13px] font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>{item.title || item.url}</p>
                        {!isFolder && (
                          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                            {searchQuery && item.path && (
                              <span className="text-[10px] px-1.5 py-[1px] rounded shrink-0 opacity-80" style={{ backgroundColor: effectiveTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                                {item.path}
                              </span>
                            )}
                            <p className="text-[12px] truncate opacity-70" style={{ color: 'var(--text-secondary)' }}>{item.url}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hover Actions: Edit & Delete */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                      <button 
                        onClick={(e) => openEditModal(item, e)}
                        className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                      </button>
                      <button 
                        onClick={(e) => handleQuickDelete(item, e)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  </div>
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
        </div>

        {/* Global Create Menu */}
        <div className="relative">
          <button
            onClick={() => { setCreateMenuOpen(!createMenuOpen); closeModal(); }}
            className="flex items-center px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer"
            style={{ backgroundColor: createMenuOpen ? 'var(--bg-active)' : 'transparent', color: 'var(--accent)' }}
            onMouseEnter={(e) => { if(!createMenuOpen) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { if(!createMenuOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            Create
          </button>
          
          {createMenuOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg shadow-xl py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-divider)' }}>
              {activeTab ? (
                <button onClick={handleSaveCurrentTab} className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  Save Current Tab
                </button>
              ) : (
                <div className="w-full text-left px-4 py-2 text-[13px] opacity-50 cursor-not-allowed italic" style={{ color: 'var(--text-secondary)' }}>
                  Cannot save this page
                </div>
              )}
              <button onClick={() => { setModalType('addBookmark'); setFormParentId(currentFolder ? currentFolder.id : '1'); setCreateMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                New Bookmark
              </button>
              <button onClick={() => { setModalType('addFolder'); setFormParentId(currentFolder ? currentFolder.id : '1'); setCreateMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                New Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- Unified Modal Overlay --- */}
      {modalType !== 'none' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center animate-in fade-in duration-150" style={{ backgroundColor: 'var(--bg-overlay)' }} onClick={closeModal}>
          <div 
            className="w-[340px] rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto hide-scrollbar" 
            style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-divider)' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            
            {/* Professional Settings Center */}
            {modalType === 'settings' && (
              <div className="p-5 flex flex-col gap-6">
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Preferences</h2>
                
                {/* Appearance Section */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Appearance</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Default View</span>
                      <select 
                        value={viewMode} 
                        onChange={(e) => setViewMode(e.target.value as ViewModeType)}
                        className="px-2 py-1 rounded-md text-[12px] font-medium outline-none cursor-pointer border"
                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', borderColor: 'var(--border-divider)' }}
                      >
                        <option value="popup">Popup Mode</option>
                        <option value="sidebar">Side Panel Mode</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Theme Mode</span>
                      <select 
                        value={theme} 
                        onChange={(e) => setTheme(e.target.value as ThemeType)}
                        className="px-2 py-1 rounded-md text-[12px] font-medium outline-none cursor-pointer border"
                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', borderColor: 'var(--border-divider)' }}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="system">System Default</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Compact Layout</span>
                      <button 
                        onClick={() => setIsCompact(!isCompact)} 
                        className="px-3 py-1 rounded text-[12px] font-medium transition-colors border" 
                        style={{ 
                          backgroundColor: isCompact ? 'var(--accent)' : 'var(--bg-hover)', 
                          color: isCompact ? '#ffffff' : 'var(--text-primary)',
                          borderColor: isCompact ? 'transparent' : 'var(--border-divider)' 
                        }}
                      >
                        {isCompact ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Behavior Section */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Behavior</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Open links in new tab</span>
                    <button 
                      onClick={() => setOpenInNewTab(!openInNewTab)} 
                      className="px-3 py-1 rounded text-[12px] font-medium transition-colors border" 
                      style={{ 
                        backgroundColor: openInNewTab ? 'var(--accent)' : 'var(--bg-hover)', 
                        color: openInNewTab ? '#ffffff' : 'var(--text-primary)',
                        borderColor: openInNewTab ? 'transparent' : 'var(--border-divider)' 
                      }}
                    >
                      {openInNewTab ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Keyboard Shortcuts Section */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Keyboard Shortcuts</h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <kbd className="px-1.5 py-0.5 rounded border font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>↑ ↓</kbd> Navigate List
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <kbd className="px-1.5 py-0.5 rounded border font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>↵</kbd> Open Item
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <kbd className="px-1.5 py-0.5 rounded border font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Esc</kbd> Go Back / Close
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <kbd className="px-1.5 py-0.5 rounded border font-mono text-[10px]" style={{ borderColor: 'var(--border-divider)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Alt+B</kbd> FlowMark
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Universal Delete Confirmation Modal */}
            {modalType === 'deleteItem' && (
              <div className="p-5">
                <h2 className="text-[14px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Confirm Deletion</h2>
                <p className="text-[13px] mb-5" style={{ color: 'var(--text-secondary)' }}>
                  {activeItem?.url 
                    ? `Are you sure you want to delete this bookmark: "${activeItem.title}"?`
                    : `Are you sure you want to delete the folder "${activeItem?.title}" and all its contents?`}
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={closeModal} className="px-4 py-2 text-[13px] font-medium rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Cancel</button>
                  <button onClick={handleSubmitForm} className="px-4 py-2 text-[13px] font-medium rounded-md text-white transition-colors" style={{ backgroundColor: 'var(--danger)' }}>Delete</button>
                </div>
              </div>
            )}

            {/* Form Modals (Add/Edit Bookmark/Folder) */}
            {(modalType === 'addFolder' || modalType === 'addBookmark' || modalType === 'editBookmark' || modalType === 'editFolder') && (
              <form onSubmit={handleSubmitForm} onKeyDown={(e) => e.stopPropagation()} className="p-5 flex flex-col gap-3">
                <h2 className="text-[14px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {modalType.includes('add') ? 'Create New ' : 'Edit '}
                  {modalType.toLowerCase().includes('folder') ? 'Folder' : 'Bookmark'}
                </h2>
                
                <div>
                  <label className="block text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label>
                  <input 
                    autoFocus 
                    type="text" 
                    value={formTitle} 
                    onChange={(e) => setFormTitle(e.target.value)} 
                    className="w-full px-3 py-2 rounded-md text-[13px] outline-none" 
                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid transparent' }} 
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'transparent'}
                    required 
                  />
                </div>

                {modalType.toLowerCase().includes('bookmark') && (
                  <div>
                    <label className="block text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>URL</label>
                    <input 
                      type="url" 
                      value={formUrl} 
                      onChange={(e) => setFormUrl(e.target.value)} 
                      className="w-full px-3 py-2 rounded-md text-[13px] outline-none" 
                      style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid transparent' }} 
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'transparent'}
                      required 
                    />
                  </div>
                )}

                {(modalType === 'addBookmark' || modalType === 'addFolder') && (
                  <div>
                    <label className="block text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Save Location</label>
                    <select
                      value={formParentId}
                      onChange={(e) => setFormParentId(e.target.value)}
                      className="w-full px-3 py-2 rounded-md text-[13px] outline-none appearance-none cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid transparent' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'transparent'}
                    >
                      {allFolders.map(folder => (
                        <option key={folder.id} value={folder.id}>
                          {'\u00A0'.repeat(folder.depth * 4)}{folder.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2 justify-end mt-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 text-[13px] font-medium rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-[13px] font-medium rounded-md text-white transition-colors" style={{ backgroundColor: 'var(--accent)' }}>Save</button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </div>
  );
} 