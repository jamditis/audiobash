# macOS Manual Testing Checklist

This checklist covers macOS-specific functionality that requires manual verification.

## Pre-Release Checklist

### 1. DMG Installation Flow

- [ ] **Mount DMG**: Double-click the DMG file
  - Expected: DMG mounts and shows AudioBash.app with Applications folder link
  - Check: Window appears with drag-to-install layout

- [ ] **Drag to Applications**: Drag AudioBash.app to Applications folder
  - Expected: App copies without errors
  - Check: App appears in /Applications/AudioBash.app

- [ ] **Eject DMG**: Eject the mounted DMG
  - Expected: Clean unmount
  - Check: No "in use" errors

### 2. Gatekeeper Bypass (Unsigned App)

- [ ] **First Launch Attempt**: Double-click AudioBash in Applications
  - Expected: macOS blocks with "cannot be opened" dialog
  - This is NORMAL for unsigned apps

- [ ] **Right-click → Open**: Right-click AudioBash.app → Open
  - Expected: Dialog appears with "Open" button option
  - Check: Clicking "Open" launches the app

- [ ] **Subsequent Launches**: Double-click after first successful launch
  - Expected: App launches without Gatekeeper prompt
  - Check: No security dialogs appear

- [ ] **Alternative: xattr method** (if right-click fails):
  ```bash
  xattr -cr /Applications/AudioBash.app
  ```
  - Expected: Removes quarantine attribute
  - Check: App launches normally after this

### 3. System Permissions

#### Microphone Access
- [ ] **First Voice Recording**: Press Option+S to start recording
  - Expected: macOS prompts for microphone permission
  - Check: Permission dialog appears

- [ ] **Grant Permission**: Click "OK" to allow microphone access
  - Expected: Recording starts (waveform animation visible)
  - Check: App appears in System Preferences → Privacy → Microphone

- [ ] **Deny Permission**: Test behavior when denied
  - Expected: App shows error message, doesn't crash
  - Check: Graceful degradation

#### Accessibility (for global shortcuts)
- [ ] **Global Shortcuts**: Test Option+S when app is in background
  - Expected: May require Accessibility permission on some macOS versions
  - Check: Shortcuts work from any app

### 4. Terminal Functionality

- [ ] **Shell Detection**: App should use user's default shell
  - Expected: Uses $SHELL (typically /bin/zsh on modern macOS)
  - Check: `echo $SHELL` in terminal shows correct shell

- [ ] **Working Directory**: New terminals start in home directory
  - Expected: `pwd` shows /Users/username
  - Check: Correct initial directory

- [ ] **Environment Variables**: User's shell config is loaded
  - Expected: Custom PATH, aliases work
  - Check: Run a custom alias or check PATH

### 5. Multi-Tab Stability

- [ ] **Create Multiple Tabs**: Create 4+ terminal tabs
  - Expected: All tabs function independently
  - Check: Each tab has its own shell process

- [ ] **Switch Between Tabs**: Rapidly switch tabs
  - Expected: No lag, no crashes
  - Check: Output preserved in each tab

- [ ] **Close Tabs**: Close tabs one by one
  - Expected: Clean shell termination
  - Check: No orphan processes (check Activity Monitor)

- [ ] **Split View**: Test all layout modes
  - Expected: Resizing works, no rendering glitches
  - Check: Focus follows correctly

### 6. Voice Recording

- [ ] **Start Recording**: Option+S
  - Expected: Overlay appears, start sound plays
  - Check: Waveform animation shows audio level

- [ ] **Stop Recording**: Option+S again or click stop
  - Expected: Stop sound plays, transcription begins
  - Check: Loading indicator shows

- [ ] **Transcription**: Speak a command like "list files"
  - Expected: Text appears, command executes
  - Check: Correct command generated

- [ ] **Cancel Recording**: Option+A during recording
  - Expected: Recording cancelled, no transcription
  - Check: Error sound plays (optional)

### 7. Tray Icon

- [ ] **Tray Appears**: Check menu bar after launch
  - Expected: AudioBash icon visible in menu bar
  - Check: Icon is not blank/broken

- [ ] **Tray Click**: Click tray icon
  - Expected: Window shows/focuses
  - Check: Works when window is hidden

- [ ] **Tray Menu**: Right-click tray icon
  - Expected: Context menu with Show/Quit options
  - Check: Menu items work correctly

### 8. Window Behavior

- [ ] **Close to Tray**: Click window close button (X)
  - Expected: Window hides, app stays in tray
  - Check: App NOT in Dock when hidden

- [ ] **Quit App**: Right-click tray → Quit
  - Expected: App fully quits
  - Check: No processes remain (Activity Monitor)

- [ ] **Minimize**: Click minimize button
  - Expected: Window minimizes to Dock
  - Check: Can restore from Dock

### 9. Resource Usage

- [ ] **Memory**: Check Activity Monitor after 10 minutes of use
  - Expected: < 500MB RAM for main process
  - Check: No memory growth over time

- [ ] **CPU Idle**: Check CPU when not actively using
  - Expected: < 1% CPU at idle
  - Check: No spinning/high CPU

- [ ] **File Descriptors**: After creating/closing many tabs
  - Expected: FDs cleaned up properly
  - Check: `lsof -p $(pgrep -f AudioBash) | wc -l` stays reasonable

## Post-Release Verification

After uploading to GitHub:

- [ ] **Download DMG**: Download from GitHub release page
- [ ] **Verify Checksum**: Compare file size/hash
- [ ] **Fresh Install Test**: Test on clean user account if possible
- [ ] **Update Check**: If auto-update exists, verify it works

## Known Issues / Workarounds

| Issue | Workaround |
|-------|------------|
| Gatekeeper blocks app | Right-click → Open, or `xattr -cr` |
| Microphone not working | Check System Preferences → Privacy |
| Global shortcuts don't work | May need Accessibility permission |
| App won't quit | Force quit from Activity Monitor |

## Test Environment Info

Record for each test run:
- macOS version: _______________
- Chip: [ ] Apple Silicon [ ] Intel
- AudioBash version: _______________
- Date: _______________
- Tester: _______________
