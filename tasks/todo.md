# AudioBash macOS stability and v3.4.0 release plan

> For internal repository agents: use one bounded task per agent. Add a failing test before each bug fix, diagnose each failure from evidence, and verify each commit and release gate before completion. Do not use external skills or plugins.

**Goal:** Build and publish AudioBash v3.4.0 with smaller macOS packages, reliable local and packaged PTYs, bounded background work, a supported Electron security line, signed and notarized arm64 and x64 artifacts, and release checks that fail when an artifact is missing or invalid.

**Architecture:** Keep Vite renderer output and electron-builder artifacts in separate directories. Keep renderer libraries out of the packaged production dependency tree. Extract native-binary repair, ElevenLabs multipart creation, file watching, and local transcription process ownership into small CommonJS modules that can run in Node tests without starting Electron. Use separate macOS architecture jobs and fail-closed release validation.

**Technology:** Electron, CommonJS, React 19, TypeScript, Vite, Vitest, node-pty, electron-builder, GitHub Actions, Apple `codesign`, `notarytool`, `stapler`, and Gatekeeper.

## Scope

This release includes:

- GitHub issues #45 and #46: broken, bloated, missing macOS artifacts.
- GitHub issue #48: preview refresh after atomic file replacement.
- GitHub issue #49: local transcription process-tree ownership.
- The clean-install macOS PTY permission failure.
- The undeclared `form-data` runtime use in ElevenLabs batch transcription.
- Current direct dependency security findings.
- Measured renderer, VAD, sound, public-file, and node-pty package bloat.
- Two React hook warnings with possible stale runtime state.
- Cloud transcription requests that have no local deadline.
- A proportionate complexity and readability pass on each logic unit changed by this release.
- Version, release-note, download-link, signing, notarization, favicon, social metadata, and release asset checks.

For each edited logic unit, preserve behavior first, match the local style, keep the happy path flat, and give the unit one clear job. Use guard clauses, named intermediate facts, or flat dispatch when they make the edited logic easier to follow. Extract only a concept with a useful name. Do not compute a complexity score, split code into chains of tiny functions, or refactor untouched units.

This release does not include:

- GitHub issue #47, because it changes Windows shell selection.
- New transcription models, media formats, or user-facing features.
- A broad UI redesign.
- A broad readability refactor outside logic already changed for this release.
- Unmeasured dependency deletion.

## Baseline evidence from 2026-08-27

- [x] Repository started clean on `master` at `a96935a`; local and remote matched.
- [x] Current version is `3.3.1`; latest tag is `v3.3.1`.
- [x] `npm ci` installed 716 packages from the lock file.
- [x] `npm test` failed: 448 passed, 7 failed, and 3 skipped across 458 tests.
- [x] All seven failures came from macOS PTY tests because both `spawn-helper` files had mode `0644`.
- [x] `npm run lint` returned zero errors and 65 warnings.
- [x] `npm run lint:py` could not run because Ruff was not installed locally.
- [x] `npm run typecheck` passed.
- [x] `npm run format:check` passed.
- [x] `npm run build` passed with an eight-month-old Browserslist warning and a 1,088,550-byte initial JavaScript chunk.
- [x] `npm audit --omit=dev` found one moderate production finding in `protobufjs`.
- [x] Full `npm audit` found 32 affected packages: 5 critical, 23 high, 3 moderate, and 1 low.
- [x] A clean `electron:build:mac:arm64` still started both architectures and failed during DMG generation.
- [x] Vite and electron-builder both use `dist`; a parallel Vite build deleted active package output.
- [x] The public v3.3.1 release has no DMG or macOS zip assets although the website links to them.
- [x] The local keychain has a valid Developer ID Application identity.
- [x] The current shell has no Apple notarization credentials.
- [x] GitHub has no Apple signing or notarization secrets.
- [x] The v3.3.1 macOS workflow used ad hoc signing, skipped notarization, and still passed.
- [x] The current v3.3.1 arm64 and Intel website download links return missing release assets.
- [x] No product fix, version bump, tag, push, or release change was made during the audit.
- [x] User approves this plan before product implementation starts.

## File map

Files to create:

- `scripts/nodePtyBinaries.cjs`: find, repair, sign, and verify node-pty native files.
- `scripts/prepare-native-deps.cjs`: safe post-install entry point for local macOS development.
- `scripts/releaseArtifacts.cjs`: derive exact release filenames from package metadata for tests, workflows, docs, and release checks.
- `scripts/verify-macos-release.cjs`: artifact names, sizes, hashes, package contents, permissions, and signature checks.
- `scripts/sync-version.cjs`: update generated documentation version data from `package.json`.
- `electron/elevenLabsRequest.cjs`: build and send an ElevenLabs multipart request with built-in web APIs.
- `electron/fileWatcher.cjs`: own one stable file-watch lifecycle.
- `electron/processTree.cjs`: stop and await a process tree on macOS, Linux, and Windows.
- `electron/transcriptionJob.cjs`: own FFmpeg and Whisper processes for one local transcription job.
- `tests/unit/nodePtyBinaries.test.ts`: native repair behavior.
- `tests/unit/elevenLabsRequest.test.ts`: production-safe multipart behavior and deadlines.
- `tests/unit/fileWatcher.test.ts`: in-place and atomic-save behavior.
- `tests/unit/processTree.test.ts`: timeout, cancellation, shutdown, and reaping behavior.
- `tests/unit/syncVersion.test.ts`: one version across package, lock, docs, and artifacts.
- `tests/unit/useVAD.test.tsx`: deferred VAD loading, assets, and cleanup.
- `tests/integration/macos-package.test.ts`: required package structure and current-version artifact checks.
- `dev-docs/releases/v3.4.0.md`: release notes, measurements, test evidence, and known limits.

Files to modify:

- `package.json` and `package-lock.json`: scripts, version, dependencies, output directory, architecture targets, resources, and Node metadata.
- `.gitignore`: ignore electron-builder `release/` output.
- `.github/workflows/ci.yml`: Node 22 and truthful warning gates.
- `.github/workflows/build.yml`: separate architectures, signing, notarization, validation, exact asset checks, and draft release behavior.
- `scripts/afterPack.cjs` and `scripts/notarize.cjs`: shared native repair and fail-closed release behavior.
- `scripts/copy-vad-assets.cjs`: copy only the selected VAD model.
- `electron/main.cjs`: use the extracted modules and bounded shutdown.
- `electron/whisperService.cjs`: use one transcription job owner.
- `src/hooks/useVAD.ts`: load VAD code only when VAD starts.
- `src/components/Terminal.tsx` and `src/components/VoiceOverlay.tsx`: correct only behavior proven stale by tests.
- `tests/build-config.test.ts`, `tests/macos-stress.test.ts`, `tests/startup-crash.test.ts`, and `tests/stress/transcription.stress.ts`: replace source-text and skip-based checks with behavior checks.
- `vitest.config.ts`: run native macOS tests in the Node environment.
- `.nvmrc`: pin the Node line used by local development and CI.
- `.claude/rules/release-process.md`: correct output paths, artifact names, and pre-tag gates.
- `README.md`, `CLAUDE.md`, `dev-docs/MACOS_BUILD.md`, `dev-docs/MACOS_TESTING_CHECKLIST.md`, `docs/USER_MANUAL.md`, `docs/releases.html`, and `docs/js/version.js`: current release facts and instructions.

Files to remove after tests prove they are retired or duplicated:

- `public/_headers`
- `public/css/styles.css`
- `public/index.html`
- `public/js/app.js`
- `public/js/terminal.js`
- `public/js/voice.js`
- `public/js/websocket.js`
- `public/manifest.json`
- `public/service-worker.js`
- `assets/error.mp3`
- `assets/start.mp3`
- `assets/stop.mp3`
- `assets/success.mp3`
- `assets/icon.png`

## Task 0: Confirm the Apple release prerequisites

- [x] Verify Apple Developer Program membership is active through the signed-in account and Apple notarization service.
- [x] Verify the local Developer ID Application certificate has its private key and is not expired. It expires on February 1, 2027.
- [x] Verify the certificate's issuing Developer ID G1 intermediate is installed and trusted. Apple states that existing G1 certificates remain valid until expiry; G2 is a renewal-readiness requirement, not a blocker for this certificate.
- [x] Verify `codesign` can apply a hardened runtime signature with a secure timestamp and verify a temporary test binary without printing identity details beyond the certificate name and team identifier.
- [x] Choose the user-approved GitHub Actions credential path.
- [x] Do not create a local Apple ID or app-specific-password profile because CI API-key notarization was selected.
- [x] After separate user approval, export only the Developer ID identity as an encrypted PKCS #12 archive and store it with a dedicated Developer-role App Store Connect team API key, key identifier, issuer identifier, and team identifier in GitHub Actions secrets.
- [x] Test the dedicated API key with `xcrun notarytool history` before product implementation.
- [x] Confirm membership, private key, issuing intermediate, timestamped signing, notarization authentication, and all six expected GitHub secret names pass. Do not publish an ad hoc-signed fallback as v3.4.0.
- [x] Move temporary credential exports and signing probes into one owner-only holding directory after GitHub confirms the secret names.
- [ ] After explicit user approval, permanently remove the exact temporary holding directory. Record only the result, not its credential contents. Do not describe temporary credential cleanup as passed while recoverable private-key copies remain.
- [x] Record only pass, fail, certificate expiry, and the selected credential method in `dev-docs/releases/v3.4.0.md`.

## Task 1: Create an isolated release branch and preserve the baseline

- [x] Read `superjawn:using-git-worktrees`, `superjawn:subagent-driven-development`, and `superjawn:receiving-code-review` before implementation.
- [x] Create `release/v3.4.0-macos-stability` in a repository-local worktree.
- [x] Copy this approved plan into that worktree without changing the baseline commit.
- [x] Record `git status`, `git rev-parse HEAD`, `git describe --tags --always`, Node, npm, Python, Xcode, macOS, architecture, Developer ID identity presence, and notarization credential presence without printing secret values.
- [x] Install Ruff `0.15.1`, matching CI, and record the command in `dev-docs/releases/v3.4.0.md`.
- [x] Re-run the baseline commands and keep their raw output in ignored `.audit/` files.
- [x] Commit only the approved plan and release evidence index.

Expected commit message:

```text
docs: define evidence gates before changing the mac release path
```

## Task 2: Repair local and packaged node-pty binaries

**Root cause:** `afterPack.cjs` repairs only packaged helpers. A clean local install leaves both macOS `spawn-helper` files at mode `0644`, so development and stress tests fail with `posix_spawnp failed`.

- [x] Add a failing test in `tests/unit/nodePtyBinaries.test.ts` that creates temporary arm64 and x64 helpers at mode `0644`, calls the planned repair API, and expects mode `0755`.
- [x] Add a failing test that injects a signing failure and expects release-mode repair to throw.
- [x] Run `npx vitest run tests/unit/nodePtyBinaries.test.ts` and confirm failure for the missing module.
- [x] Implement this small interface in `scripts/nodePtyBinaries.cjs`:

```js
function repairNodePtyBinaries(options) {}
function verifyNodePtyBinaries(options) {}
module.exports = { repairNodePtyBinaries, verifyNodePtyBinaries };
```

- [x] Make the functions accept the node-pty root, target architecture, release mode, and an injected `execFileSync` for tests.
- [x] On macOS, set `spawn-helper` to `0755`, sign `spawn-helper` and `pty.node`, and verify both signatures.
- [x] In release mode, throw on a missing file, permission failure, signing failure, or verification failure.
- [x] Refactor `scripts/afterPack.cjs` to use the module and stop swallowing failures.
- [x] Add `scripts/prepare-native-deps.cjs` as an explicit cross-platform command. It must be a no-op outside macOS and must not run as an npm `postinstall` hook.
- [x] Invoke `prepare:native` from `pretest`, `pretest:watch`, `pretest:coverage`, `pretest:ui`, `preelectron:dev`, `preelectron:build`, `preelectron:build:win`, `preelectron:build:mac`, `preelectron:build:mac:arm64`, `preelectron:build:mac:x64`, and `preelectron:build:linux`. Add a package-script test that requires this exact coverage.
- [x] Run `npm ci` from a clean dependency tree and confirm the helpers first return to mode `0644`.
- [x] Run the seven existing macOS PTY tests and confirm they fail with the original `posix_spawnp failed` symptom before repair.
- [x] Run `npm run prepare:native`, verify both local helpers are executable, and run the same seven tests again.
- [x] Temporarily restore one helper to `0644`, rerun one real PTY test to prove it fails, run the repair command again, and prove it passes.
- [x] Run `npx vitest run tests/unit/nodePtyBinaries.test.ts tests/macos-stress.test.ts` and require zero failures.
- [x] Review every changed line and request a Claude Code review before commit.

Expected commit message:

```text
fix: make clean mac installs able to start terminal processes
```

## Task 3: Separate renderer and package output and build one architecture at a time

**Root cause:** Vite and electron-builder both own `dist`. The mac target also hard-codes both architectures, so architecture-specific scripts still build both and can sweep package output into the next package.

- [x] Replace the current architecture assertion with failing behavior assertions in `tests/build-config.test.ts`:

```ts
expect(buildConfig.directories.output).toBe('release');
expect(macTargets).toEqual(['dmg', 'zip']);
expect(macTargetsWithArch).toHaveLength(0);
expect(scripts['electron:build:mac:arm64']).toContain('--arm64');
expect(scripts['electron:build:mac:arm64']).not.toContain('--x64');
```

- [x] Add failing assertions that `.gitignore` contains `/release/` and `.audit/` so packages, hashes, validation logs, and local credential-path evidence cannot enter a commit.
- [x] Add a failing assertion that mac package tests derive artifact names from `package.json` instead of `2.0.2`.
- [x] Run the targeted tests and confirm the expected failures.
- [x] Set `build.directories.output` to `release` and keep Vite output in `dist`.
- [x] Change mac targets to `"dmg"` and `"zip"` without target-level `arch` arrays.
- [x] Make arm64 and x64 scripts build only their named architecture with `--publish never`.
- [x] Add an explicit combined release script that runs the two architecture builds in sequence.
- [x] Update Windows and Linux artifact paths from `dist/` to `release/`.
- [x] Replace the obsolete DMG skip test with `tests/integration/macos-package.test.ts`. The release test command must fail when the current-version artifact is absent.
- [x] Run each architecture directory build separately and prove it creates only the named architecture.
- [x] Run a clean arm64 DMG build. Record whether the earlier temporary-DMG `ENOENT` failure is gone.
- [x] Run a clean x64 DMG build under Rosetta or the x64 electron-builder path. Record whether it is independent of arm64 output.
- [x] Compare file lists and hashes to prove no architecture package contains the other package output.
- [x] Before package pruning or an Electron major update, use the Task 0 credentials to build, sign, notarize, staple, and validate one unpruned package for each architecture on the current Electron 39 baseline. This control isolates the trust pipeline from later dependency changes. It is not a release candidate or an approved release runtime.
- [x] Keep the control sample hashes, package lists, and validation output in ignored audit records. If this control fails, fix packaging or signing before Task 4.
- [x] Request Claude Code review and commit.

Expected commit message:

```text
fix: give each mac architecture an isolated package output
```

## Task 4: Remove packaged renderer duplication and retired static files

- [x] Add failing package-manifest tests that classify React, Xterm, and VAD libraries as renderer build inputs instead of main-process runtime dependencies.
- [x] Add a failing build-config test that rejects the duplicate root sound resource set on macOS.
- [x] Add a failing package-content test that rejects React, Xterm, VAD, ONNX, non-target node-pty prebuilds, Windows PDB files, and retired remote-control files from the mac package.
- [x] Move `@ricky0123/vad-web`, `@xterm/addon-fit`, `@xterm/xterm`, `react`, and `react-dom` to `devDependencies`.
- [x] Remove unused `@testing-library/user-event`.
- [x] Keep both VAD model files during this task. Task 5 must pin the runtime model before it removes the V5 asset.
- [x] Remove the retired remote-control files listed in the file map.
- [x] Keep `public/favicon.svg`, `public/assets`, and generated `public/vad`.
- [x] Keep `public/assets/start.mp3`, `public/assets/stop.mp3`, `public/assets/success.mp3`, and `public/assets/error.mp3` as the renderer sound source.
- [x] Remove the byte-identical root `assets/*.mp3` files and the global `extraResources` sound copy.
- [x] Keep root `audiobash-logo.png` as the macOS application and tray image. Remove the 12-byte placeholder `assets/icon.png`.
- [x] Keep root `audiobash-logo.ico` for Windows and scope its resource copy to the Windows package.
- [x] Add mac-specific negative package patterns for non-darwin node-pty prebuilds, Windows PDB files, tests, source maps, and build-only source.
- [x] Keep the target architecture `pty.node`, `spawn-helper`, runtime JavaScript, and `package.json`.
- [x] List `app.asar` and `app.asar.unpacked` and make the package-content tests pass.
- [x] Measure installed production closure, `.app`, DMG, zip, `app.asar`, and `app.asar.unpacked` before and after this task.
- [ ] Run packaged startup, PTY, tray, four-sound, manual voice, and VAD smoke tests before release acceptance.
  - [x] Automated arm64 and x64 startup, PTY, tray-image construction, package sound-file, and VAD-asset checks pass.
  - [ ] Manually play all four notification sounds and test tray clicks and menu actions.
  - [ ] Investigate the repeated arm64 Electron menu-model warning and confirm it is absent or harmless after the supported Electron update and tray interaction test.
  - [ ] Manually test microphone voice capture and live VAD behavior.
- [x] Request Claude Code review, correct its findings, and commit.

### Task 4 review

- The first macOS exclusion build produced a 4.0 GB app. Later source inspection showed that electron-builder 26 combines global and platform file patterns, so allowlist replacement is not a proven root cause. The macOS list remains self-contained and requires three positive include patterns, which prevents a future all-negative list from selecting the project.
- Electron-builder smart unpack copied the node-pty runtime outside `app.asar`. Smart unpack is now disabled only for macOS, and a package test requires exactly the target `pty.node` and `spawn-helper` in `app.asar.unpacked`. Windows and Linux keep automatic native detection.
- Independent specification review found that an extension-only filter could miss foreign DLL and executable files. A red synthetic inventory test now proves that every prebuild entry outside the exact target architecture directory is rejected.
- Five installed dependency trees that the mac runtime does not use are excluded only at the package boundary. Isolated package probes use an empty temporary home and working directory, inherit only required locale, path, and temporary-directory variables, and reject every non-built-in CommonJS module resolution outside the packaged ASAR or its unpacked native tree. They load all retained main-process dependencies and call the Anthropic JSON-schema helper and both Whisper caption functions with a known non-empty caption fixture.
- The final two-architecture package gate passes 30 tests. Both architectures pass package-content, artifact-integrity, architecture, strict-signature, real packaged PTY, isolated-startup, tray-image, and child-process cleanup checks.
- A cold x64 dependency probe took 34 seconds under Rosetta. The child process now has a 60-second timeout and Vitest has a 70-second timeout, while native Intel testing remains a final release gate.
- The sample packages skipped notarization because the current hook does not consume the approved App Store Connect API key. Task 11 must add API-key support and fail closed. This is an expected Task 4 package gate, not a release trust pass.
- Live sound playback, tray interaction, microphone voice, and live VAD remain later release gates. The external Claude review findings were corrected, and three independent final repository reviews found no remaining Task 4 commit blocker.
- An earlier arm64 startup probe logged a repeated Electron menu-model warning after tray creation. It did not appear in the final short arm64 or x64 startup probes. Task 7 and a longer manual tray gate must confirm that result before release acceptance.

Expected commit message:

```text
perf: stop shipping renderer and foreign native build inputs twice
```

## Task 5: Defer VAD code until the user starts VAD mode

- [x] Add a failing `tests/unit/useVAD.test.tsx` test that imports the hook without loading `@ricky0123/vad-web`.
- [x] Add failing tests for first start, repeated start and stop, load failure, and unmount during module loading.
- [x] Run the tests and confirm they fail because `useVAD.ts` imports `MicVAD` at module load.
- [x] Change the runtime import to a cached dynamic import inside `start()`.
- [x] Keep a type-only import for TypeScript.
- [x] Set `model: 'legacy'` explicitly so the copied asset and selected runtime model cannot drift.
- [x] Add a failing asset test that expects only the explicitly selected legacy model.
- [x] Remove `silero_vad_v5.onnx` from `scripts/copy-vad-assets.cjs` only after the explicit model test passes.
- [x] Keep cancellation safe when the component unmounts before the import or internal start finishes.
- [x] Build and record the initial chunk and deferred VAD chunk sizes.
- [x] Rebuild both macOS architectures and pass the 30-test package gate against the fresh archives.
- [ ] Run manual recording, first VAD start, repeated start and stop, and permission-denial tests.
- [x] Complete three independent internal repository reviews and correct every finding.

Review:

- The initial hook suite failed 10 of 10 tests. The asset test found the stale V5 model, the bundle test found 33 VAD and ONNX modules in the static entry closure, and both old package samples failed the new exact four-file VAD rule.
- The final hook suite has 14 tests. It covers lazy loading, explicit legacy selection, `startOnLoad`, concurrent starts, serialized cleanup, StrictMode, stale callbacks, late instances, import retry, null rejection, unmount, and stop-restart races.
- The initial JavaScript entry decreased from 1,088.55 kB to 652.09 kB. VAD and ONNX now occupy one 429.57 kB deferred chunk. The static VAD closure and VAD HTML preload are empty.
- Removing the unused V5 model and related archive changes reduced each `app.asar` by 2,334,416 bytes, or 8.99%. The arm64 and x64 app samples each decreased by the same 2,334,416 bytes.
- The final normal suite passes 507 tests. The mac package suite passes 30 tests. TypeScript, Ruff, Prettier, the renderer build, production audit, and ESLint pass. ESLint has zero errors and the same 63 known warnings.
- Three internal repository reviews found and verified fixes for StrictMode remounting, real `startOnLoad` behavior, pending-start disposal, shared cleanup ownership, unknown rejection handling, stale callbacks after unmount, UTF-8 byte measurement, import retry, and Rollup chunk-name independence.
- The fresh v3.3.1 arm64 and x64 samples are Developer ID signed package controls. They are not v3.4.0 release candidates and were not notarized. Live microphone and VAD behavior remains a final release gate.

Expected commit message:

```text
perf: avoid loading voice activity detection during app startup
```

## Task 6: Remove the undeclared ElevenLabs multipart dependency and add request deadlines

**Root cause:** `electron/main.cjs` calls development-only `form-data`. Both current macOS packages omit that module, and Electron's native `fetch` does not correctly serialize its object. The batch path also uses the wrong ElevenLabs multipart field name, reuses a consumed body, multiplies SDK retries, and has no full-operation deadline or user cancellation contract. Real-time setup can remain pending after a pre-open error and can reconnect after the user stops it.

- [x] Add failing request-policy tests for a 30-second attempt deadline, three total attempts, fixed one-second and two-second abortable delays, a 100-second operation budget, concurrent isolation, and complete timer and listener cleanup.
- [x] Prove that only transient network failures, HTTP 408, HTTP 429, HTTP 500 through 599, and attempt timeouts retry. Prove that caller cancellation and other HTTP 4xx responses do not retry.
- [x] Add failing ElevenLabs request tests for exact binary bytes, the `file` field, filename `audio.webm`, media type `audio/webm`, `model_id=scribe_v1`, the API key header, fresh bodies, response parsing, and safe non-2xx errors.
- [x] Run the request helper from an isolated fixture after `npm prune --omit=dev --ignore-scripts`. Prove that it does not resolve third-party modules.
- [x] Assert that AudioBash does not declare or require `form-data` and that native `FormData` does not receive an explicit multipart `Content-Type` header.
- [x] Implement `electron/transcriptionRequest.cjs` so one operation budget can run multiple provider stages. Give every attempt a fresh `AbortController`, stop it at the smaller of 30 seconds or the remaining operation budget, and clear every timer and abort listener in `finally`.
- [x] Implement `electron/elevenLabsRequest.cjs` with native `FormData`, `Blob`, and `fetch`. Build a new multipart body inside each retry attempt and let `fetch` generate the boundary.
- [x] Extract the batch provider handlers into one named main-process module. Pass the attempt signal and timeout to Gemini. Pass `signal`, `timeout`, and `maxRetries: 0` to every OpenAI and Anthropic SDK call.
- [x] Share one 100-second budget across Whisper plus GPT and Whisper plus Anthropic. Return stable timeout and cancellation codes without exposing keys or request bodies.
- [x] Add a unique request ID to each renderer batch request, one main-process controller per active request, and a `cancel-transcription` IPC channel. Test concurrent isolation, early cancellation, duplicate IDs, active cancellation, and registry cleanup.
- [x] Make `TranscriptionService` accept a caller signal and send the matching cancel IPC call. Make `VoiceOverlay` abort the active batch request when the user cancels, starts a replacement, or unmounts.
- [x] Add failing real-time service and hook tests for error-before-open, close-before-open, repeated connect calls, stop and unmount during setup, retry-delay cancellation, stale socket events, and no late PCM start.
- [x] Give real-time setup the same contract of at most three attempts with one-second and two-second abortable delays. Keep it in the renderer and do not move streaming audio into the main process.
- [x] Replace the warning-only timeout stress test and local timeout simulation with assertions against the production request policy under fake time.
- [x] Add a packaged Electron smoke test for both architectures. Load the native multipart helper from `app.asar`, inspect a fake request without network access, and prove that `form-data` is absent.
- [x] Keep local Parakeet and local Whisper process work out of this task. Record Parakeet's missing HTTP deadline as a known limit; Task 10 owns Whisper and FFmpeg process-tree cleanup only.
- [x] Run focused unit tests, stress tests, the normal suite, type checks, lint, formatting, main-process syntax checks, production audit, both macOS package builds, and the packaged suite.
- [x] Complete three independent internal repository reviews and correct every finding.
- [x] Commit the reviewed Task 9 tree.

Review:

- The initial combined Task 6 run failed 27 tests and could not load the missing request module. Later red tests reproduced nested network errors, a non-transient 4xx status that retried, late success after cancellation, failed real-time setup that reported success, repeated stop commits, reflected provider error data, and an active PCM stream after a server error.
- The final normal suite passes 610 tests in 34 files. The focused Task 6 suite passes 171 tests in 10 files. TypeScript, five main-process syntax checks, Ruff, Prettier, the renderer build, production audit, and ESLint pass. ESLint has zero errors and 58 known warnings.
- One 100-second budget now owns each cloud operation. Each provider attempt has a 30-second limit, at most three attempts, and abortable one-second and two-second delays. Provider SDK retries are disabled so they cannot multiply the outer policy.
- Renderer cancellation is authoritative. A late cloud or local success is rejected after cancellation. Main-process cancellation uses one controller per request ID, includes bounded early-cancel storage, and does not expose provider error text, keys, or audio data.
- ElevenLabs batch transcription uses native `FormData`, `Blob`, and `fetch`, creates a new body for each attempt, and sends the required file metadata. The isolated production fixture resolves no third-party dependency and inherits no user secrets or Node options.
- ElevenLabs real-time setup has the same three-attempt timing contract, prevents reconnect after stop, rejects failed starts, treats server errors as terminal, and separates a graceful one-commit stop from discard cancellation.
- Fresh v3.3.1 arm64 and x64 internal packages pass 32 package tests, including execution of the multipart helper from each packaged ASAR. Strict signature validation passes for both apps, and neither ASAR contains `form-data`. The app sizes are 278 MB and 287 MB. The arm64 DMG and zip are 112 MB and 107 MB. The x64 DMG and zip are 119 MB and 115 MB. These samples skip notarization and are not release candidates.
- Three internal reviews covered the package boundary, privacy boundary, and release lifecycle. The final review found two stale-resource races and one stop-path test gap. Test-first corrections now prove replacement stream ownership, cleanup after five partial PCM setup failures, normal and repeated stop cleanup, and cleanup when final audio delivery throws.
- Local Parakeet requests still have no HTTP deadline. AudioBash does not start or own the separate Parakeet server process. Task 10 owns local Whisper and FFmpeg process-tree cancellation and shutdown behavior.

Expected commit message:

```text
fix: keep cloud transcription bounded and self-contained in production
```

## Task 7: Update vulnerable build and runtime dependencies in controlled groups

### Resume checkpoint from August 28, 2026

- [x] Recover the August 27 handoff and confirm the linked worktree, branch, package controls, and uncommitted Electron group.
- [x] Repeat the x64 Launch Services start and quit test three times with one-second timing and retained app logs.
- [x] Run the same Launch Services timing test for arm64 as the control.
- [x] Inspect process-specific macOS unified logs for each shutdown interval without searching user data or secrets.
- [x] Record an x64-only Launch Services shutdown timeout observed under Rosetta and retain the earlier unbounded direct-launch result as unreproduced harness-only evidence.
- [x] Make no source fix because all normal launches accepted quit and exited; keep native Intel timing as a Task 13 gate.
- [x] Complete the final internal repository review for the Electron 43.4.1 group. It returned four P2 findings and no P0, P1, or P3 finding.
- [x] Add a test-first package gate that rejects stale `main.cjs` or `trayLifecycle.cjs` bytes and checks the bundle identity and versions.
- [x] Add a test-first package gate that rejects any packaged Mach-O deployment target later than macOS 12.0.
- [x] Retain one more x64 Launch Services run with explicit post-quit checks for the main process and PTY.
- [x] Use the same non-causal quit classification and Task 13 Intel gate in the task, release evidence, and handoff.
- [x] Complete the correction review with no open P0-P2 finding and correct its two P3 evidence-count notes in the final gate update.
- [x] Rerun the focused Electron suite, the full suite, static checks, audits, and the two-architecture package gate.
- [x] Review every uncommitted line, update the Task 7 evidence, and commit the Electron group.

- [x] Add `engines.node` as `>=22.13.0 <23`, add `.nvmrc` with the tested `22.17.1` runtime, pin `packageManager` to `npm@10.9.2`, and add a release verifier that requires those exact tested Node and npm versions.
- [x] Update CI and build workflows to the same Node 22 line before packages that require Node 22.
- [x] Add Dependabot cooldowns of 30 days for major updates, 7 days for minor updates, and 3 days for patch updates. Keep security updates outside the cooldown and require the normal audit and test gates before merge.
- [x] Update the low-risk group first: `electron-builder` 26.15.3, Vite 6.4.3, Vitest 4.1.11, coverage 4.1.11, concurrently 9.2.4, PostCSS 8.5.26, and protobufjs 7.6.5.
- [x] Do not use protobufjs 7.6.6 before August 30, 2026. It was published on August 27 and has not passed the three-day cooldown.
- [x] Run install, audit, tests, lint, type checks, build, and arm64 directory package after this group.
- [x] Treat the supported Electron major as the reason for the v3.4.0 minor release. Update it only after the signed Electron 39 baseline control packages and pruned Electron 39 packages both pass. Electron 39 is a compatibility baseline only and cannot ship in v3.4.0.
- [x] On August 27, 2026, verify the current stable Electron release and its support status from official Electron sources and `npm view electron version`. Record one exact `RELEASE_ELECTRON_VERSION` in the release evidence before changing dependencies.
- [x] Use `RELEASE_ELECTRON_VERSION=43.4.1`. Do not use Electron 44.0.0 because it was published on August 24, 2026 and removes macOS 12 support, which conflicts with AudioBash's current compatibility promise.
- [x] Update Electron to the recorded `RELEASE_ELECTRON_VERSION` in a separate commit. Use that same version for every later package, test, workflow, document, and stop condition.
- [x] If the selected supported Electron release fails a proven compatibility test, stop and diagnose. Do not silently downgrade or publish on unsupported Electron 39. Select another supported line only after documenting the exact incompatibility and getting user approval.
- [ ] Test window startup, tray, global shortcuts, microphone permission, node-pty, preload APIs, preview capture, VAD WASM, all transcription providers, and app quit.
- [x] Require `npm audit --omit=dev` to report zero findings for unbundled main-process runtime dependencies.
- [x] Generate an inventory of renderer packages bundled by Vite. Moving a package to `devDependencies` is a package-size change, not a vulnerability fix.
- [x] Use full `npm audit` to cover renderer build inputs and release tooling. Require zero critical and zero high findings, and add a reachability note for each remaining moderate or low finding.
- [x] Record any moderate or low residual finding with reachability evidence and user approval before release. No residual finding remains after the Electron 43.4.1 update.
- [x] Update Browserslist data and confirm the stale-data warning is gone.
- [x] Complete an independent internal repository review after the low-risk dependency group.
- [x] Complete an independent internal repository review after the Electron 43.4.1 group. The final review found four P2 evidence and package-policy gaps. Test-first corrections closed all four, and the correction review found no open P0-P2 item.

### First dependency group review

- The final internal review passes with no open finding.
- Both npm tree queries pass. The invalid cross-major brace-expansion override is removed and covered by a regression test.
- The final lock uses no package younger than 72 hours. All 152 changed package-version pairs match registry integrity data and carry registry signatures.
- The production audit has zero findings. The full audit contains only the Electron 39 and extract-zip high-severity chain assigned to the next dependency group.
- The full suite passes 636 tests in 36 files. The focused toolchain suite passes 26 tests. Static checks, the renderer build, and the rebuilt signed arm64 package control pass.
- The rebuilt control embeds the current manifest and passes content, architecture, hardened-signature, secure-timestamp, native-file, and real packaged PTY checks. It is not notarized and is not a release candidate.

### Electron group review

- The first review found that clean test installs did not prepare Electron 43.4.1 before the compatibility test read its executable. All test entry points now prepare native binaries and Electron. A retained clean-state proof starts without Electron `dist` or `path.txt`, runs the real `pretest` lifecycle, and verifies the rebuilt 43.4.1 runtime.
- The review also found missing package assertions for `trayLifecycle.cjs` and the macOS 12 floor. Both final packages contain the tray module, declare `LSMinimumSystemVersion` 12.0, and have a Mach-O `minos` value of 12.0.
- A real arm64 GUI test found that the packaged mac window still received the omitted Windows icon path. Passing `undefined` also produced an Electron warning. The final code omits the `icon` property on macOS, and the rebuilt package starts with a clean log.
- The final review found four P2 gaps: stale packaged source could pass, the bundle identity was not checked, only the main executable's deployment target was checked, and the retained quit proof and classification were incomplete. Test-first corrections compare the exact packaged `main.cjs` and `trayLifecycle.cjs` bytes, check the bundle identity and versions, and reject any packaged Mach-O deployment target later than macOS 12.0. The correction review found no open P0-P2 item. Its two P3 evidence-count notes are corrected here. The fresh package gate passes 38 tests for both architectures and skips only four final DMG and zip assertions. Both controls pass current-source, identity, Electron, PTY, deployment-target, architecture, hardened-signature, secure-timestamp, and native-file checks.
- The final arm64 package quits promptly after a direct GUI launch. The first final x64 test used a direct pseudo-terminal launch; it reaped its PTY but did not exit and ignored `SIGTERM`. The exact process was killed only after its log and stack sample were saved. A first normal Launch Services run exited after about 27 seconds.
- Five x64 Launch Services controls on August 28 accepted normal quit and exited after observed intervals of 6, 5, 4, 9, and 53 seconds. The fifth run used the fresh final x64 package, had a 54-second wall-clock interval, and retained explicit no-main-process and no-PTY results. The arm64 control exited in 1 second. Runs 2 through 5 retain explicit no-PTY results, and runs 4 and 5 also retain explicit no-main-process results. Run 1 did not retain the per-run PTY check. The x64 unified logs show `LSExceptions shared instance invalidated for timeout` before final process exit; the arm64 log does not. The observed fact is an x64-only Launch Services shutdown timeout under Rosetta, with a 4-to-54-second observed wall-clock range; the evidence does not assign its cause. The earlier unbounded direct-launch result remains harness-only evidence that did not reproduce through the normal launch path. No forced-exit workaround is justified. Native Intel quit timing remains a Task 13 release gate.
- The final focused source gate passes 80 tests in six files, including six package-policy unit tests. The normal suite passes 649 tests in 39 files. TypeScript, CommonJS syntax, Ruff check and format, Prettier, the renderer build, both dependency-tree queries, both zero-finding audits, registry signature verification, and `git diff --check` pass. ESLint reports zero errors and 58 known warnings.
- Live microphone, VAD, provider, preview, tray interaction, shortcut behavior, notarization, final archive, clean-download, and Monterey hardware tests remain later release gates.

Expected commit messages:

```text
build: remove known flaws from the release toolchain
build: move AudioBash to a supported Electron security line
```

## Task 8: Make lint and React state gates truthful

- [x] Add a Terminal behavior test that changes `fontSize` and `theme` after mount and checks the live terminal options.
- [x] Add a VoiceOverlay behavior test that switches the active tab and checks that the next transcription routes to the new tab.
- [x] Run the tests before changing hook dependencies. If either test already passes, document the warning as non-behavioral and use the smallest valid lint correction.
- [x] Fix the two hook dependency warnings without recreating terminals, reconnecting listeners, or sending text to a stale tab.
- [x] Remove unused variables and explicit `any` values only in files already changed by this release. Do not widen the release with unrelated type refactors.
- [x] Keep terminal control-character regex exceptions.
- [x] Record the exact warning count after Task 7 and after the two behavioral warnings and touched-file warnings are fixed. The final count must be 64 or lower. Set ESLint `--max-warnings` to that measured final count, prove it passes the current commit, and prove a test fixture with one added warning fails. If the final count is 65 or higher, stop and diagnose instead of weakening the budget or closing this task.
- [ ] Create a follow-up issue for the remaining untouched warnings. Zero warnings remains the codebase goal, but unrelated warning cleanup does not block this stability release.
- [x] Add a reproducible local Ruff setup command and run both `ruff check` and `ruff format --check`.
- [x] Run affected tests after each file and the full suite after the batch.
- [x] Complete three independent internal repository reviews and correct every finding.
- [x] Receive a clean final cross-model correction review and commit.

Evidence and review:

- Task 7 ended with zero ESLint errors and 58 warnings. The two hook warnings were in `Terminal.tsx` and `VoiceOverlay.tsx`.
- The first Terminal live-value test and a VoiceOverlay rerender test passed before source changes. The first VoiceOverlay test called the current prop callback and did not exercise the retained Electron listener. A stronger test kept the original listener, switched from `tab-1` to `tab-2`, and then failed because terminal context still used `tab-1`. The latest-actions ref correction makes that same saved listener use `tab-2` without a new subscription.
- The Terminal keeps one xterm instance while live font-size and theme options change. Its data, selection, and Electron terminal-data listeners each remain single subscriptions. A strengthened test failed until a focused pane began using the defined accent ring while recording. Idle focus styling is unchanged; the pre-existing `ring-acid/60` utility is not defined by the Tailwind theme and is recorded for later visual cleanup.
- ESLint warning counts were 58 at baseline, 50 after the hook and test corrections, and 34 after cleanup limited to release-touched files. The 34 remaining warnings are in 13 untouched files. The terminal control-character regex exceptions are unchanged.
- Task 8 completed at 34 warnings. Later Task 10 changes reduced the current count to 33. `npm run lint` now passes at exactly 33 warnings. An isolated temporary workspace copies Git-tracked and nonignored lint inputs, adds warning 34, and makes the same command fail against `--max-warnings 33`. ESLint also ignores local `.audit` and `.worktrees` content. This is a net-warning ratchet; the follow-up zero-warning issue will remove the identity-replacement gap.
- `npm run setup:ruff` prepares and reports Ruff 0.15.1 through `uv tool run`. `npm run lint:py` uses the same pinned uv environment for both `ruff check` and `ruff format --check`; both pass across seven Python files.
- The focused Task 8 gate passes 89 tests in five files. Its normal suite passed 656 tests in 40 files. TypeScript, CommonJS syntax, Ruff, Prettier, the exact Node/npm toolchain check, the renderer build, generated `.ring-accent` CSS, and `git diff --check` passed. The current tree reports zero ESLint errors and 33 warnings.
- Three independent internal reviews found lifecycle, cleanup, portability, timeout, isolation, Ruff-version, evidence, mock-fidelity, and stale-count defects. All internal findings are corrected, and their correction reviews report no open P0-P3 item.
- The cross-model review found that the first lint fixture could copy the primary checkout's 9.4 GB worktree store, that local evidence remained in the normal lint scope, and that several tests and evidence statements were not precise enough. Git-listed inputs, explicit ESLint ignores, zero-budget grammar, absent-path handling, npm-launch fallback, mock parity, and corrected evidence close those findings. The final cross-model correction review reports zero unresolved P0-P3 items.
- The follow-up GitHub issue is specified but not created. It remains behind explicit user approval.

Expected commit message:

```text
refactor: prevent net lint warning growth in release changes
```

## Task 9: Keep preview watching alive across atomic saves

**Root cause:** The file-level `fs.watch` attaches to one file identity. The inline callback ignores its `rename` event, does not attach to the replacement inode, and treats a 300 ms delay as proof that the file is stable.

- [x] Add an in-place write control test. It passed against the extracted legacy watcher.
- [x] Add a failing test that writes a temporary file and renames it over the watched file three times.
- [x] Add tests for unrelated directory changes, delete and recreate, bounded recovery, one refresh per completed save, and cleanup.
- [x] Before the parent-directory implementation, run `npx vitest run tests/unit/fileWatcher.test.ts` and confirm the atomic replacement test fails for the recorded root cause.
- [x] Implement a parent-directory watcher in `electron/fileWatcher.cjs`.
- [x] Treat events as signals. Reconcile the exact target path with `stat`, require stable size and modification data across two checks 100 ms apart, and adopt the new device and inode values after replacement.
- [x] Use one 300 ms debounce timer and at most 20 stability checks over two seconds per target. Return one clear error after the bound. Do not add an unbounded poll.
- [x] Close the watcher and all timers on explicit unwatch and app shutdown.
- [x] Replace the inline watcher code in `electron/main.cjs` with the module.
- [x] Run unit tests and an editor-to-manager loop with an editor that uses atomic saves.
- [x] Run application-level manual preview loops through the renderer, preload bridge, IPC handler, and visible preview refresh for local HTML, markdown, and image files. The development HTTP origin blocks the local `file:` iframe. The fresh packaged arm64 loop passed all three paths and confirmed delivery of the response-header CSP.
- [x] Complete three independent internal repository reviews, correct every finding, and commit.

Evidence so far:

- The macOS trace showed one in-place `change`, one `rename` for the first inode replacement, and no file-watch events for later replacements. The parent-directory watcher stayed active.
- The legacy in-place control passed. The legacy three-replacement test failed with zero refreshes.
- The watcher suite passes 33 of 33 tests on the current case-insensitive macOS arm64 volume, including real filesystem, symlink topology, dual-slot recovery, and deterministic timer coverage. Windows skips the six macOS or non-Windows filesystem tests. A case-sensitive macOS volume skips the host case-variant test and keeps the deterministic canonical-name test.
- The first packaged image loop exposed a separate Chromium cache fault: replacing the image element with the same file URL kept the old decoded image. Three renderer regression tests cover local cache invalidation, unchanged signed remote URLs with element remounting, and invalid relative image input. The complete focused gate passes 36 tests in two files.
- A Vim loop used `backupcopy=no` for three saves. Each save changed the inode, produced one refresh with the final bytes, and left later saves active.
- The final packaged arm64 loop passed three atomic saves each for HTML, Markdown, and SVG image previews. Every save changed the inode. Visible HTML and Markdown text advanced through values 1, 2, and 3. Visible SVG width advanced through 111, 121, and 131.
- Electron delivered the response-header CSP for the packaged `file:` main document. The response policy and HTML meta policy are not identical, so both apply. Their same-origin rules allowed the local iframe, fetch, and image paths.
- Fresh signed arm64 and x64 directory controls contain the final renderer build and exact watcher source. The package gate compares their bytes with the current tree. The mac package suite passes 40 tests and skips four DMG and zip checks. Notarization was intentionally skipped, so these controls are not release candidates.
- Review corrections cover startup races, canonical filename spelling, final-component symlinks, change and error callback failures, a rolling native watcher recovery bound, hard metadata errors, failed canonical path resolution, and shutdown during startup.
- Replacing either watched parent directory remains a documented limit. Supporting that case needs ancestor watchers and is outside the approved atomic-file replacement scope.
- A terminal native watcher failure is written to the structured main-process log but is not shown in the preview status bar. Close and reopen the preview pane or change the preview path to start a new watcher.
- The final Task 9 normal suite passes 692 tests in 42 files. The current ESLint ratchet permits 33 warnings. Ruff, TypeScript, Prettier, CommonJS syntax, the renderer build, `git diff --check`, and the production dependency audit pass. The audit reports zero vulnerabilities.
- Three final internal correction reviews report no open P0-P3 finding. The independent Claude review found renderer URL, package freshness, evidence, formatting, contract, and timing gaps. Those findings are corrected and covered by the final gates. Two later narrow Claude correction runs stalled without output and were stopped after extended monitoring.

Expected commit message:

```text
fix: keep preview refresh attached after atomic file saves
```

## Task 10: Own local transcription processes through completion

**Root cause:** FFmpeg and Whisper processes have no single lifecycle owner. Timeout, cancellation, and shutdown can finish while descendants or output streams still run.

- [x] Add a failing macOS integration test that starts a parent with a child, stops the parent, and proves the child remains without tree cleanup.
- [x] Add unit tests with injected process APIs for exact Windows launcher-handle termination and POSIX process-group termination.
- [x] Add an integration assertion that each POSIX transcription launcher is spawned with `detached: true` and has a process-group identifier different from the Electron process group. Never call `process.kill(-pid)` without this proof.
- [x] Add failing tests for timeout, explicit cancellation, app shutdown, output drain, double cancellation, and a process that ignores the first termination signal.
- [x] Run the targeted tests and confirm the descendant test fails.
- [x] Start each FFmpeg and Whisper target through a gated launcher. Use a proved POSIX process group or a Windows kill-on-close Job Object that receives the suspended target before resume.
- [x] Implement `electron/processTree.cjs` with three-second graceful and two-second force stages on POSIX, plus one exact-handle Windows termination with a five-second total bound.
- [x] Implement `electron/transcriptionJob.cjs` as the owner of FFmpeg, Whisper, output streams, timers, abort state, and final status.
- [x] Do not publish `complete`, `failed`, or `cancelled` until all owned processes exit and streams close.
- [x] Refactor `electron/whisperService.cjs` to use the job owner.
- [x] Make app shutdown wait for job cleanup with a bounded deadline before the final quit.
- [ ] Run macOS integration tests and Windows process-tree tests in GitHub Actions.
- [x] Verify no child FFmpeg or Whisper process remains after timeout, cancel, or quit.
- [x] Complete three independent internal repository reviews and correct every finding.
- [x] Prepare the reviewed Task 10 tree for commit.

Review:

- The exact focused local lifecycle gate passes 182 tests in nine files on macOS. CI uses the same eight shared files and one native integration file per host.
- The platform-inclusive correction gate passes 182 tests and skips seven tests; nine files pass and one Windows-only file is skipped. The serialized normal suite passes 829 tests and skips seven tests; 51 files pass and one Windows-only file is skipped. ESLint passes with zero errors and 33 warnings. TypeScript, CommonJS syntax, Ruff, Prettier, `git diff --check`, the production renderer build, and the production dependency audit pass. The audit reports zero vulnerabilities.
- Real macOS integration covers the unsafe direct-parent control, ownership proof, clean and nonzero exits, inherited output pipes, parent-status lease loss, graceful-to-force escalation, two separate stage groups, timeout, cancellation, and shutdown.
- Injected Windows tests cover strict readiness and result ordering, saved-PID rejection, clean and nonzero target exits, one forceful exact-handle termination, separate signal and owner timeouts, failed-spawn handle safety, and malformed, duplicate, oversized, or missing status.
- Native Windows tests cover difficult argument round trips, clean and nonzero target exits with detached descendants, and Job closure after Node-launcher status loss. Remote execution is pending.
- The Windows build copies the Job owner to the physical resources directory and runs a packaged Electron process-tree probe before artifact upload. macOS packaging excludes the Windows-only helper. Fresh unsigned arm64 and x64 controls build successfully, and all 46 package tests pass. The package tests include bounded timeout cleanup and prove that the Windows-only helper is absent. Three final internal reviews and the independent Claude correction review report no remaining P0-P3 finding. The packaged Windows helper smoke and remote CI remain pending.
- Windows stop completion uses launcher-handle closure and the Job Object's kill-on-close contract. It does not perform a second PID-based target liveness query because PID reuse would weaken the exact-handle boundary. Native Windows integration and package-probe tests remain the required proof of target-tree cleanup.

Expected commit message:

```text
fix: reap local transcription process trees before jobs finish
```

## Task 11: Make signing, notarization, and release assets fail closed

- [ ] Add tests that development mode can use explicit ad hoc signing and explicit notarization skip.
- [ ] Add failing tests that release mode rejects missing Developer ID, missing Apple credentials, skipped notarization, failed native signing, failed stapling, and a missing expected asset.
- [ ] Change `scripts/notarize.cjs` to accept a keychain profile or the documented Apple credentials.
- [ ] Use `CSC_KEY_PASSWORD` as the only PKCS #12 password variable name across code, CI, and docs. Do not reuse it for App Store Connect API-key authentication.
- [ ] Use only the credential method approved in Task 0. If CI signing is approved, import the encrypted PKCS #12 file into a temporary build keychain, set key partition access for codesign, verify the identity, and delete the temporary keychain after the job.
- [ ] In release mode, throw when credentials are absent or notarization fails.
- [ ] Keep `SKIP_NOTARIZE=true` valid only for an explicit development build.
- [ ] Update `.github/workflows/build.yml` to Node 22 and a two-entry macOS architecture matrix.
- [ ] Make the release-candidate build run from `workflow_dispatch` on an exact reviewed commit. Do not rebuild different bytes from a tag push.
- [ ] Remove the `push.tags: v*` build trigger, or make every package and release-upload job refuse tag-push events. Add a workflow test that proves a tag push cannot build or upload release assets.
- [ ] Keep architecture outputs separate and upload one named artifact per architecture.
- [ ] Define the artifact templates in `package.json`: macOS `${productName}-${version}-${arch}.${ext}`, Windows `${productName}.Setup.${version}.${ext}`, and Linux `${productName}-${version}.${ext}`. Implement `scripts/releaseArtifacts.cjs` to resolve these templates from package metadata. Make tests, workflows, docs, and `scripts/verify-macos-release.cjs` consume the resolved names instead of duplicating filename rules.
- [ ] Add `scripts/verify-macos-release.cjs` checks for the resolved exact names, current version, expected architecture, SHA-256, executable modes, nested signatures, app signature, notarization ticket, and staple.
- [ ] Enumerate every nested executable and verify it with `codesign --verify --strict --verbose=4`. Verify the top-level `.app` with the same command. Do not use `--deep` as a substitute for nested-file checks.
- [ ] Run `spctl --assess --type execute --verbose=4` only after notarization and stapling complete.
- [ ] Run `xcrun stapler validate` on each `.app` and DMG. For each zip, verify its hash, extract it, and run the app signature, ticket, and Gatekeeper checks on the extracted app.
- [ ] Make the workflow fail when any expected arm64, x64, Windows, or Linux artifact is absent.
- [ ] Set `fail_on_unmatched_files: true` and keep the release draft.
- [ ] Preserve the verified workflow artifact hashes so Task 14 can attach those exact files to the tag and draft release.
- [ ] Keep the current entitlement set in v3.4.0. Create a follow-up issue to test removal of `com.apple.security.network.server` after the first clean notarized release.
- [ ] Do not export the local signing private key or add GitHub secrets unless Task 0 records separate user approval for that exact credential step.
- [ ] Complete separate internal security and release reviews, correct every finding, and commit.

Expected commit message:

```text
build: make mac release trust checks mandatory
```

## Task 12: Make one source control the release version and update documentation

- [ ] Add failing tests that compare `package.json`, the lock file, `docs/js/version.js`, release notes, bundle metadata, and artifact names.
- [ ] Implement `scripts/sync-version.cjs` with `package.json` as the source.
- [ ] Add `version:check` and `version:sync` scripts.
- [ ] Run all targeted code gates and one directory package per mac architecture before changing the version. The final versioned package and manual gates run in Task 13.
- [ ] Bump `package.json` and the lock file to `3.4.0` with no tag.
- [ ] Run `version:sync` and review every generated version change.
- [ ] Add the v3.4.0 release card, date, fixes, measured size changes, security changes, and platform downloads.
- [ ] Use `scripts/releaseArtifacts.cjs` to update and test every documented download. For v3.4.0, require `AudioBash-3.4.0-arm64.dmg`, `AudioBash-3.4.0-x64.dmg`, `AudioBash-3.4.0-arm64.zip`, `AudioBash-3.4.0-x64.zip`, `AudioBash.Setup.3.4.0.exe`, `AudioBash-3.4.0.AppImage`, and `AudioBash-3.4.0.deb`.
- [ ] Update `.claude/rules/release-process.md` to use `release/`, the verified pre-tag artifact flow, current signed macOS installation steps, and exact current-version assets.
- [ ] Remove the rule that renames and reuses an older-version DMG in a new release. Every v3.4.0 binary must contain v3.4.0 bundle metadata and come from the reviewed commit.
- [ ] Update README and macOS docs to describe signed and notarized behavior only after it is proven.
- [ ] Update the manual checklist to expect normal Gatekeeper launch for the release build.
- [ ] Keep the existing SVG favicons and add missing release-page Open Graph and Twitter metadata using the existing on-brand image.
- [ ] Test every public page locally and run the documentation tests.
- [ ] Complete separate internal writing and release reviews, correct every finding, and commit.

Expected commit message:

```text
release: identify the supported Electron stability build as v3.4.0
```

## Task 13: Run the full verification and manual macOS stress session

- [ ] Start from a fresh `npm ci` and the pinned Node/npm versions.
- [ ] Run:

```bash
npm run format:check
npm run lint
npm run lint:py
npm run typecheck
npm test
npm run test:coverage
npm run build
npm audit --omit=dev
npm audit
git diff --check
```

- [ ] Require zero test failures, zero skipped release assertions, no warning-budget increase, zero type errors, zero format errors, zero unbundled runtime audit findings, and zero critical or high full-audit findings.
- [ ] Build arm64 and x64 packages in sequence. Do not run another Vite build while packaging is active.
- [ ] Run the required mac package tests against both outputs.
- [ ] Compare pre-change and final `.app`, `app.asar`, `app.asar.unpacked`, DMG, zip, initial JavaScript, and VAD asset sizes.
- [ ] Install the arm64 DMG on Apple Silicon from a quarantined download path.
- [ ] Test the x64 DMG under Rosetta. Record Intel hardware as still required if no Intel Mac is available.
- [ ] Test first launch, repeated launch, terminal creation, shell input and output, four panes, rapid resize, pane close, tray hide and restore, global shortcuts, force-quit recovery, microphone grant and denial, all four sounds, manual voice, VAD voice, Gemini, OpenAI, Anthropic, ElevenLabs batch, ElevenLabs real-time, local Whisper, preview atomic refresh, screenshot capture, and clean quit.
- [ ] Measure idle CPU, ten-minute memory trend, file descriptors, and remaining child processes.
- [ ] Run the Windows test and package job on a Windows GitHub runner and the Linux test and package job on an Ubuntu GitHub runner for the same commit.
- [ ] Make each platform job verify package version, expected filenames, package contents, main-process dependencies, and SHA-256 before upload.
- [ ] Download and inspect the Windows and Linux workflow artifacts. Treat them as release gates because the Electron and dependency changes affect all platforms.
- [ ] Run an internal review on the full diff and a separate internal review on the release workflow.
- [ ] Fix all critical and important review findings with test-first commits.
- [ ] Review each edited logic unit by eye: describe its job in one sentence, follow its happy path without tracking deep nesting, and confirm the surrounding author would recognize its style.
- [ ] Review every line of the final diff and update this plan review section.

## Task 14: Merge, tag, draft, download-test, and publish

- [ ] Push the release branch and open a pull request linked to #45, #46, #48, and #49.
- [ ] Require green CI and pre-tag macOS package checks.
- [ ] Require no failing checks, no requested changes, and no unresolved review threads.
- [ ] Confirm the PR diff contains no secrets, generated packages, logs, or unrelated changes.
- [ ] Squash-merge only when the branch is green and clean.
- [ ] Confirm `master` matches the reviewed merge commit.
- [ ] Run the release-candidate workflow with `workflow_dispatch` on the exact merged commit before tagging.
- [ ] Download its macOS, Windows, and Linux artifacts and confirm their hashes match the workflow manifest.
- [ ] Repeat the full downloaded macOS artifact checks before any tag exists.
- [ ] Tag only the already-tested commit as `v3.4.0` and push the tag without rebuilding artifacts.
- [ ] Verify the tag push did not start a package or release-upload workflow before creating the draft.
- [ ] Create a draft GitHub release and attach the exact pre-tag-tested files and SHA-256 manifest.
- [ ] Confirm the draft has the exact arm64 DMG, Intel DMG, two macOS zips, Windows installer, Linux AppImage, Linux deb, and SHA-256 file.
- [ ] Download the draft artifacts instead of testing local files again.
- [ ] Repeat signature, staple, Gatekeeper, checksum, install, PTY, voice, preview, and quit checks on the downloaded artifacts.
- [ ] Publish the release only after downloaded artifacts pass.
- [ ] Test all website download links for HTTP 200 and correct hashes.
- [ ] Close #45, #46, #48, and #49 with links to the tests and release evidence.
- [ ] Leave #47 open.
- [ ] Confirm the final worktree is clean and remove it only after the release is verified.

## Task 15: Prove the Mac App Store route before submission

- [ ] Read the current official Apple documentation for macOS TestFlight, App Store distribution, sandboxing, entitlements, certificates, provisioning profiles, privacy manifests, and upload validation. Record links and access dates.
- [ ] Use the root agent for every Apple browser action. Do not let a subagent inspect credentials, control the browser, accept terms, create records, create certificates, create profiles, upload a build, add testers, or submit for review.
- [ ] Reconnect to the signed-in Apple browser session and perform read-only checks for agreements, roles, bundle identifiers, certificates, profiles, and App Store Connect access. Do not print or store secret values.
- [ ] Stop for user approval immediately before each account mutation, agreement acceptance, certificate or profile creation, app-record creation, upload, tester invitation, TestFlight submission, or App Review submission.
- [ ] Add a separate App Store package configuration. Do not weaken the Developer ID build, its hardened runtime, or its notarization gates.
- [ ] Prove whether the App Sandbox can support AudioBash terminal creation, PTY control, shell child processes, microphone capture, local transcription processes, file preview, screenshots, and network transcription without private entitlements or policy violations.
- [ ] If a core terminal path cannot work within current App Store rules, stop before creating or uploading a misleading build. Record the exact limitation and keep the signed and notarized direct release as the supported macOS route.
- [ ] If feasible, add failing configuration tests for the App Store bundle identifier, target, distribution certificate, provisioning profile, sandbox entitlements, helper entitlements, architecture, version, build number, and absence of Developer ID-only settings.
- [ ] Build the App Store package from the exact reviewed v3.4.0 commit. Run source tests, package tests, signature checks, sandbox checks, and a clean-device behavior pass.
- [ ] Validate the package with Apple's current command-line or Transporter workflow before upload.
- [ ] With user approval, create or update the App Store Connect record, upload the validated build, complete required privacy and export-compliance fields, and submit it to internal TestFlight.
- [ ] Confirm processing status and internal installation before any App Review submission.
- [ ] Prepare the App Review metadata, screenshots, support URL, privacy URL, reviewer notes, and test instructions. Submit for App Review only after separate user approval.

## Task 16: Prepare the Microsoft Store package and submission

- [ ] Read the current official Microsoft documentation for desktop app submission, supported package types, identity, signing, restricted capabilities, certification, privacy fields, and staged publication. Record links and access dates.
- [ ] Use the root agent for every Microsoft browser action. Do not let a subagent inspect credentials, control the browser, accept terms, reserve a name, create a product, change account data, upload a package, or submit it.
- [ ] Reconnect to the signed-in Partner Center browser session and perform read-only checks for account state, agreements, payout or tax blockers, product access, and available submission routes. Do not print or store secret values.
- [ ] Stop for user approval immediately before each account mutation, agreement acceptance, product-name reservation, product creation, identity assignment, upload, flight creation, or certification submission.
- [ ] Select the current supported Store route that preserves PTY, shell, child-process, microphone, file, screenshot, and network behavior. Record why the selected package type and capabilities fit AudioBash.
- [ ] Add failing configuration tests for package identity, publisher, version mapping, architecture, capabilities, artifact name, signing state, and manifest contents.
- [ ] Build the Windows Store package from the exact reviewed v3.4.0 commit and the same tested source used for the direct release.
- [ ] Run the full Windows test job, package-content checks, signature verification, installer and uninstall tests, clean-user launch, PTY and shell tests, microphone tests, local and cloud transcription tests, and Microsoft's current certification kit.
- [ ] Prepare the Store listing, screenshots, privacy URL, support URL, age rating, release notes, system requirements, and certification notes.
- [ ] With user approval, create or update the Partner Center product, upload the validated package, use a private flight when available, and submit for certification.
- [ ] Confirm ingestion, certification, staged availability, installation, update, and rollback behavior before public publication.

## Task 17: Update every release and documentation surface

- [ ] Inventory the README, changelog, v3.4.0 release notes, patch notes, website pages, download links, installation guides, support pages, privacy pages, developer docs, GitHub release text, Apple listing, Microsoft listing, and in-app version surfaces.
- [ ] Use one factual change list and one tested artifact manifest for every surface. Do not claim notarization, TestFlight, App Store, Microsoft Store, or public availability until that exact state is verified.
- [ ] Describe the debloat measurements, transcription deadlines and cancellation, microphone cleanup, dependency changes, supported Electron line, known limits, platform requirements, and direct-download trust behavior in plain language.
- [ ] Keep `package.json` as the version source. Require automated checks for version text, artifact names, download URLs, checksums, bundle metadata, Store versions, and release dates.
- [ ] Keep the existing on-brand SVG favicons on every public page. Add or verify complete Open Graph and social-sharing metadata and graphics for every published release page.
- [ ] Test every local page, external URL, download, checksum, image, favicon, social metadata field, install command, and store link before publication.
- [ ] Run separate internal writing, security, and release reviews. Read every changed line and correct each finding.
- [ ] Commit the final surface sweep only after its tests pass and the documented release states match the live systems.

## Stop conditions

Stop and re-plan before publication if any of these conditions occurs:

- A third attempted fix fails for the same root cause.
- The recorded `RELEASE_ELECTRON_VERSION` needs a product architecture change rather than a compatibility correction.
- An arm64 or x64 package contains the other architecture output.
- Package pruning removes a required runtime file.
- Signing, notarization, stapling, or Gatekeeper validation fails.
- The release needs a signing private key or Apple credential that the user has not approved for use.
- Intel behavior cannot be tested beyond Rosetta and the release risk is not accepted.
- A critical or high security finding remains.
- The final ESLint warning count is not below the measured baseline of 65.
- A critical or important internal review finding remains.

## Review record

### Plan review

- [x] Scope maps to the user request and current repository evidence.
- [x] Bug fixes use failing tests before implementation.
- [x] Version bump occurs after targeted code gates and before final versioned package gates.
- [x] Tagging and publication occur after signing and downloaded-artifact checks.
- [x] Public pages keep SVG favicons and gain missing social metadata before publication.
- [x] No credential value is stored in the plan.
- [x] Windows-only issue #47 is explicitly out of scope.
- [x] Claude Code plan review completed.
- [x] Apple credential, supported Electron, renderer audit, asset path, process group, cross-platform artifact, task order, entitlement, verification command, and pre-tag findings were resolved in the plan.
- [x] Claude Code re-review found one tag-trigger gap; the plan now prevents tag pushes from building or uploading different assets.
- [x] Claude Code evidence review found recoverable temporary private-key files. The evidence now keeps cleanup pending until the user approves permanent removal.
- [x] Claude Code execution review found ambiguous version, retry, script, warning-budget, password, audit-path, and artifact-name instructions. The plan now defines one supported Electron target, bounded retry timing, exact native-preparation hooks, a measured warning budget, one password variable, ignored audit evidence, and package-derived release names.
- [x] The plan rejects an unsigned public fallback and stops if Apple prerequisites are absent.
- [x] User approved the plan.
- [x] After the user correction, all remaining work uses core tools and internal repository agents only. No external skill, plugin, Claude, or Copilot action is permitted.

### Implementation review

- [ ] Each task has a red-green test record.
- [ ] Each commit message explains why the change was needed.
- [ ] Each changed line received human-readable review.
- [ ] Each edited logic unit received a proportionate complexity and readability review without a computed score.
- [ ] Documentation matches verified behavior.
- [ ] Final automated gates are green.
- [ ] Final macOS manual gates are green.
- [ ] External code and release reviews are clear.
- [ ] Release evidence and size measurements are recorded.
