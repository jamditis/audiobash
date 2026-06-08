/**
 * AudioBash Version Management
 * Single source of truth for version numbers across all docs pages
 */

const AUDIOBASH_VERSION = '3.3.0';

// Auto-populate version strings on page load
document.addEventListener('DOMContentLoaded', () => {
    // Text content replacements (nav badges, footers, headers)
    document.querySelectorAll('[data-version]').forEach(el => {
        const template = el.getAttribute('data-version');
        if (template) {
            el.textContent = template.replace('{version}', AUDIOBASH_VERSION);
        } else {
            el.textContent = AUDIOBASH_VERSION;
        }
    });

    // Download link URLs
    document.querySelectorAll('[data-download]').forEach(el => {
        const type = el.getAttribute('data-download');
        const baseUrl = 'https://github.com/jamditis/audiobash/releases/download';

        const urls = {
            'windows': `${baseUrl}/v${AUDIOBASH_VERSION}/AudioBash.Setup.${AUDIOBASH_VERSION}.exe`,
            'mac-arm64': `${baseUrl}/v${AUDIOBASH_VERSION}/AudioBash-${AUDIOBASH_VERSION}-arm64.dmg`,
            'mac-intel': `${baseUrl}/v${AUDIOBASH_VERSION}/AudioBash-${AUDIOBASH_VERSION}.dmg`,
            'linux-appimage': `${baseUrl}/v${AUDIOBASH_VERSION}/AudioBash-${AUDIOBASH_VERSION}.AppImage`,
            'linux-deb': `${baseUrl}/v${AUDIOBASH_VERSION}/AudioBash-${AUDIOBASH_VERSION}.deb`
        };

        if (urls[type]) {
            el.href = urls[type];
        }
    });
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AUDIOBASH_VERSION };
}
