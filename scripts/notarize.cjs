/**
 * electron-builder afterSign hook.
 *
 * Release builds must use the approved App Store Connect API key or a stored
 * notarytool keychain profile. Development builds can skip notarization only
 * when both the development mode and skip flag are explicit.
 */
const path = require('node:path');
const { notarize: systemNotarize } = require('@electron/notarize');

function requiredValues(env, names) {
  const values = Object.fromEntries(names.map((name) => [name, env[name]]));
  return names.every((name) => typeof values[name] === 'string' && values[name].length > 0)
    ? values
    : undefined;
}

function notarizationCredentials(env) {
  const keychain = requiredValues(env, ['APPLE_KEYCHAIN_PROFILE']);
  if (keychain) {
    return {
      ...(env.APPLE_KEYCHAIN ? { keychain: env.APPLE_KEYCHAIN } : {}),
      keychainProfile: keychain.APPLE_KEYCHAIN_PROFILE,
    };
  }

  const apiKey = requiredValues(env, [
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
    'APPLE_TEAM_ID',
  ]);
  if (apiKey) {
    return {
      appleApiKey: apiKey.APPLE_API_KEY,
      appleApiKeyId: apiKey.APPLE_API_KEY_ID,
      appleApiIssuer: apiKey.APPLE_API_ISSUER,
    };
  }

  return undefined;
}

function createNotarizeHook({
  env = process.env,
  notarize = systemNotarize,
  log = console.log,
} = {}) {
  return async function notarizing(context) {
    if (context.electronPlatformName !== 'darwin') return;

    const buildMode = env.AUDIOBASH_BUILD_MODE;
    const skipNotarize = env.SKIP_NOTARIZE === 'true';
    if (skipNotarize) {
      if (buildMode !== 'development') {
        throw new Error('Release builds cannot skip notarization');
      }
      log('[notarize] Explicit development build: notarization skipped.');
      return;
    }

    const credentials = notarizationCredentials(env);
    if (!credentials) {
      const prefix = buildMode === 'release' ? 'Release' : 'macOS build';
      throw new Error(
        `${prefix} notarization credentials are missing. Use the approved API key or keychain profile.`,
      );
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);
    log(`[notarize] Submitting ${appPath} and requiring a stapled ticket.`);
    await notarize({ appPath, ...credentials });
    log('[notarize] Notarization and app stapling completed.');
  };
}

function createNotarizeArtifactsHook({
  env = process.env,
  notarize = systemNotarize,
  isMacTarget = buildTargetsMacOs,
  log = console.log,
} = {}) {
  return async function notarizeArtifacts(context) {
    if (!isMacTarget(context)) return;

    const buildMode = env.AUDIOBASH_BUILD_MODE;
    const skipNotarize = env.SKIP_NOTARIZE === 'true';
    if (skipNotarize) {
      if (buildMode !== 'development') {
        throw new Error('Release builds cannot skip notarization');
      }
      log('[notarize] Explicit development build: DMG notarization skipped.');
      return;
    }

    const credentials = notarizationCredentials(env);
    if (!credentials) {
      const prefix = buildMode === 'release' ? 'Release' : 'macOS build';
      throw new Error(
        `${prefix} notarization credentials are missing. Use the approved API key or keychain profile.`,
      );
    }

    const dmgPaths = context.artifactPaths.filter(
      (artifactPath) => path.extname(artifactPath).toLowerCase() === '.dmg',
    );
    if (dmgPaths.length !== 1) {
      throw new Error(
        `Release macOS build must produce exactly one DMG; received ${dmgPaths.length}`,
      );
    }

    log(`[notarize] Submitting ${dmgPaths[0]} and requiring a stapled ticket.`);
    await notarize({ appPath: dmgPaths[0], ...credentials });
    log('[notarize] DMG notarization and stapling completed.');
  };
}

function buildTargetsMacOs(context) {
  if (!context?.platformToTargets || typeof context.platformToTargets.keys !== 'function') {
    throw new Error('electron-builder platform targets are required for artifact notarization');
  }
  return [...context.platformToTargets.keys()].some((platform) => platform?.name === 'mac');
}

module.exports = {
  afterSign: createNotarizeHook(),
  buildTargetsMacOs,
  createNotarizeArtifactsHook,
  createNotarizeHook,
  default: createNotarizeHook(),
  notarizationCredentials,
};
