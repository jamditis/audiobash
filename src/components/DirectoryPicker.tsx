import React, { useState, useEffect, useCallback } from 'react';

interface DirectoryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId: string;
}

const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const BrowseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const DirectoryPicker: React.FC<DirectoryPickerProps> = ({ isOpen, onClose, activeTabId }) => {
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [favoriteDirs, setFavoriteDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirectories = useCallback(async () => {
    const dirs = await window.electron?.getDirectories();
    if (dirs) {
      setRecentDirs(dirs.recent || []);
      setFavoriteDirs(dirs.favorites || []);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDirectories();
    }
  }, [isOpen, loadDirectories]);

  const handleCdTo = async (dir: string) => {
    setLoading(true);
    await window.electron?.cdToDirectory(activeTabId, dir);
    setLoading(false);
    onClose();
  };

  const handleToggleFavorite = async (dir: string, isFavorite: boolean) => {
    if (isFavorite) {
      await window.electron?.removeFavoriteDirectory(dir);
    } else {
      await window.electron?.addFavoriteDirectory(dir);
    }
    loadDirectories();
  };

  const handleBrowse = async () => {
    const result = await window.electron?.browseDirectory();
    if (result?.success && result.path) {
      await handleCdTo(result.path);
    }
  };

  const getDirName = (fullPath: string) => {
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1] || fullPath;
  };

  if (!isOpen) return null;

  return (
    <div className="directory-picker-container">
      <div className="directory-picker bg-void-100 border border-void-300 rounded-lg shadow-2xl w-80 max-h-96 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-void-300 bg-void-200/50">
          <span className="text-[10px] font-mono uppercase tracking-widest text-crt-white/50">
            Quick navigate
          </span>
          <button
            onClick={onClose}
            className="p-1 text-crt-white/30 hover:text-crt-white/50 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Browse button */}
        <div className="p-2 border-b border-void-300">
          <button
            onClick={handleBrowse}
            disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono border border-dashed border-void-300 rounded hover:border-accent/50 hover:text-accent transition-colors text-crt-white/70"
          >
            <BrowseIcon />
            Browse for folder...
          </button>
        </div>

        {/* Favorites */}
        {favoriteDirs.length > 0 && (
          <div className="border-b border-void-300">
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-crt-amber/70 bg-void-200/30">
              Favorites
            </div>
            <div className="max-h-32 overflow-y-auto">
              {favoriteDirs.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-void-200/50 group"
                >
                  <button
                    onClick={() => handleCdTo(dir)}
                    disabled={loading}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <FolderIcon />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-crt-white truncate">
                        {getDirName(dir)}
                      </div>
                      <div className="text-[9px] text-crt-white/30 truncate">
                        {dir}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleToggleFavorite(dir, true)}
                    className="p-1 text-crt-amber opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from favorites"
                  >
                    <StarIcon filled={true} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent */}
        <div>
          <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-crt-white/40 bg-void-200/30">
            Recent
          </div>
          <div className="max-h-48 overflow-y-auto">
            {recentDirs.length === 0 ? (
              <div className="px-3 py-4 text-xs text-crt-white/30 text-center">
                No recent directories
              </div>
            ) : (
              recentDirs.map((dir) => {
                const isFavorite = favoriteDirs.includes(dir);
                return (
                  <div
                    key={dir}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-void-200/50 group"
                  >
                    <button
                      onClick={() => handleCdTo(dir)}
                      disabled={loading}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <FolderIcon />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-crt-white truncate">
                          {getDirName(dir)}
                        </div>
                        <div className="text-[9px] text-crt-white/30 truncate">
                          {dir}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleToggleFavorite(dir, isFavorite)}
                      className={`p-1 transition-opacity ${
                        isFavorite
                          ? 'text-crt-amber'
                          : 'text-crt-white/30 opacity-0 group-hover:opacity-100'
                      }`}
                      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <StarIcon filled={isFavorite} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectoryPicker;
