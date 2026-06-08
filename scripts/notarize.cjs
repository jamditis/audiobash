/**
 * electron-builder afterSign hook — notarizes the macOS app bundle.
 *
 * Sends the signed .app to Apple's notarization service, which scans it
 * for malware and staples a ticket so Gatekeeper trusts it on first launch.
 *
 * Required environment variables:
 *   APPLE_ID              - Apple ID email (jamditis@gmail.com)
 *   APPLE_ID_PASSWORD     - App-specific password (NOT your Apple ID password)
 *   APPLE_TEAM_ID         - 10-char team ID from developer.apple.com/account
 *
 * To skip notarization (e.g. local dev builds), set:
 *   SKIP_NOTARIZE=true
 */
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Allow skipping for local dev builds
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('[notarize] Skipping notarization (SKIP_NOTARIZE=true)');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      '[notarize] Missing APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID — skipping notarization',
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Notarizing ${appPath}...`);

  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log('[notarize] Done.');
};
