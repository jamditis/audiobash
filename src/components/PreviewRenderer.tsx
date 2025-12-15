import React, { useState, useEffect, useMemo } from 'react';
import { PreviewContentType } from '../types';

interface PreviewRendererProps {
  url: string;
  refreshKey: number;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

// Detect content type from URL
function detectContentType(url: string): PreviewContentType {
  const urlLower = url.toLowerCase();

  // Localhost URLs
  if (urlLower.startsWith('http://localhost') || urlLower.startsWith('http://127.0.0.1')) {
    return 'localhost';
  }

  // Images
  if (urlLower.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)(\?.*)?$/)) {
    return 'image';
  }

  // Markdown
  if (urlLower.match(/\.(md|markdown)(\?.*)?$/)) {
    return 'markdown';
  }

  // HTML files
  if (urlLower.match(/\.html?(\?.*)?$/)) {
    return 'html';
  }

  // HTTP/HTTPS URLs default to HTML
  if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
    return 'html';
  }

  // File paths - try to detect by extension
  if (urlLower.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)$/)) {
    return 'image';
  }

  if (urlLower.match(/\.(md|markdown)$/)) {
    return 'markdown';
  }

  return 'unknown';
}

// Safe URL protocols for markdown links
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'ftp:'];

// Sanitize URL to prevent XSS attacks
function sanitizeUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (SAFE_URL_PROTOCOLS.includes(urlObj.protocol)) {
      return url;
    }
  } catch {
    // Relative URLs are okay
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      return url;
    }
  }
  return null; // Invalid or dangerous URL
}

// Simple markdown to HTML conversion (basic, no dependencies)
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links (with XSS protection)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, linkUrl) => {
      const safeUrl = sanitizeUrl(linkUrl);
      if (safeUrl) {
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      }
      return linkText; // Unsafe URL, just return text
    })
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<div class="markdown-body"><p>${html}</p></div>`;
}

// Error display component
const ErrorDisplay: React.FC<{ message: string; url: string }> = ({ message, url }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <div className="text-accent text-4xl mb-4">⚠</div>
    <div className="text-crt-white/70 font-mono text-sm mb-2">Failed to load preview</div>
    <div className="text-crt-white/40 font-mono text-xs max-w-md break-all">{url}</div>
    <div className="text-accent/70 font-mono text-xs mt-2">{message}</div>
  </div>
);

// Loading display component
const LoadingDisplay: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
    <div className="text-crt-white/50 font-mono text-xs">Loading preview...</div>
  </div>
);

// Unknown type display
const UnknownTypeDisplay: React.FC<{ url: string }> = ({ url }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <div className="text-crt-white/30 text-4xl mb-4">?</div>
    <div className="text-crt-white/70 font-mono text-sm mb-2">Unknown content type</div>
    <div className="text-crt-white/40 font-mono text-xs max-w-md break-all">{url}</div>
    <div className="text-crt-white/30 font-mono text-xs mt-4">
      Supported: HTML, localhost URLs, images, markdown
    </div>
  </div>
);

const PreviewRenderer: React.FC<PreviewRendererProps> = ({
  url,
  refreshKey,
  onLoad,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');

  const contentType = useMemo(() => detectContentType(url), [url]);

  // Prepare URL for iframe (add file:// for local paths)
  const preparedUrl = useMemo(() => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
      return url;
    }
    // Assume local file path
    return `file://${url}`;
  }, [url]);

  // Load markdown content
  useEffect(() => {
    if (contentType !== 'markdown') return;

    setIsLoading(true);
    setError(null);

    const loadMarkdown = async () => {
      try {
        // For local files, we need to fetch via file://
        const response = await fetch(preparedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        setMarkdownContent(renderMarkdown(text));
        setIsLoading(false);
        onLoad?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load markdown');
        setIsLoading(false);
        onError?.(err instanceof Error ? err.message : 'Failed to load markdown');
      }
    };

    loadMarkdown();
  }, [contentType, preparedUrl, refreshKey, onLoad, onError]);

  // Reset loading state when URL changes
  useEffect(() => {
    if (contentType !== 'markdown') {
      setIsLoading(true);
      setError(null);
    }
  }, [url, refreshKey, contentType]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleIframeError = () => {
    setError('Failed to load content');
    setIsLoading(false);
    onError?.('Failed to load content');
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleImageError = () => {
    setError('Failed to load image');
    setIsLoading(false);
    onError?.('Failed to load image');
  };

  // Empty URL state
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-crt-white/20 text-4xl mb-4">◉</div>
        <div className="text-crt-white/40 font-mono text-sm">Enter a URL or file path above</div>
        <div className="text-crt-white/20 font-mono text-xs mt-2">
          Supports: localhost, HTML files, images, markdown
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return <ErrorDisplay message={error} url={url} />;
  }

  // Render based on content type
  switch (contentType) {
    case 'html':
    case 'localhost':
      return (
        <div className="relative h-full">
          {isLoading && <LoadingDisplay />}
          <iframe
            key={`${preparedUrl}-${refreshKey}`}
            src={preparedUrl}
            className={`w-full h-full border-0 bg-white ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Preview"
          />
        </div>
      );

    case 'image':
      return (
        <div className="relative h-full flex items-center justify-center bg-void-200 p-4 overflow-auto">
          {isLoading && <LoadingDisplay />}
          <img
            key={`${preparedUrl}-${refreshKey}`}
            src={preparedUrl}
            alt="Preview"
            className={`max-w-full max-h-full object-contain ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      );

    case 'markdown':
      return (
        <div className="h-full overflow-auto bg-void-200 p-6">
          {isLoading ? (
            <LoadingDisplay />
          ) : (
            <div
              className="prose prose-invert prose-sm max-w-none font-mono text-crt-white/90"
              style={{
                // Basic markdown styles
                lineHeight: '1.6',
              }}
              dangerouslySetInnerHTML={{ __html: markdownContent }}
            />
          )}
        </div>
      );

    case 'unknown':
    default:
      return <UnknownTypeDisplay url={url} />;
  }
};

export default PreviewRenderer;
