# AudioBash Release Process Skill

This documents the complete process for releasing a new version of AudioBash for both Windows and macOS.

## Prerequisites

- GitHub CLI (`gh`) authenticated
- Node.js and npm installed
- On macOS for local DMG builds

## Release Checklist

### 1. Update Version Numbers

Update version in these locations:

```
package.json                    → "version": "X.X.X"
docs/index.html                 → 4 locations:
  - Nav header (v2.0.X // VOICE_TERMINAL)
  - Badge (vX.X.X — NOW ON macOS)
  - Footer (AUDIOBASH vX.X.X // BUILD...)
  - All download URLs (6 total for Windows + macOS)
```

**Quick sed for docs/index.html URLs:**
```bash
# Update all download URLs at once
sed -i '' 's/v2.0.0/v2.0.1/g; s/2.0.0/2.0.1/g' docs/index.html
```

### 2. Build macOS Installers Locally

```bash
npm run electron:build:mac:arm64
# Creates both ARM64 and x64 builds:
# - dist/AudioBash-X.X.X-arm64.dmg
# - dist/AudioBash-X.X.X.dmg (Intel)
```

### 3. Commit and Push

```bash
git add package.json docs/index.html [changed source files]
git commit -m "vX.X.X: Brief description"
git push origin master
```

### 4. Create and Push Tag

```bash
git tag vX.X.X
git push origin vX.X.X
```

### 5. Create GitHub Release with macOS Builds

```bash
gh release create vX.X.X \
  --title "vX.X.X" \
  --notes "Release notes here..." \
  "dist/AudioBash-X.X.X-arm64.dmg" \
  "dist/AudioBash-X.X.X.dmg"
```

### 6. Trigger Windows Build via GitHub Actions

```bash
gh workflow run build.yml --ref master \
  -f build_mac=false \
  -f build_windows=true \
  -f build_linux=false
```

### 7. Download and Upload Windows Installer

```bash
# Wait for build to complete
gh run list --limit 1

# Download artifact
gh run download [RUN_ID] -n windows-builds -D /tmp/windows-builds

# Upload to release
gh release upload vX.X.X "/tmp/windows-builds/AudioBash Setup X.X.X.exe"
```

### 8. Update Release Notes

```bash
gh release edit vX.X.X --notes "Updated notes with all download links..."
```

## File Naming Convention

| Platform | Filename Pattern |
|----------|------------------|
| Windows | `AudioBash Setup X.X.X.exe` |
| macOS ARM64 | `AudioBash-X.X.X-arm64.dmg` |
| macOS Intel | `AudioBash-X.X.X.dmg` |

## GitHub Actions Workflow

The workflow (`.github/workflows/build.yml`) automatically:
- Builds on tag push (`v*`)
- Can be manually triggered via `workflow_dispatch`
- Uses `--publish never` to prevent electron-builder auto-publish conflicts

## Troubleshooting

### electron-builder auto-publish error
```
GitHub Personal Access Token is not set
```
**Fix:** Ensure `--publish never` is in all build commands in the workflow.

### Cross-platform builds
- Windows builds require Windows runner (use GitHub Actions)
- macOS can build both ARM64 and x64 locally
- Linux builds are opt-in only in the workflow
