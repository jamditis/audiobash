# Release process for AudioBash

When creating a new release, follow these steps in order:

## 1. Update version numbers

Update the version in these locations:
- `package.json` — the `version` field
- `docs/js/version.js` — the `AUDIOBASH_VERSION` constant (this is the single source of truth for all docs pages and download URLs)
- `docs/index.html` — hardcoded fallback text in `data-version` attributes (4 locations: header badge, nav badge, "NEW IN" heading, footer)
- `docs/manual.html` — any hardcoded version references

**Note:** `docs/releases.html`, `docs/macos.html`, and `docs/latest.html` use `data-version` templates that are populated dynamically by `version.js`. Historical release entries in those files should NOT be updated — they document past releases.

## 2. Update README.md

If the release includes new features, update the Features section in README.md to reflect them.

## 3. Build the release candidate

Do not use the local macOS package command for release files. It creates development packages with ad hoc signing and an explicit notarization skip. After the exact reviewed commit reaches the current `master` branch, dispatch the release-candidate workflow for that commit:

```bash
gh workflow run .github/workflows/build.yml \
  --ref master \
  -f release_commit=EXACT_REVIEWED_COMMIT
```

Wait for all five job runs to pass: macOS arm64, macOS x64, Windows, Linux, and aggregate verification. Download all workflow artifacts, then run `scripts/verify-release-artifact-set.cjs` with the exact commit, repository, run ID, and run attempt before creating a tag or draft release.

## 4. Run tests

```bash
npx vitest run
```

All tests must pass before proceeding. Do not skip this step.

## 5. Commit and push

```bash
git add package.json docs/js/version.js docs/index.html docs/manual.html [any changed source files]
git commit -m "vX.X.X: Brief description of changes"
git push origin [branch]
```

## 6. Create and push the tag

```bash
git tag vX.X.X
git push origin vX.X.X
```

## 7. Create GitHub release

**The release MUST follow this template.** This is non-negotiable.

### Release title format
```
vX.X.X — Short description
```

### Release notes template

```markdown
<div align="center">

![AudioBash vX.X.X](https://audiobash.app/screenshots/[best-screenshot]-web.png)

<br>

### ⬇️ Download

<table>
<tr>
<td align="center" width="250">

**🖥️ Windows**
**[AudioBash.Setup.X.X.X.exe](https://github.com/jamditis/audiobash/releases/download/vX.X.X/AudioBash.Setup.X.X.X.exe)**
`SIZE MB` · Windows 10/11 x64

</td>
<td align="center" width="250">

**🍎 macOS — Apple Silicon**
**[AudioBash-X.X.X-arm64.dmg](https://github.com/jamditis/audiobash/releases/download/vX.X.X/AudioBash-X.X.X-arm64.dmg)**
M1 / M2 / M3 / M4

</td>
<td align="center" width="250">

**💻 macOS — Intel**
**[AudioBash-X.X.X-x64.dmg](https://github.com/jamditis/audiobash/releases/download/vX.X.X/AudioBash-X.X.X-x64.dmg)**
x64 Macs

</td>
</tr>
</table>

<br>

</div>

---

## What changed

[1-2 sentence summary of the release theme]

### [Section heading for major change category]

[Bullet points describing changes — use **bold** for feature names]

### [Additional sections as needed]

### Test results

**N passed** · N skipped · 0 failures across N test files.

---

<details>
<summary>Installation notes</summary>

### Windows
1. Download and run the `.exe` installer
2. Windows SmartScreen may warn — click **More info → Run anyway**
3. Launch AudioBash from desktop or Start Menu

### macOS
1. Download the `.dmg` for your Mac type
2. Drag AudioBash to Applications
3. **Right-click → Open** on first launch (bypasses Gatekeeper)
4. Grant microphone permission when prompted

If Gatekeeper still blocks: `xattr -cr /Applications/AudioBash.app`

</details>

---

**Full changelog**: https://github.com/jamditis/audiobash/compare/vPREVIOUS...vX.X.X
```

### Key requirements
- **Hero screenshot** at the top — pick the most visually striking `-web.png` from `docs/screenshots/`
- **Three-column download table** with direct download links for all platforms
- **File size** shown for Windows installer (use backtick code formatting)
- **Platform badges** with emojis (🖥️ Windows, 🍎 Apple Silicon, 💻 Intel)
- **Collapsible installation notes** — same content every release, keeps the page clean
- **Test results** section with exact pass/skip/fail counts
- **Full changelog** link at the bottom comparing to previous version tag

### All platforms in every release

Every release must attach the exact seven files from the verified release-candidate workflow: two macOS DMGs, two macOS zip files, one Windows installer, one Linux AppImage, and one Linux Debian package. Task 14 must download the workflow artifacts, verify their manifest and hashes again, and attach those same bytes. Do not rebuild files from a tag or reuse files from an earlier release.

```bash
node scripts/verify-release-artifact-set.cjs artifacts RELEASE_COMMIT OWNER/REPOSITORY RUN_ID RUN_ATTEMPT
```

### Command
```bash
gh release create vX.X.X --draft \
  --title "vX.X.X — Short description" \
  --notes "$(cat <<'EOF'
[paste release notes here]
EOF
)" \
  "artifacts/macos-arm64/AudioBash-X.X.X-arm64.dmg" \
  "artifacts/macos-arm64/AudioBash-X.X.X-arm64.zip" \
  "artifacts/macos-x64/AudioBash-X.X.X-x64.dmg" \
  "artifacts/macos-x64/AudioBash-X.X.X-x64.zip" \
  "artifacts/windows-x64/AudioBash.Setup.X.X.X.exe" \
  "artifacts/linux-x64/AudioBash-X.X.X.AppImage" \
  "artifacts/linux-x64/AudioBash-X.X.X.deb"
```

Do not publish the draft until Task 14 downloads every attachment again and verifies its hash against the candidate manifest.

## Checklist

- [ ] Version bumped in `package.json`
- [ ] Version bumped in `docs/js/version.js`
- [ ] Version bumped in `docs/index.html` (4 hardcoded fallback locations)
- [ ] Version bumped in `docs/manual.html`
- [ ] README.md updated with new features (if applicable)
- [ ] Release-candidate workflow dispatched from `master` with `release_commit` set to the exact reviewed commit
- [ ] All five job runs passed for the exact reviewed commit
- [ ] `scripts/verify-release-artifact-set.cjs` passed on the downloaded workflow artifacts
- [ ] `AudioBash-X.X.X-arm64.dmg` verified and ready for the draft release
- [ ] `AudioBash-X.X.X-arm64.zip` verified and ready for the draft release
- [ ] `AudioBash-X.X.X-x64.dmg` verified and ready for the draft release
- [ ] `AudioBash-X.X.X-x64.zip` verified and ready for the draft release
- [ ] `AudioBash.Setup.X.X.X.exe` verified and ready for the draft release
- [ ] `AudioBash-X.X.X.AppImage` verified and ready for the draft release
- [ ] `AudioBash-X.X.X.deb` verified and ready for the draft release
- [ ] All tests passing
- [ ] Changes committed and pushed
- [ ] Git tag created and pushed
- [ ] GitHub release created with hero screenshot + download table template
- [ ] The exact seven verified files uploaded to the draft release
- [ ] Every draft attachment downloaded again and matched to the candidate manifest before publication
