# Release process for AudioBash

When creating a new release, follow these steps in order:

## 1. Update version numbers

Update the version in all these locations:
- `package.json` - the `version` field
- `docs/index.html` - header version (e.g., `v1.0.3 // VOICE_TERMINAL`)
- `docs/index.html` - download button text (e.g., `DOWNLOAD v1.0.3`)
- `docs/index.html` - download URLs (e.g., `v1.0.3/AudioBash.Setup.1.0.3.exe`)
- `docs/index.html` - footer version

## 2. Update README.md

If the release includes new features, update the Features section in README.md to reflect them.

## 3. Build the installer

```bash
npm run electron:build
```

This creates `dist/AudioBash Setup X.X.X.exe`

## 4. Commit and push

```bash
git add package.json README.md docs/index.html [any changed source files]
git commit -m "vX.X.X: Brief description of changes"
git push origin master
```

## 5. Create and push the tag

```bash
git tag vX.X.X
git push origin vX.X.X
```

## 6. Create GitHub release

Create the release with:
- Direct download link at the TOP of the release notes
- Upload the installer as a release asset

Format:
```
## What's new

- **Feature 1** - Description
- **Feature 2** - Description

## Download

[AudioBash.Setup.X.X.X.exe](https://github.com/jamditis/audiobash/releases/download/vX.X.X/AudioBash.Setup.X.X.X.exe)
```

Command:
```bash
gh release create vX.X.X --title "vX.X.X" --notes "..." "dist/AudioBash Setup X.X.X.exe"
```

## Checklist

- [ ] Version bumped in package.json
- [ ] Version bumped in docs/index.html (all 4 locations)
- [ ] Download URLs updated in docs/index.html
- [ ] README.md updated with new features (if applicable)
- [ ] Installer built successfully
- [ ] Changes committed and pushed
- [ ] Git tag created and pushed
- [ ] GitHub release created with direct download link
- [ ] Installer uploaded to release
