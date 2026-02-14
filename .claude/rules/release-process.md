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

## 3. Build the installer

```bash
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS (both architectures)
```

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
**[AudioBash-X.X.X.dmg](https://github.com/jamditis/audiobash/releases/download/vX.X.X/AudioBash-X.X.X.dmg)**
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

### Command
```bash
gh release create vX.X.X \
  --title "vX.X.X — Short description" \
  --notes "$(cat <<'EOF'
[paste release notes here]
EOF
)" "dist/AudioBash Setup X.X.X.exe"
```

To add Mac builds later:
```bash
gh release upload vX.X.X "dist/AudioBash-X.X.X-arm64.dmg" "dist/AudioBash-X.X.X.dmg"
```

## Checklist

- [ ] Version bumped in `package.json`
- [ ] Version bumped in `docs/js/version.js`
- [ ] Version bumped in `docs/index.html` (4 hardcoded fallback locations)
- [ ] Version bumped in `docs/manual.html`
- [ ] README.md updated with new features (if applicable)
- [ ] Installer built successfully for target platform(s)
- [ ] All tests passing
- [ ] Changes committed and pushed
- [ ] Git tag created and pushed
- [ ] GitHub release created with hero screenshot + download table template
- [ ] Installer(s) uploaded to release
