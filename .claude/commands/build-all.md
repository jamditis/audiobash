# Build All Platforms

Build AudioBash for all supported platforms and report comprehensive build status.

## Your Task

Execute builds for all platforms and provide a detailed report including build sizes, timing, and any errors encountered.

## Build Targets

AudioBash supports these build targets:
- **macOS ARM64** (`electron:build:mac:arm64`) - Apple Silicon
- **macOS x64** (`electron:build:mac:x64`) - Intel Mac
- **Windows** (`electron:build:win`) - Windows 10/11
- **Linux** (`electron:build:linux`) - AppImage + deb

## Execution Steps

1. **Clean previous builds**
   ```bash
   rm -rf dist/
   ```

2. **Run builds sequentially** (to avoid resource conflicts)
   ```bash
   npm run electron:build:mac:arm64
   npm run electron:build:mac:x64
   npm run electron:build:win
   npm run electron:build:linux
   ```

3. **Collect build artifacts**
   - List all files in `dist/` directory
   - Calculate file sizes in MB
   - Check for completeness (DMG, exe, AppImage, deb)

## Report Format

Provide a summary in this format:

```
## Build Report

### macOS ARM64
✓ Success | AudioBash-1.0.0-arm64.dmg | 125.3 MB | 2m 15s

### macOS x64
✓ Success | AudioBash-1.0.0-x64.dmg | 128.7 MB | 2m 32s

### Windows
✗ Failed | Error: NSIS not found
  - Install nsis: apt-get install nsis
  - Retry build

### Linux
✓ Success | AudioBash-1.0.0.AppImage | 142.1 MB | 1m 48s
✓ Success | AudioBash-1.0.0.deb | 95.6 MB | 1m 48s

### Summary
- 4 of 5 builds succeeded
- Total build time: 8m 23s
- Total artifact size: 491.7 MB
```

## Common Issues

### Missing dependencies
- **Windows**: Requires `nsis` for installer creation
- **macOS**: Requires Xcode CLI tools (`xcode-select --install`)
- **Linux**: Requires `fakeroot` and `dpkg` for deb packages

### node-pty compilation
If builds fail due to node-pty:
```bash
rm -rf node_modules package-lock.json
npm install
npm rebuild node-pty
```

### Disk space
Check available space before building:
```bash
df -h /home/user/audiobash
```

## Post-Build Verification

After successful builds:
1. Check that all expected files exist in `dist/`
2. Verify file sizes are reasonable (100-150 MB range)
3. Note any warnings from electron-builder
4. Test one build if possible (e.g., run AppImage on Linux)

## Now Execute

Run all platform builds and provide the comprehensive report described above.
