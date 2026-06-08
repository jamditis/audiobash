// ESLint flat config.
//
// The project has no "type": "module" in package.json, so Node treats bare .js
// as CommonJS. This config must therefore use the .mjs extension to load as ESM.
//
// Buckets:
//   - .ts/.tsx: typescript-eslint (renderer + tests). no-undef is off because the
//     TypeScript compiler already checks undefined names, which also lets vitest's
//     injected globals (describe/it/expect/vi) pass without enumerating them.
//   - .cjs: Electron main-process modules, unambiguously CommonJS.
//   - .js/.mjs: root config files and helper scripts. Authoring is mixed (tailwind
//     uses `export default`, postcss uses `module.exports`), so they are parsed as
//     modules with node globals, which loads both styles.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

const unusedVars = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

// AudioBash is a terminal emulator; matching ANSI/VT control characters
// (ESC \x1b, BEL \x07, etc.) in regexes is a core, recurring pattern rather
// than an accidental literal, so no-control-regex is a net false positive here.
const terminalRules = { 'no-control-regex': 'off' };

export default tseslint.config(
  // Paths ESLint never inspects: build output, dependencies, generated runtime
  // assets, the marketing site, standalone browser bundles, and the local-only
  // security lab.
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
      'docs/**',
      'security-lab/**',
      '.claude/**',
      'release/**',
    ],
  },

  // TypeScript / React source (renderer) and TS test files.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...terminalRules,
      // TypeScript handles undefined-name detection; eslint's version yields
      // false positives on type-only and ambient globals.
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // First-pass lint adoption: surface these without blocking CI so the
      // backlog is visible and can be driven down over time.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': unusedVars,
    },
  },

  // Electron main-process modules (unambiguously CommonJS).
  {
    files: ['**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...terminalRules,
      'no-unused-vars': unusedVars,
    },
  },

  // Root config files and helper scripts (.js / .mjs).
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },

  // Disable formatting rules that conflict with Prettier. Must stay last.
  prettierConfig,
);
