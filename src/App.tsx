import React, { useState, useEffect } from 'react';

interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkItem[];
  path?: string;
  parentId?: string;
}

type ModalType = 'none' | 'settings' | 'addFolder' | 'addBookmark' | 'editBookmark' | 'editFolder' | 'deleteFolder';

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
  const [theme, setTheme] = useState<'light'|'dark'>(() => (localStorage.getItem('fm_theme') as 'light'|'dark') || 'dark');
  const [isCompact, setIsCompact] = useState(() => localStorage.getItem('fm_compact') === 'true');
  
  useEffect(() => { localStorage.setItem('fm_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('fm_compact', String(isCompact)); }, [isCompact]);

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
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].title) {
          setActiveTab({ title: tabs[0].title, url: tabs[0].url });
        }
      });
    }
  }, []);

  // --- Auto-Sync UI for Folders (Fixes the "Create not working" bug) ---
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
    e.stopPropagation(); // Traps Enter key
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;

    if (modalType === 'addFolder') {
      chrome.bookmarks.create({ parentId: formParentId, title: formTitle }, fetchBookmarks);
    } else if (modalType === 'addBookmark') {
      chrome.bookmarks.create({ parentId: formParentId, title: formTitle, url: formUrl }, fetchBookmarks);
    } else if (modalType === 'editBookmark' || modalType === 'editFolder') {
      if (activeItem) {
        chrome.bookmarks.update(activeItem.id, { title: formTitle, url: formUrl || undefined }, fetchBookmarks);
      }
    } else if (modalType === 'deleteFolder' && activeItem) {
      chrome.bookmarks.removeTree(activeItem.id, fetchBookmarks);
    }
    
    closeModal();
  };

  const handleQuickDelete = (item: BookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;
    
    if (!item.url) {
      setActiveItem(item);
      setModalType('deleteFolder');
    } else {
      chrome.bookmarks.remove(item.id, fetchBookmarks);
    }
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

  // --- Folder Extraction Engine for Dropdown ---
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

  // --- Exact Search Match Engine & Sorting ---
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
    // INSIDE A FOLDER: Push folders to top, then alphabetize
    visibleItems = sortFoldersFirst(currentFolder.children || []);
  } else {
    // HOME SCREEN: 5 Recents pinned untouched, followed by standard root folders
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
      // Modal override
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
          if (selectedItem.url) window.open(selectedItem.url, '_blank');
          else handleOpenFolder(selectedItem);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, selectedIndex, searchQuery, currentFolder, breadcrumbs, modalType, createMenuOpen]);

  // Strict Native Chrome Palette
  const themeVars = theme === 'dark' ? {
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
      className="relative flex flex-col w-[800px] h-[600px] overflow-hidden transition-colors duration-150"
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
                    onClick={() => isFolder ? handleOpenFolder(item) : window.open(item.url, '_blank')}
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
                              <span className="text-[10px] px-1.5 py-[1px] rounded shrink-0 opacity-80" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
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
              <button onClick={handleSaveCurrentTab} className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                Save Current Tab
              </button>
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
            className="w-[340px] rounded-xl shadow-2xl overflow-hidden" 
            style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-divider)' }}
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Settings Modal */}
            {modalType === 'settings' && (
              <div className="p-5">
                <h2 className="text-[14px] font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Preferences</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Dark Theme</span>
                    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="px-3 py-1 rounded text-[12px] font-medium transition-colors" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                      {theme === 'dark' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>Compact Layout</span>
                    <button onClick={() => setIsCompact(!isCompact)} className="px-3 py-1 rounded text-[12px] font-medium transition-colors" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                      {isCompact ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Folder Delete Confirmation Modal */}
            {modalType === 'deleteFolder' && (
              <div className="p-5">
                <h2 className="text-[14px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Delete Folder</h2>
                <p className="text-[13px] mb-5" style={{ color: 'var(--text-secondary)' }}>Are you sure you want to delete "{activeItem?.title}" and all its contents?</p>
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

                {/* New Destination Folder Selector */}
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