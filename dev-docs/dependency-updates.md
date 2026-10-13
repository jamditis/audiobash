# Dependency update constraints

Keep Vitest and `@vitest/coverage-v8` on the same exact version. The coverage plugin declares an exact Vitest peer dependency, so updating it alone prevents a clean install.

Keep TypeScript inside the installed `typescript-eslint` peer range. Version 8.71.0 supports TypeScript `>=4.8.4 <6.1.0`; the grouped TypeScript 7.0.2 update needs a compatible lint toolchain first.

Tailwind 4 needs a separate migration of the PostCSS plugin, CSS entry, and theme configuration. This application currently uses the Tailwind 3 plugin and directives. Verify the rendered interface when migrating it.

Electron major updates need their own runtime and packaging verification. The current selected release is 43.4.1. A 44.3.0 update changes the native ABI from 148 to 149, so keep the exact Electron contract checks and verify native PTY binaries and signed packages before advancing the selected release.

When compatible package updates change an exact pin, update the corresponding toolchain assertion from the reviewed package version. Keep assertions for the supported toolchain and security overrides intact. Run formatting, lint, type checks, the relevant tests, and a production renderer build; require Linux CI and both process lifecycle platforms before merge.
