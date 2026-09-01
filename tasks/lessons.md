# Session lessons

## 2026-08-27

- When review evidence shows a plan defect, correct the full execution risk. Do not limit the change to the smallest wording edit.
- Treat release plans as executable specifications. Name exact versions, scripts, variables, artifact patterns, failure modes, and verification commands when ambiguity can change the shipped result.
- Verify reviewer claims with the source tool before changing evidence. A reviewer miscounted a valid 40-character Git commit hash as 41 characters.
- Treat debloat as two related passes: remove shipped weight and remove cognitive weight from logic already changed. Preserve behavior, apply readability work in proportion to the branching, and judge the result by eye instead of a computed score.
- Do not load or use external skills or plugins for this project. Follow the project instructions and use core repository tools only.
- When the user explicitly requires computer use for Partner Center, treat that as the only plugin exception. Do not load a release-process skill or any other external skill for AudioBash work.
- Do not use Node evaluation flags with the Electron CLI. Read package metadata, or set `ELECTRON_RUN_AS_NODE=1` in a controlled child environment. Internal audits must not launch GUI apps unless the current manual test requires it.
- When a long review, build, or signing process is active, monitor its existing session to completion. Do not restart it or overlap another run only because output is quiet.
- Set a concrete review acceptance boundary before the correction cycle. After one implementation and one correction review, do not expand scope without a new concrete defect or failed release gate.
- One substantive review and one correction pass are enough for this release. If the user says there are too many reviews, stop the active review immediately and continue with the verified build gates.
- Apply executable-mode rules from the Mach-O header file type. A native `BUNDLE` still needs architecture and signature checks, but it must not gain execute permission only to satisfy a blanket verifier.
- Do not assume direct argument passing makes every path opaque to a tool. `otool` interprets parentheses as archive-member syntax, including parentheses in Electron helper paths. Read fixed-format headers directly when only header metadata is required.
- Verify the submission year before entering Store copyright metadata. Use 2026 for the AudioBash v3.4.0 Microsoft Store submission.
- Store text, privacy disclosures, and screenshots must match the models that the shipped UI lets users select. For v3.4.0, list Gemini, ElevenLabs, local Parakeet, and local Whisper; do not present the removed OpenAI or Anthropic choices as current.
