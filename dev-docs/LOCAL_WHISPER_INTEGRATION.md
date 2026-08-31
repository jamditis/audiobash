# Local Whisper integration for AudioBash

AudioBash can transcribe recorded audio without a cloud transcription service. The renderer sends one owned request to the Electron main process. The main process converts the audio with FFmpeg and runs a downloaded `whisper.cpp` binary.

## Supported model

The current application supports `small.en` only. The model is about 466 MB. AudioBash downloads the model and the `whisper.cpp` binary into the Electron user-data directory. They are not bundled in the application package. FFmpeg is a separate prerequisite and must be available on PATH.

## Components

- `src/services/transcriptionService.ts` creates the request ID, sends the audio, and forwards renderer cancellation.
- `electron/preload.cjs` exposes the typed `whisper-transcribe` and `whisper-cancel` IPC methods.
- `electron/localWhisperHandlers.cjs` validates the audio size, creates a unique temporary directory, and removes it after the owned job settles.
- `electron/main.cjs` registers the handlers and coordinates application shutdown.
- `electron/whisperService.cjs` validates the model and request ID, owns the active-job registry, and handles cancellation and shutdown.
- `electron/transcriptionJob.cjs` owns the FFmpeg and Whisper stages, the total deadline, output drains, stop state, and terminal status.
- `electron/processTree.cjs` owns platform-specific process-tree start and stop operations.
- `electron/processTreeLauncher.cjs` waits behind a start gate and coordinates platform ownership proof before it starts one target.
- `electron/windowsJobOwner.ps1` creates and holds the native Windows Job Object.
- `electron/appShutdown.cjs` prevents the first quit, waits for local jobs, and re-enters quit after cleanup or the shutdown deadline.

## Request flow

1. The renderer records a WebM audio blob.
2. The renderer creates a unique request ID and converts the blob to base64.
3. The renderer invokes `whisper-transcribe` with `{ requestId, modelName, audioBase64 }`.
4. The main process rejects empty audio and decoded audio larger than 25 MB.
5. The main process creates a unique temporary directory and writes `input.webm`.
6. The service creates one job with an immutable model selection.
7. The job runs FFmpeg to create a 16 kHz, mono, 16-bit PCM WAV file.
8. The job runs `whisper.cpp` with timestamps and diagnostic printing disabled.
9. The job waits for process exit and both output streams to close.
10. The service returns the transcript. The main process then removes the temporary directory.

## Process ownership

On macOS and Linux, the process-tree helper starts a detached launcher behind a closed gate. It reads the launcher and Electron process-group identifiers. It accepts ownership only when the launcher group equals the launcher PID and differs from the Electron group. The gate starts FFmpeg or Whisper only after this proof. The helper never sends a negative-PID signal without the proof.

On Windows, the Node launcher starts a Windows PowerShell 5.1 helper through a random named pipe and an independent random nonce. The helper creates an unnamed Job Object with kill-on-close, creates the target suspended, limits inherited handles to stdin, stdout, and stderr, and assigns the target to the Job. The helper reports `owner-ready` only after assignment. The launcher forwards that proof to the controller before it acknowledges the helper and lets the target resume. Child processes inherit Job membership.

The PowerShell process holds a stable handle to the Node launcher and keeps the Job open after the target exits. Cleanup force-terminates the exact Node `ChildProcess` handle once. Node uses that handle instead of resolving a PID. Launcher exit makes the helper terminate and close the Job. The target and its descendants then stop through the Job boundary. The controller never signals a saved PowerShell PID.

Cleanup uses these bounds:

- POSIX graceful stop: 3 seconds.
- POSIX forced stop: 2 seconds.
- Windows forceful launcher termination and Job closure: 5 seconds total.
- Total transcription deadline: 60 seconds.
- Application shutdown deadline: 6.5 seconds.

The job does not publish `complete`, `failed`, or `cancelled` until its owned process and output streams are closed. A process-tree cleanup failure publishes the distinct terminal state `cleanup-failed`, rejects the job, and does not claim that cleanup succeeded. The application shutdown coordinator can continue final quit after its separate deadline.

## Cancellation

The renderer attaches its abort signal before it starts the IPC request. An abort invokes `whisper-cancel` with the same request ID. The service supports active cancellation and a bounded early-cancellation queue for a cancel message that arrives before the matching start message.

Repeated cancellation calls reuse the same stop operation. Cancellation during FFmpeg prevents Whisper from starting. Cancellation during Whisper stops the Whisper tree. A late transcript is not returned to the user.

## Output limits

The job drains stdout and stderr while each process runs. It stores at most 4 MB of Whisper stdout and 64 KB of stderr. If output exceeds a limit, the job starts process-tree cleanup at once, continues to drain the pipe, and fails after the process and streams close.

## Application shutdown

The first `before-quit` event is prevented. AudioBash asks every active local transcription job to shut down and waits for their cleanup. Preview watchers, shortcuts, and PTYs then close through one idempotent cleanup function. The coordinator calls `app.quit()` again behind a re-entry guard.

If local cleanup does not finish within 6.5 seconds, AudioBash records the cleanup error, closes the other owned resources, and continues quit. Logs include the error code, not audio or transcript content.

## Setup boundary

Whisper binary installation and model download are setup operations. They use `@remotion/install-whisper-cpp` and are not transcription jobs. This setup does not install FFmpeg. Task 10 does not cancel an installation or model download during application shutdown.

Parakeet is also outside this process-tree owner. AudioBash sends an HTTP request to a separately managed server on `localhost:8003`; AudioBash does not start or own that server process.

## Verification

Use these focused commands:

```sh
npx vitest run tests/unit/processTree.test.ts tests/unit/windowsJobOwnerSource.test.ts tests/unit/transcriptionJob.test.ts tests/unit/appShutdown.test.ts tests/unit/whisperService.test.ts tests/unit/localWhisperHandlers.test.ts tests/unit/transcriptionService.test.ts tests/startup-crash.test.ts tests/integration/processTree.macos.test.ts
```

The exact nine-file local lifecycle command passes 185 tests on macOS. The macOS integration test first proves that direct parent-only termination leaves a descendant. It then uses the production owner, verifies the isolated process group with `ps`, stops the group, and proves that both PIDs are gone. It also closes the launcher status channel and proves that the parent lease reaps the full owned group. Portable tests cover the strict Windows readiness and result protocol, authenticated errors before and after owner readiness, forceful exact-handle cleanup, cancellation during pending ownership startup, final stopped-state checks after helper deadline use, batched parent-lease heartbeats, PATH-only executable lookup, bounded owner startup diagnostics, removed local-model migration, rotating temporary-directory cleanup, and startup removal of orphaned audio directories. Pull-request CI runs the same eight shared files plus the native integration file for each host. Native Windows tests cover suspended assignment, difficult argument round trips, clean and nonzero target exits with detached descendants, and launcher status loss. Native Windows CI must pass before release acceptance.
