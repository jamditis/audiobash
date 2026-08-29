import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression guard for the v3.2.0-entry-relabel bug: docs/js/version.js rewrites every element
// carrying data-version="v{version}" to the global AUDIOBASH_VERSION on page load. The releases
// page freezes one entry per shipped version, so only the newest (latest) entry may use that
// template. When a release bumps the version without freezing the prior latest entry, the old
// entry's badge gets silently relabeled to the new version while keeping its old date and notes
// (e.g. the March 11 pane-colors v3.2.0 entry rendering as "v3.3.0"). Frozen historical entries
// must hardcode their version badge so a version bump cannot rewrite them.

const releasesHtml = readFileSync(join(__dirname, '..', '..', 'docs', 'releases.html'), 'utf8');
const doc = new DOMParser().parseFromString(releasesHtml, 'text/html');
const macosHtml = readFileSync(join(__dirname, '..', '..', 'docs', 'macos.html'), 'utf8');
const indexHtml = readFileSync(join(__dirname, '..', '..', 'docs', 'index.html'), 'utf8');

const versionJs = readFileSync(join(__dirname, '..', '..', 'docs', 'js', 'version.js'), 'utf8');
const currentVersion = versionJs.match(/AUDIOBASH_VERSION\s*=\s*'([^']+)'/)?.[1];

function findCardByHeading(fragment: string): Element {
  const cards = Array.from(doc.querySelectorAll('article.release-card'));
  const match = cards.find((card) =>
    (card.querySelector('h2')?.textContent ?? '').toLowerCase().includes(fragment.toLowerCase()),
  );
  if (!match) throw new Error(`No release card whose heading contains "${fragment}"`);
  return match;
}

function nonLatestCards(): Element[] {
  return Array.from(doc.querySelectorAll('article.release-card')).filter(
    (card) => !card.classList.contains('latest'),
  );
}

describe('docs/releases.html version freezing', () => {
  it('marks exactly one release card as the latest', () => {
    const latest = doc.querySelectorAll('article.release-card.latest');
    expect(latest).toHaveLength(1);
  });

  it('freezes the v3.2.0 pane-colors entry with a hardcoded version badge', () => {
    const card = findCardByHeading('pane colors');
    const templatedBadge = card.querySelector('[data-version="v{version}"]');
    expect(templatedBadge).toBeNull();
    // The frozen badge must literally read v3.2.0, not a template that version.js can overwrite.
    const badge = card.querySelector('span[class*="bg-accent"], span[class*="bg-white"]');
    expect(badge?.textContent?.trim()).toBe('v3.2.0');
  });

  it('no longer marks the v3.2.0 pane-colors entry as latest', () => {
    const card = findCardByHeading('pane colors');
    expect(card.classList.contains('latest')).toBe(false);
  });

  it('points the latest badge at a newer entry than the v3.2.0 pane-colors release', () => {
    const latest = doc.querySelector('article.release-card.latest');
    const paneColors = findCardByHeading('pane colors');
    expect(latest).not.toBeNull();
    expect(latest).not.toBe(paneColors);
    // The latest card keeps the template so its badge tracks the shipped version.
    expect(latest?.querySelector('[data-version="v{version}"]')).not.toBeNull();
  });

  it('freezes the v3.2.0 entry download links to v3.2.0 assets, not the latest version', () => {
    const card = findCardByHeading('pane colors');
    // data-download links are repointed at the latest version by version.js, so a frozen entry
    // must use hardcoded v3.2.0 URLs instead.
    expect(card.querySelector('[data-download]')).toBeNull();
    const downloads = Array.from(card.querySelectorAll('a[href*="/releases/download/"]'));
    expect(downloads.length).toBeGreaterThan(0);
    for (const link of downloads) {
      expect(link.getAttribute('href')).toContain('/download/v3.2.0/');
    }
  });

  // version.js also repoints every [data-download] link at the latest version's assets, so the same
  // freeze must hold for the download buttons on every historical card, not just v3.2.0 — otherwise
  // old entries silently link to the newest installers.
  it('uses no templated download links on any non-latest release card', () => {
    for (const card of nonLatestCards()) {
      const version = card.querySelector('span')?.textContent?.trim() ?? '(unknown)';
      expect(
        card.querySelectorAll('[data-download]').length,
        `frozen card ${version} still has a templated [data-download] link`,
      ).toBe(0);
    }
  });

  it('uses no templated version badge on any non-latest release card', () => {
    for (const card of nonLatestCards()) {
      const version = card.querySelector('span')?.textContent?.trim() ?? '(unknown)';
      expect(
        card.querySelectorAll('[data-version]').length,
        `frozen card ${version} still has a templated version badge`,
      ).toBe(0);
    }
  });

  it('keeps the macOS pane-color badge frozen at v3.2.0', () => {
    expect(macosHtml).toContain('<span>v3.2.0</span> — customizable pane colors');
    expect(macosHtml).not.toContain(
      'data-version="v{version}">v3.2.0</span> — customizable pane colors',
    );
  });

  it('keeps homepage release copy on static public-version labels', () => {
    expect(currentVersion, 'could not parse AUDIOBASH_VERSION from version.js').toBeTruthy();
    const indexDoc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const releaseBadge = Array.from(indexDoc.querySelectorAll('a[href="latest.html"] span')).find(
      (element) => element.textContent?.trim() === `v${currentVersion}`,
    );
    const releaseHeading = Array.from(indexDoc.querySelectorAll('h3')).find(
      (element) => element.textContent?.trim() === `NEW IN v${currentVersion}`,
    );

    expect(releaseBadge).toBeTruthy();
    expect(releaseBadge?.hasAttribute('data-version')).toBe(false);
    expect(releaseHeading).toBeTruthy();
    expect(releaseHeading?.hasAttribute('data-version')).toBe(false);
  });

  it('never links a frozen historical entry at the current version download assets', () => {
    expect(currentVersion, 'could not parse AUDIOBASH_VERSION from version.js').toBeTruthy();
    const currentPath = `/download/v${currentVersion}/`;
    for (const card of nonLatestCards()) {
      const version = card.querySelector('span')?.textContent?.trim() ?? '(unknown)';
      const stray = Array.from(card.querySelectorAll('a[href]')).filter((a) =>
        (a.getAttribute('href') ?? '').includes(currentPath),
      );
      expect(stray.length, `frozen card ${version} links at the current version's assets`).toBe(0);
    }
  });
});

// Regression guard for the recurring "hardened transcription" overstatement. The v3.3.0 security
// work moved the batch (request/response) cloud transcription path into the main process, but the
// real-time ElevenLabs path still builds a browser WebSocket with xi-api-key in the renderer
// (src/services/elevenLabsRealtimeService.ts). So an unqualified "cloud transcription now runs in
// the main process" claim is false for that path. Every v3.3.0 doc page must scope the claim to
// batch. This was flagged three separate times before it stuck.
describe('docs do not overstate the transcription hardening', () => {
  // Matches the sentence-level claim that transcription requests now run/moved in(to) the main
  // process. Each occurrence must be qualified with "batch" in its immediate lead-in.
  const claimRe = /transcription requests (?:now run|moved) (?:in|into) the main process/g;

  // releases.html and latest.html keep the v3.3.0 entry as frozen release history, so the claim
  // must stay present (and scoped) there. index.html's single "what's new" panel rotates to the
  // newest release, so once the homepage moves on (v3.3.1 leads with the local-dictionary fix) the
  // claim is no longer required there. The anti-overstatement guard below still applies to every
  // file: any claim that does appear must be scoped to the batch path.
  const filesRequiringClaim = new Set(['releases.html', 'latest.html']);

  for (const name of ['releases.html', 'index.html', 'latest.html']) {
    it(`scopes the main-process transcription claim to batch in ${name}`, () => {
      const html = readFileSync(join(__dirname, '..', '..', 'docs', name), 'utf8').toLowerCase();
      const matches = [...html.matchAll(claimRe)];
      if (filesRequiringClaim.has(name)) {
        expect(
          matches.length,
          `expected at least one main-process transcription claim in ${name}`,
        ).toBeGreaterThan(0);
      }
      for (const m of matches) {
        const leadIn = html.slice(Math.max(0, m.index - 30), m.index);
        expect(
          leadIn,
          `unqualified transcription claim in ${name}: "...${html.slice(Math.max(0, m.index - 30), m.index + 50)}..."`,
        ).toContain('batch');
      }
    });
  }
});
