# AudioBash macOS stability and v3.4.0 release plan

> For agentic workers: use `superjawn:subagent-driven-development` to execute this plan. Use `superjawn:test-driven-development` for each behavior change, `superjawn:systematic-debugging` for each failure, and `superjawn:verification-before-completion` before each commit and release gate.

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
- Version, release-note, download-link, signing, notarization, favicon, social metadata, and release asset checks.

This release does not include:

- GitHub issue #47, because it changes Windows shell selection.
- New transcription models, media formats, or user-facing features.
- A broad UI redesign.
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

- [ ] Add failing package-manifest tests that classify React, Xterm, and VAD libraries as renderer build inputs instead of main-process runtime dependencies.
- [ ] Add a failing build-config test that rejects the duplicate root sound resource set on macOS.
- [ ] Add a failing package-content test that rejects React, Xterm, VAD, ONNX, non-target node-pty prebuilds, Windows PDB files, and retired remote-control files from the mac package.
- [ ] Move `@ricky0123/vad-web`, `@xterm/addon-fit`, `@xterm/xterm`, `react`, and `react-dom` to `devDependencies`.
- [ ] Remove unused `@testing-library/user-event`.
- [ ] Keep both VAD model files during this task. Task 5 must pin the runtime model before it removes the V5 asset.
- [ ] Remove the retired remote-control files listed in the file map.
- [ ] Keep `public/favicon.svg`, `public/assets`, and generated `public/vad`.
- [ ] Keep `public/assets/start.mp3`, `public/assets/stop.mp3`, `public/assets/success.mp3`, and `public/assets/error.mp3` as the renderer sound source.
- [ ] Remove the byte-identical root `assets/*.mp3` files and the global `extraResources` sound copy.
- [ ] Keep root `audiobash-logo.png` as the macOS application and tray image. Remove the 12-byte placeholder `assets/icon.png`.
- [ ] Keep root `audiobash-logo.ico` for Windows and scope its resource copy to the Windows package.
- [ ] Add mac-specific negative package patterns for non-darwin node-pty prebuilds, Windows PDB files, tests, source maps, and build-only source.
- [ ] Keep the target architecture `pty.node`, `spawn-helper`, runtime JavaScript, and `package.json`.
- [ ] List `app.asar` and `app.asar.unpacked` and make the package-content tests pass.
- [ ] Measure installed production closure, `.app`, DMG, zip, `app.asar`, and `app.asar.unpacked` before and after this task.
- [ ] Run packaged startup, PTY, tray, four-sound, manual voice, and VAD smoke tests before accepting any deletion.
- [ ] Request Claude Code review and commit.

Expected commit message:

```text
perf: stop shipping renderer and foreign native build inputs twice
```

## Task 5: Defer VAD code until the user starts VAD mode

- [ ] Add a failing `tests/unit/useVAD.test.tsx` test that imports the hook without loading `@ricky0123/vad-web`.
- [ ] Add failing tests for first start, repeated start and stop, load failure, and unmount during module loading.
- [ ] Run the tests and confirm they fail because `useVAD.ts` imports `MicVAD` at module load.
- [ ] Change the runtime import to a cached dynamic import inside `start()`.
- [ ] Keep a type-only import for TypeScript.
- [ ] Set `model: 'legacy'` explicitly so the copied asset and selected runtime model cannot drift.
- [ ] Add a failing asset test that expects only the explicitly selected legacy model.
- [ ] Remove `silero_vad_v5.onnx` from `scripts/copy-vad-assets.cjs` only after the explicit model test passes.
- [ ] Keep cancellation safe when the component unmounts before the import finishes.
- [ ] Build and record the initial chunk and deferred VAD chunk sizes.
- [ ] Run manual recording, first VAD start, repeated start and stop, and permission-denial tests.
- [ ] Request Claude Code review and commit.

Expected commit message:

```text
perf: avoid loading voice activity detection during app startup
```

## Task 6: Remove the undeclared ElevenLabs multipart dependency and add request deadlines

**Root cause:** `electron/main.cjs` calls `require('form-data')`, but that package exists only through development dependencies. The packaged ElevenLabs batch path can fail at runtime.

- [ ] Add a failing unit test that builds an ElevenLabs request after `npm prune --omit=dev` in an isolated package fixture.
- [ ] Add failing tests for audio filename, media type, model field, API key header, non-2xx error text, timeout, and caller cancellation.
- [ ] Run `npx vitest run tests/unit/elevenLabsRequest.test.ts` and confirm the missing module or API failure.
- [ ] Implement `electron/elevenLabsRequest.cjs` with built-in `FormData`, `Blob`, `fetch`, and `AbortController`.
- [ ] Do not set multipart boundary headers manually. Let `fetch` set them.
- [ ] Give each cloud request a 30-second per-attempt deadline, at most three attempts, fixed one-second and two-second retry delays, and a 100-second total deadline that can stop the final attempt early. Retry only transient network failures, HTTP 408, HTTP 429, and HTTP 5xx responses. Clear every timer in `finally`.
- [ ] Apply the same deadline helper to Gemini, OpenAI, Anthropic, ElevenLabs batch, and ElevenLabs real-time setup where the SDK supports cancellation.
- [ ] Replace the warning-only timeout stress test with assertions.
- [ ] Keep retry count and deadline count separate. A stalled request must return one actionable user error within 100 seconds.
- [ ] Assert that the built-in `FormData` request does not set an explicit multipart `Content-Type` header.
- [ ] Run unit, stress, main-process syntax, and packaged ElevenLabs smoke tests.
- [ ] Request Claude Code review and commit.

Expected commit message:

```text
fix: keep cloud transcription bounded and self-contained in production
```

## Task 7: Update vulnerable build and runtime dependencies in controlled groups

- [ ] Add `engines.node` as `>=22.12.0`, add `.nvmrc`, pin `packageManager` to the npm version selected for CI, and add a CI command that fails when the active Node version is outside the supported range.
- [ ] Update CI and build workflows to the same Node 22 line before packages that require Node 22.
- [ ] Update the low-risk patched group first: `electron-builder` 26.15.3, Vite 6.4.3, Vitest 4.1.11, coverage 4.1.11, concurrently 9.2.4, PostCSS 8.5.26, and protobufjs 7.6.6.
- [ ] Run install, audit, tests, lint, type checks, build, and arm64 directory package after this group.
- [ ] Treat the supported Electron major as the reason for the v3.4.0 minor release. Update it only after the signed Electron 39 baseline control packages and pruned Electron 39 packages both pass. Electron 39 is a compatibility baseline only and cannot ship in v3.4.0.
- [ ] On the Task 7 execution day, verify the current stable Electron release and its support status from official Electron sources and `npm view electron version`. Record one exact `RELEASE_ELECTRON_VERSION` in this evidence file before changing dependencies. Electron 44.0.0 was the audit candidate, not a fixed release target.
- [ ] Update Electron to the recorded `RELEASE_ELECTRON_VERSION` in a separate commit. Use that same version for every later package, test, workflow, document, and stop condition.
- [ ] If the selected supported Electron release fails a proven compatibility test, stop and diagnose. Do not silently downgrade or publish on unsupported Electron 39. Select another supported line only after documenting the exact incompatibility and getting user approval.
- [ ] Test window startup, tray, global shortcuts, microphone permission, node-pty, preload APIs, preview capture, VAD WASM, all transcription providers, and app quit.
- [ ] Require `npm audit --omit=dev` to report zero findings for unbundled main-process runtime dependencies.
- [ ] Generate an inventory of renderer packages bundled by Vite. Moving a package to `devDependencies` is a package-size change, not a vulnerability fix.
- [ ] Use full `npm audit` to cover renderer build inputs and release tooling. Require zero critical and zero high findings, and add a reachability note for each remaining moderate or low finding.
- [ ] Record any moderate or low residual finding with reachability evidence and user approval before release.
- [ ] Update Browserslist data and confirm the stale-data warning is gone.
- [ ] Request Claude Code review after each dependency group.

Expected commit messages:

```text
build: remove known flaws from the release toolchain
build: move AudioBash to a supported Electron security line
```

## Task 8: Make lint and React state gates truthful

- [ ] Add a Terminal behavior test that changes `fontSize` and `theme` after mount and checks the live terminal options.
- [ ] Add a VoiceOverlay behavior test that switches the active tab and checks that the next transcription routes to the new tab.
- [ ] Run the tests before changing hook dependencies. If either test already passes, document the warning as non-behavioral and use the smallest valid lint correction.
- [ ] Fix the two hook dependency warnings without recreating terminals, reconnecting listeners, or sending text to a stale tab.
- [ ] Remove unused variables and explicit `any` values only in files already changed by this release. Do not widen the release with unrelated type refactors.
- [ ] Keep terminal control-character regex exceptions.
- [ ] Record the exact warning count after Task 7 and after the two behavioral warnings and touched-file warnings are fixed. The final count must be 64 or lower. Set ESLint `--max-warnings` to that measured final count, prove it passes the current commit, and prove a test fixture with one added warning fails. If the final count is 65 or higher, stop and diagnose instead of weakening the budget or closing this task.
- [ ] Create a follow-up issue for the remaining untouched warnings. Zero warnings remains the codebase goal, but unrelated warning cleanup does not block this stability release.
- [ ] Add a reproducible local Ruff setup command and run both `ruff check` and `ruff format --check`.
- [ ] Run affected tests after each file and the full suite after the batch.
- [ ] Request Claude Code review and commit.

Expected commit message:

```text
refactor: make static analysis reject new release warnings
```

## Task 9: Keep preview watching alive across atomic saves

**Root cause:** `fs.watch` attaches to one file identity, ignores `rename`, and treats a 300 ms delay as proof that the replacement file is stable.

- [ ] Add a failing test for an in-place write.
- [ ] Add a failing test that writes a temporary file and renames it over the watched file three times.
- [ ] Add failing tests for unrelated directory changes, delete and recreate, bounded recovery, one refresh per completed save, and cleanup.
- [ ] Before any watcher implementation, run `npx vitest run tests/unit/fileWatcher.test.ts` and confirm the atomic replacement test fails for the recorded root cause.
- [ ] Implement a parent-directory watcher in `electron/fileWatcher.cjs`.
- [ ] Treat events as signals. Reconcile the exact target path with `stat`, require stable size and modification data across two checks 100 ms apart, and reattach after inode replacement.
- [ ] Use one 300 ms debounce timer and at most 20 stability checks over two seconds per target. Return one clear error after the bound. Do not add an unbounded poll.
- [ ] Close the watcher and all timers on explicit unwatch and app shutdown.
- [ ] Replace the inline watcher code in `electron/main.cjs` with the module.
- [ ] Run unit tests and a manual preview edit loop with an editor that uses atomic saves.
- [ ] Request Claude Code review and commit.

Expected commit message:

```text
fix: keep preview refresh attached after atomic file saves
```

## Task 10: Own local transcription processes through completion

**Root cause:** FFmpeg and Whisper processes have no single lifecycle owner. Timeout, cancellation, and shutdown can finish while descendants or output streams still run.

- [ ] Add a failing macOS integration test that starts a parent with a child, stops the parent, and proves the child remains without tree cleanup.
- [ ] Add unit tests with injected process APIs for Windows `taskkill /T /F` and POSIX process-group termination.
- [ ] Add an integration assertion that each POSIX transcription process is spawned with `detached: true` and has a process-group identifier different from the Electron process group. Never call `process.kill(-pid)` without this proof.
- [ ] Add failing tests for timeout, explicit cancellation, app shutdown, output drain, double cancellation, and a process that ignores the first termination signal.
- [ ] Run the targeted tests and confirm the descendant test fails.
- [ ] Change FFmpeg and Whisper POSIX spawn options to create separate process groups. Keep Windows spawn behavior compatible with `taskkill /T /F`.
- [ ] Implement `electron/processTree.cjs` with a three-second graceful stop and a two-second force-stop stage.
- [ ] Implement `electron/transcriptionJob.cjs` as the owner of FFmpeg, Whisper, output streams, timers, abort state, and final status.
- [ ] Do not publish `complete`, `failed`, or `cancelled` until all owned processes exit and streams close.
- [ ] Refactor `electron/whisperService.cjs` to use the job owner.
- [ ] Make app shutdown wait for job cleanup with a bounded deadline before the final quit.
- [ ] Run macOS integration tests and Windows process-tree tests in GitHub Actions.
- [ ] Verify no child FFmpeg or Whisper process remains after timeout, cancel, or quit.
- [ ] Request Claude Code review and commit.

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
- [ ] Request Claude Code security and release review and commit.

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
- [ ] Request Claude Code writing and release review and commit.

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
- [ ] Run a Claude Code review on the full diff and a separate review on the release workflow.
- [ ] Fix all critical and important review findings with test-first commits.
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
- A critical or important external review finding remains.

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

### Implementation review

- [ ] Each task has a red-green test record.
- [ ] Each commit message explains why the change was needed.
- [ ] Each changed line received human-readable review.
- [ ] Documentation matches verified behavior.
- [ ] Final automated gates are green.
- [ ] Final macOS manual gates are green.
- [ ] External code and release reviews are clear.
- [ ] Release evidence and size measurements are recorded.
