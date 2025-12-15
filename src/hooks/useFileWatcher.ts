import { useEffect, useRef, useCallback } from 'react';

interface UseFileWatcherOptions {
  enabled?: boolean;
  onFileChange: () => void;
}

/**
 * Custom hook for watching local file changes via IPC.
 * Automatically sets up and tears down file watchers.
 */
export function useFileWatcher(filepath: string | null, options: UseFileWatcherOptions) {
  const { enabled = true, onFileChange } = options;
  const watcherIdRef = useRef<string | null>(null);
  const onFileChangeRef = useRef(onFileChange);

  // Keep callback ref updated
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

  // Setup file watcher
  useEffect(() => {
    if (!enabled || !filepath) return;

    // Only watch local files (not http/https URLs)
    if (filepath.startsWith('http://') || filepath.startsWith('https://')) {
      return;
    }

    // Clean filepath (remove file:// prefix if present)
    const cleanPath = filepath.replace(/^file:\/\//, '');

    // Track if component is still mounted to prevent race condition
    let isMounted = true;

    const setupWatcher = async () => {
      const result = await window.electron?.watchFile(cleanPath);
      // Only set watcherId if still mounted (prevents orphaned watcher)
      if (isMounted && result?.success && result.watcherId) {
        watcherIdRef.current = result.watcherId;
        console.log('[Preview] Watching file:', cleanPath);
      } else if (!isMounted && result?.success && result.watcherId) {
        // Component unmounted during setup - clean up the watcher we just created
        window.electron?.unwatchFile(result.watcherId);
      }
    };

    setupWatcher();

    // Cleanup on unmount or filepath change
    return () => {
      isMounted = false;
      if (watcherIdRef.current) {
        window.electron?.unwatchFile(watcherIdRef.current);
        console.log('[Preview] Stopped watching file');
        watcherIdRef.current = null;
      }
    };
  }, [filepath, enabled]);

  // Listen for file change events
  useEffect(() => {
    if (!enabled) return;

    const cleanup = window.electron?.onFileChanged((changedPath) => {
      console.log('[Preview] File changed:', changedPath);
      onFileChangeRef.current();
    });

    return () => cleanup?.();
  }, [enabled]);

  // Manual refresh function
  const refresh = useCallback(() => {
    onFileChangeRef.current();
  }, []);

  return { refresh };
}

export default useFileWatcher;
