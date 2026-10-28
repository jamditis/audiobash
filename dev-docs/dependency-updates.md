# Dependency update constraints

Keep Vitest and `@vitest/coverage-v8` on the same exact version. The coverage plugin declares an exact Vitest peer dependency, so updating it alone prevents a clean install.

Keep TypeScript inside the installed `typescript-eslint` peer range. Version 8.71.0 supports TypeScript `>=4.8.4 <6.1.0`; the grouped TypeScript 7.0.2 update needs a compatible lint toolchain first.

Tailwind 4 needs a separate migration of the PostCSS plugin, CSS entry, and theme configuration. This application currently uses the Tailwind 3 plugin and directives. Verify the rendered interface when migrating it.

Electron major updates need their own runtime and packaging verification. The current selected release is 43.8.3. A 44.3.0 update changes the native ABI from 148 to 149, so keep the exact Electron contract checks and verify native PTY binaries and signed packages before advancing the selected release. The October security candidate remains on Electron 43 to retain macOS 12 support. Its embedded Node 24.22.0 still needs the upstream October Node fixes; see [v3.4.1 release evidence](releases/v3.4.1.md).

When compatible package updates change an exact pin, update the corresponding toolchain assertion from the reviewed package version. Keep assertions for the supported toolchain and security overrides intact. Run formatting, lint, type checks, the relevant tests, and a production renderer build; require Linux CI and both process lifecycle platforms before merge.

With electron-builder 26.17.0, app-builder-lib uses its own compatible noble-hashes 1.8.0 dependency. The major 2 security override still protects major 2 consumers; historical release evidence describes the dependency graph at that release. Keep the packager and PKI.js dependency contracts covered when updating this group.
