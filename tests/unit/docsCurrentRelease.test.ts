import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(import.meta.dirname, '..', '..');

function readDocument(name: string): Document {
  return new DOMParser().parseFromString(
    readFileSync(join(rootDirectory, 'docs', name), 'utf8'),
    'text/html',
  );
}

describe('v3.4.0 public release copy', () => {
  it('leads the latest page with the verified stability release', () => {
    const document = readDocument('latest.html');
    const firstEntry = document.querySelector('article.update-card');
    const text = firstEntry?.textContent ?? '';

    expect(text).toContain('v3.4.0');
    expect(text).toContain('August 2026');
    expect(text).toContain('LATEST');
    expect(text).toContain('Electron 43.4.1');
    expect(text).toContain('Job Object');
    expect(text).toContain('51.5%');
    expect(text).toContain('50.3%');
    expect(text).toContain('49.6%');
  });

  it('uses the stability release theme in the homepage current-release section', () => {
    const document = readDocument('index.html');
    const currentHeading = Array.from(document.querySelectorAll('h3')).find(
      (heading) => heading.textContent?.trim() === 'NEW IN v3.4.0',
    );
    const section = currentHeading?.closest('section');
    const text = section?.textContent ?? '';

    expect(currentHeading?.textContent?.trim()).toBe('NEW IN v3.4.0');
    expect(text).toContain('Electron 43.4.1');
    expect(text).toContain('Process cleanup');
    expect(text).toContain('Smaller packages');
    expect(text).toContain('51.5%');
    expect(text).toContain('50.3%');
    expect(text).toContain('49.6%');
  });

  it('uses current stability copy beside the macOS version badge', () => {
    const document = readDocument('macos.html');
    const badge = Array.from(document.querySelectorAll('span')).find(
      (element) =>
        element.textContent?.trim() === 'v3.4.0' &&
        element.parentElement?.textContent?.includes('supported Electron and process stability'),
    );
    const text = badge?.parentElement?.textContent ?? '';

    expect(badge?.textContent?.trim()).toBe('v3.4.0');
    expect(text).toContain('supported Electron and process stability');
    expect(text).not.toContain('pane colors');
  });

  it('publishes the exact release date', () => {
    const document = readDocument('releases.html');
    const latest = document.querySelector('article.release-card.latest');

    expect(latest?.textContent).toContain('August 31, 2026');
    expect(latest?.textContent).not.toContain('August 29, 2026');
  });

  it.each(['index.html', 'macos.html', 'manual.html'])(
    'describes the signed and notarized macOS release in %s',
    (name) => {
      const text = readDocument(name).body.textContent ?? '';

      expect(text).toMatch(/signed and notarized/i);
      expect(text).not.toMatch(/isn't code-signed|unsigned app|bypass gatekeeper/i);
      expect(text).not.toContain('xattr -cr');
    },
  );

  it('keeps the repository user manual aligned with the signed release', () => {
    const manual = readFileSync(join(rootDirectory, 'docs', 'USER_MANUAL.md'), 'utf8');

    expect(manual).toMatch(/signed and notarized/i);
    expect(manual).not.toMatch(/not yet signed|unsigned app|bypass gatekeeper/i);
    expect(manual).not.toContain('xattr -cr');
  });

  it('keeps troubleshooting guidance aligned with the signed release', () => {
    const troubleshooting = readFileSync(join(rootDirectory, 'docs', 'TROUBLESHOOTING.md'), 'utf8');

    expect(troubleshooting).toMatch(/signed and notarized/i);
    expect(troubleshooting).not.toMatch(/unsigned app|bypass gatekeeper/i);
    expect(troubleshooting).not.toContain('xattr -cr');
  });

  it('keeps the README aligned with the signed release', () => {
    const readme = readFileSync(join(rootDirectory, 'README.md'), 'utf8');

    expect(readme).toMatch(/signed and notarized/i);
    expect(readme).not.toMatch(/aren't signed yet|unsigned|coming soon|bypass gatekeeper/i);
    expect(readme).not.toContain('xattr -cr');
  });

  it('documents the exact macOS asset names and enough disk space', () => {
    const manual = readDocument('manual.html').querySelector('#macos')?.textContent ?? '';
    const markdownManual = readFileSync(join(rootDirectory, 'docs', 'USER_MANUAL.md'), 'utf8');

    expect(manual).toContain('AudioBash-3.4.0-arm64.dmg');
    expect(manual).toContain('AudioBash-3.4.0-x64.dmg');
    expect(manual).toContain('350MB available disk space');
    expect(markdownManual).toContain('AudioBash-3.4.0-arm64.dmg');
    expect(markdownManual).toContain('AudioBash-3.4.0-x64.dmg');
    expect(markdownManual.match(/350MB available disk space/g)).toHaveLength(1);
  });

  it('describes native PTY repair at the correct package stage', () => {
    const document = readDocument('releases.html');
    const latest = document.querySelector('article.release-card.latest');

    expect(latest?.textContent).toContain('during packaging before signing');
    expect(latest?.textContent).not.toContain('before packaging');
  });
});
