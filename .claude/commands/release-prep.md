# Release Preparation

Prepare AudioBash for a new release by running all tests, building all platforms, updating version numbers, and generating changelog entries.

## Your Role

You are the release manager preparing AudioBash for a new version release. Execute all pre-release checks systematically.

## Release Checklist

### 1. Version Bump

**Determine release type:**
- **Major** (x.0.0) - Breaking changes, major new features
- **Minor** (1.x.0) - New features, no breaking changes
- **Patch** (1.0.x) - Bug fixes only

**Update version in all locations:**

```bash
# Update package.json version
npm version [major|minor|patch] --no-git-tag-version

# Verify version updated
grep '"version"' package.json
```

**Files that may need manual version updates:**
- `package.json` - npm version handles this
- `electron/main.cjs` - Check for hardcoded version strings
- `README.md` - Update version badges if present
- `docs/index.html` - Update download links with new version

### 2. Run Test Suite

Execute the full test suite and verify all tests pass:

```bash
# Run all tests
npm test

# Check for test failures
echo "Exit code: $?"
```

**Expected output:**
- All 70+ tests pass
- No errors or warnings
- 100% of test suites pass

**If tests fail:**
- Fix failing tests before proceeding
- Do NOT release with failing tests
- Re-run full suite after fixes

### 3. Build All Platforms

Build for all supported platforms:

```bash
# Clean previous builds
rm -rf dist/

# Build all platforms (sequential to avoid conflicts)
npm run electron:build:mac:arm64
npm run electron:build:mac:x64
npm run electron:build:win
npm run electron:build:linux
```

**Verify artifacts created:**
- ✓ `dist/AudioBash-{version}-arm64.dmg` (macOS ARM64)
- ✓ `dist/AudioBash-{version}-x64.dmg` (macOS x64)
- ✓ `dist/AudioBash Setup {version}.exe` (Windows)
- ✓ `dist/AudioBash-{version}.AppImage` (Linux)
- ✓ `dist/AudioBash-{version}.deb` (Linux)

**Record artifact sizes:**
```bash
ls -lh dist/*.dmg dist/*.exe dist/*.AppImage dist/*.deb
```

### 4. Generate Changelog

**Review commits since last release:**

```bash
# Get last release tag
LAST_TAG=$(git describe --tags --abbrev=0)

# List commits since last release
git log $LAST_TAG..HEAD --oneline --no-merges

# Detailed view with files changed
git log $LAST_TAG..HEAD --stat
```

**Categorize changes:**

- **Features** - New functionality
- **Fixes** - Bug fixes
- **Performance** - Performance improvements
- **Docs** - Documentation updates
- **Chore** - Maintenance tasks

**Changelog format:**

```markdown
## [1.1.0] - 2026-01-09

### Added
- New transcription provider: OpenAI Whisper
- Voice activity detection in recording UI
- Keyboard shortcut customization

### Fixed
- PTY process not cleaned up on window close (#42)
- Memory leak in terminal data handler (#38)
- WebSocket reconnection timeout (#35)

### Changed
- Improved agent mode prompt generation
- Updated Electron to v32.0.0

### Performance
- Reduced bundle size by 15MB
- Optimized terminal rendering for large outputs

### Docs
- Added macOS installation guide
- Updated API key setup instructions
```

**Create changelog entry:**

```bash
# Create or update CHANGELOG.md
echo "## [NEW_VERSION] - $(date +%Y-%m-%d)" >> CHANGELOG.md.new
echo "" >> CHANGELOG.md.new
echo "### Added" >> CHANGELOG.md.new
echo "- [Describe new features]" >> CHANGELOG.md.new
echo "" >> CHANGELOG.md.new
# ... continue with other sections
```

### 5. Update Documentation

**Files to review and update:**

- `/home/user/audiobash/README.md`
  - Update version badges
  - Update installation instructions
  - Add new features to feature list

- `/home/user/audiobash/docs/index.html`
  - Update download links with new version
  - Update version number in hero section
  - Update release date

- `/home/user/audiobash/docs/releases.html`
  - Add new release entry with changelog
  - Update "Latest Release" badge

- `/home/user/audiobash/CLAUDE.md`
  - Add dated entry for significant changes
  - Update quick start if needed

### 6. Security Check

Run a quick security audit:

```bash
# Check for exposed secrets
grep -rn "sk-\|AIza\|key.*:" src/ electron/ --include="*.ts" --include="*.tsx" --include="*.js"

# Run npm audit
npm audit

# Check for .env files in repo
git ls-files | grep -E "\.env$|\.env\."
```

**All checks must pass:**
- ✓ No hardcoded API keys
- ✓ No critical/high vulnerabilities
- ✓ No .env files committed

### 7. Create Release Branch

```bash
# Create release branch
git checkout -b release/v{version}

# Stage all changes
git add package.json package-lock.json CHANGELOG.md docs/ README.md

# Commit changes
git commit -m "chore: Prepare release v{version}

- Update version to {version}
- Generate changelog
- Update documentation
- Build all platform artifacts"

# Push release branch
git push -u origin release/v{version}
```

### 8. Pre-Release Checklist

**Manual verification:**
- [ ] All tests pass
- [ ] All platforms build successfully
- [ ] Version updated in all files
- [ ] Changelog complete and accurate
- [ ] Documentation updated
- [ ] No security issues
- [ ] No hardcoded secrets
- [ ] Artifacts tested on target platforms (if possible)

### 9. Create GitHub Release

**After PR is merged to main:**

```bash
# Checkout main and pull latest
git checkout main
git pull origin main

# Create and push tag
git tag -a v{version} -m "Release v{version}"
git push origin v{version}

# Create GitHub release with gh CLI
gh release create v{version} \
  --title "AudioBash v{version}" \
  --notes "$(cat CHANGELOG.md | sed -n '/## \[{version}\]/,/## \[/p' | sed '$d')" \
  dist/AudioBash-{version}-arm64.dmg \
  dist/AudioBash-{version}-x64.dmg \
  dist/AudioBash\ Setup\ {version}.exe \
  dist/AudioBash-{version}.AppImage \
  dist/AudioBash-{version}.deb
```

## Report Format

Provide a release readiness report:

```
## Release Preparation Report - v1.1.0

### ✓ Version Update
- package.json: 1.0.0 → 1.1.0
- All documentation updated

### ✓ Test Suite
- 72 tests passed
- 0 failures
- Test run: 12.4s

### ✓ Platform Builds
- macOS ARM64: AudioBash-1.1.0-arm64.dmg (125.3 MB)
- macOS x64: AudioBash-1.1.0-x64.dmg (128.7 MB)
- Windows: AudioBash Setup 1.1.0.exe (98.2 MB)
- Linux: AudioBash-1.1.0.AppImage (142.1 MB)
- Linux: AudioBash-1.1.0.deb (95.6 MB)

### ✓ Changelog
- 5 new features
- 8 bug fixes
- 2 performance improvements
- See CHANGELOG.md for details

### ✓ Security Check
- No exposed secrets
- 0 vulnerabilities
- All checks passed

### ✓ Documentation
- README.md updated
- docs/index.html updated
- docs/releases.html updated

### Release Status: READY ✓

Next steps:
1. Review changes in release/v1.1.0 branch
2. Create PR to main
3. After merge, create git tag and GitHub release
4. Upload artifacts to GitHub release
```

## Now Execute

Perform all release preparation steps and provide the comprehensive readiness report.
