# Dependency update constraints

Keep Vitest and `@vitest/coverage-v8` on the same exact version. The coverage plugin declares an exact Vitest peer dependency, so updating it alone prevents a clean install.

Keep TypeScript inside the installed `typescript-eslint` peer range. Version 8.72.2 supports TypeScript `>=4.8.4 <6.1.0`; the grouped TypeScript 7.0.2 update needs a compatible lint toolchain first.

Tailwind 4 needs a separate migration of the PostCSS plugin, CSS entry, and theme configuration. This application currently uses the Tailwind 3 plugin and directives. Verify the rendered interface when migrating it.

Keep the exact Electron contract checks and verify native PTY binaries and signed packages before advancing the selected release. The selected release is 43.8.10. It keeps native ABI 148 and macOS 12 support. Electron 43.8.4 updated the embedded Node to 24.22.1, which includes the October Node fixes. Electron 44.3.0 changes the native ABI to 149 and requires macOS 13 or later. [Electron 43.8.4 release notes](https://releases.electronjs.org/release/v43.8.4) · [Electron release metadata](https://releases.electronjs.org/releases.json) · [Electron 44 platform changes](https://www.electronjs.org/blog/electron-44-0)

The [v3.4.1 release evidence](releases/v3.4.1.md) records the earlier Electron 43.8.3 candidate and its package checks.

When compatible package updates change an exact pin, update the corresponding toolchain assertion from the reviewed package version. Keep assertions for the supported toolchain and security overrides intact. Run formatting, lint, type checks, the relevant tests, and a production renderer build; require Linux CI and both process lifecycle platforms before merge.

With electron-builder 26.18.0, app-builder-lib uses its own compatible noble-hashes 1.8.0 dependency. The major 2 security override still protects major 2 consumers; historical release evidence describes the dependency graph at that release. Keep the packager and PKI.js dependency contracts covered when updating this group.

The reviewed brace-expansion 1.1.18 override covers the complete major 1 range. A selector that stops at 1.1.18 lets dependency refreshes write a newer nested major 1 copy that npm then rejects against its override. Keep each major 1 consumer on the selected override version until that security pin is deliberately updated.
