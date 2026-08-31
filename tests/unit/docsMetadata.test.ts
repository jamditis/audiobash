import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(import.meta.dirname, '..', '..');

function readDocument(relativePath: string): Document {
  const html = readFileSync(join(rootDirectory, relativePath), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function metaContent(document: Document, selector: string): string | null {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

describe('public release-page metadata', () => {
  const pages = [
    ['docs/index.html', 'https://audiobash.app/', 'website'],
    ['docs/about.html', 'https://audiobash.app/about.html', 'website'],
    ['docs/blog.html', 'https://audiobash.app/blog.html', 'website'],
    [
      'docs/blog/anthropic-added-voice.html',
      'https://audiobash.app/blog/anthropic-added-voice.html',
      'article',
    ],
    [
      'docs/blog/end-user-testing.html',
      'https://audiobash.app/blog/end-user-testing.html',
      'article',
    ],
    [
      'docs/blog/first-real-user.html',
      'https://audiobash.app/blog/first-real-user.html',
      'article',
    ],
    [
      'docs/blog/why-i-built-a-voice-terminal.html',
      'https://audiobash.app/blog/why-i-built-a-voice-terminal.html',
      'article',
    ],
    ['docs/latest.html', 'https://audiobash.app/latest.html', 'website'],
    ['docs/macos.html', 'https://audiobash.app/macos.html', 'website'],
    ['docs/releases.html', 'https://audiobash.app/releases.html', 'website'],
    ['docs/manual.html', 'https://audiobash.app/manual.html', 'website'],
  ] as const;

  it.each(pages)(
    'provides complete social metadata in %s',
    (relativePath, expectedUrl, expectedType) => {
      const document = readDocument(relativePath);
      const expectedImage = 'https://audiobash.app/og-image.png';

      expect(metaContent(document, 'meta[property="og:title"]')).toBeTruthy();
      expect(metaContent(document, 'meta[property="og:description"]')).toBeTruthy();
      expect(metaContent(document, 'meta[property="og:type"]')).toBe(expectedType);
      expect(metaContent(document, 'meta[property="og:url"]')).toBe(expectedUrl);
      expect(metaContent(document, 'meta[property="og:image"]')).toBe(expectedImage);
      expect(metaContent(document, 'meta[property="og:image:width"]')).toBe('1200');
      expect(metaContent(document, 'meta[property="og:image:height"]')).toBe('630');
      expect(metaContent(document, 'meta[property="og:image:alt"]')).toBeTruthy();
      expect(metaContent(document, 'meta[name="twitter:card"]')).toBe('summary_large_image');
      expect(metaContent(document, 'meta[name="twitter:title"]')).toBeTruthy();
      expect(metaContent(document, 'meta[name="twitter:description"]')).toBeTruthy();
      expect(metaContent(document, 'meta[name="twitter:image"]')).toBe(expectedImage);
      expect(metaContent(document, 'meta[name="twitter:image:alt"]')).toBeTruthy();

      const favicon = document.querySelector<HTMLLinkElement>(
        'link[rel="icon"][type="image/svg+xml"]',
      );
      expect(favicon?.getAttribute('href')).toBe(
        relativePath.startsWith('docs/blog/') ? '../favicon.svg' : 'favicon.svg',
      );
    },
  );

  it('keeps the shared favicon and social image in the published docs root', () => {
    expect(existsSync(join(rootDirectory, 'docs/favicon.svg'))).toBe(true);
    expect(existsSync(join(rootDirectory, 'docs/og-image.png'))).toBe(true);
  });

  it('uses the public domain in discovery files', () => {
    for (const relativePath of ['docs/sitemap.xml', 'docs/robots.txt', 'docs/llms.txt']) {
      const contents = readFileSync(join(rootDirectory, relativePath), 'utf8');
      expect(contents).toContain('https://audiobash.app');
      expect(contents).not.toContain('jamditis.github.io');
    }
  });

  it('lists every public HTML page in the sitemap', () => {
    const sitemap = readFileSync(join(rootDirectory, 'docs/sitemap.xml'), 'utf8');
    const publicUrls = [
      'https://audiobash.app/',
      'https://audiobash.app/about.html',
      'https://audiobash.app/blog.html',
      'https://audiobash.app/blog/anthropic-added-voice.html',
      'https://audiobash.app/blog/end-user-testing.html',
      'https://audiobash.app/blog/first-real-user.html',
      'https://audiobash.app/blog/why-i-built-a-voice-terminal.html',
      'https://audiobash.app/latest.html',
      'https://audiobash.app/macos.html',
      'https://audiobash.app/manual.html',
      'https://audiobash.app/releases.html',
    ];

    for (const url of publicUrls) expect(sitemap).toContain(`<loc>${url}</loc>`);
    expect(sitemap.match(/<loc>/g)).toHaveLength(publicUrls.length);
  });

  it('includes Linux in homepage sharing and machine-readable product copy', () => {
    const homepage = readDocument('docs/index.html');
    expect(metaContent(homepage, 'meta[name="description"]')).toMatch(/Linux/);
    expect(metaContent(homepage, 'meta[property="og:description"]')).toMatch(/Linux/);
    expect(metaContent(homepage, 'meta[name="twitter:description"]')).toMatch(/Linux/);
    expect(readFileSync(join(rootDirectory, 'docs/llms.txt'), 'utf8')).toMatch(
      /Windows.*macOS.*Linux/,
    );
    expect(readFileSync(join(rootDirectory, 'scripts/generate-og-image.py'), 'utf8')).toContain(
      'Windows, macOS, and Linux.',
    );
  });
});
