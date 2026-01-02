# AudioBash Troubleshooting Guide

This guide helps you diagnose and resolve common issues with AudioBash. Follow the steps in order for the best results.

---

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

### 1. Check Application Status
- Is AudioBash running? Check your system tray/menu bar
- Can you see the main window? Try `Alt+H` to show/hide
- Is the terminal responsive? Try typing a simple command like `echo hello`

### 2. Check System Resources
- **Memory**: AudioBash needs ~200MB RAM minimum
- **CPU**: High CPU might indicate a runaway process
- **Disk**: Ensure you have at least 100MB free space

### 3. View Logs
AudioBash logs are stored in:
- **Windows**: `%USERPROFILE%\.audiobash\logs\`
- **macOS/Linux**: `~/.audiobash/logs/`

Look for recent `audiobash.log` and any `crash-*.json` files.

---

## Common Issues

### Terminal Issues

#### Terminal is Blank or Unresponsive

**Symptoms:**
- Terminal shows nothing
- Commands don't execute
- Cursor doesn't appear

**Solutions:**

1. **Wait a moment** - The terminal may take a few seconds to initialize
2. **Resize the window** - This forces a terminal refresh
3. **Try a new tab** - Click the + button to create a new terminal tab
4. **Restart AudioBash** - Close and reopen the application

**If still not working:**
```bash
# Check if the shell exists (in another terminal)
echo $SHELL       # macOS/Linux
echo $env:SHELL   # Windows PowerShell
```

#### Terminal Shows Garbled Characters

**Symptoms:**
- Strange symbols instead of text
- ANSI codes visible like `[32m`

**Solutions:**

1. **Check your shell** - Ensure you're using a compatible shell (bash, zsh, PowerShell)
2. **Reset terminal** - Press `Ctrl+L` or type `clear`/`cls`
3. **Check font** - AudioBash requires a monospace font with Unicode support

#### Commands Not Executing

**Symptoms:**
- You type but nothing happens
- Enter key doesn't work

**Solutions:**

1. **Check focus** - Click inside the terminal area
2. **Check for stuck process** - Press `Ctrl+C` to interrupt
3. **Check shell** - Type `echo $0` to verify shell is running

---

### Voice Input Issues

#### Microphone Not Working

**Symptoms:**
- Voice button doesn't respond
- "Microphone access denied" error
- No transcription after speaking

**Solutions:**

1. **Check permissions:**
   - **macOS**: System Preferences → Security & Privacy → Privacy → Microphone
   - **Windows**: Settings → Privacy → Microphone
   - Ensure AudioBash is listed and enabled

2. **Check microphone:**
   - Test in another application
   - Check system volume mixer
   - Try a different microphone

3. **Restart after permission change** - Close and reopen AudioBash

#### Transcription Fails

**Symptoms:**
- "Transcription failed" error
- Empty transcription result
- Long delay then nothing

**Solutions:**

1. **Check API key:**
   - Go to Settings → Voice tab
   - Verify your API key is entered correctly
   - Test the key in another application or the provider's web console

2. **Check internet connection:**
   - Transcription requires internet access
   - Try visiting the provider's website

3. **Check audio quality:**
   - Speak clearly and at normal volume
   - Reduce background noise
   - Move closer to the microphone

4. **Try a different model:**
   - Some models work better for different accents/languages
   - Try switching between providers (Gemini, OpenAI, etc.)

#### "No Speech Detected" Error

**Solutions:**
- Speak louder or closer to the microphone
- Record for at least 1-2 seconds
- Check that your microphone is the default recording device

---

### Remote Control Issues

#### Cannot Connect from Mobile

**Symptoms:**
- "Connection failed" on mobile app
- Timeout when connecting
- "Invalid pairing code" error

**Solutions:**

1. **Verify IP address:**
   - Check the IP shown in AudioBash Settings → Remote Control
   - Ensure your phone is on the same WiFi network
   - Try both the IP address and any tunnel URL if enabled

2. **Check pairing code:**
   - Codes are case-insensitive but must be exact
   - Regenerate the code if in doubt
   - If using static password, ensure it's entered correctly

3. **Check firewall:**
   - AudioBash uses ports 8765 (ws://) and 8766 (wss://)
   - Add an exception for AudioBash in your firewall

4. **Check if already connected:**
   - Only one device can connect at a time
   - Disconnect any existing connections first

#### Connection Drops Frequently

**Solutions:**

1. **Check WiFi stability** - Move closer to your router
2. **Disable power saving** - Keep your desktop awake during use
3. **Use static password** - Prevents needing new codes after each reconnect
4. **Check for IP changes** - Your desktop IP might change; verify it periodically

#### Cannot Connect Outside Local Network

**Solutions:**

1. **Enable tunnelto:**
   - Go to Settings → Remote Control → Public Access
   - Enable the tunnel toggle
   - Use the provided tunnel URL instead of IP

2. **Install tunnelto:**
   - If not installed, run: `cargo install tunnelto`
   - Or download from: https://github.com/agrinman/tunnelto

---

### Performance Issues

#### High Memory Usage

**Symptoms:**
- AudioBash using more than 500MB RAM
- System becoming slow
- Warnings about memory

**Solutions:**

1. **Close unused tabs** - Each terminal uses memory
2. **Clear scrollback** - Long terminal history uses memory
3. **Restart AudioBash** - Frees accumulated memory
4. **Check for runaway processes** - A command might be producing excessive output

#### High CPU Usage

**Symptoms:**
- Fan running loudly
- System laggy
- AudioBash using high CPU percentage

**Solutions:**

1. **Check terminal output** - A command producing rapid output can cause this
2. **Stop runaway commands** - Press `Ctrl+C` in the affected terminal
3. **Reduce tabs** - Having many active terminals increases CPU usage
4. **Disable animations** - Some visual effects can impact performance

#### Slow Startup

**Solutions:**

1. **Check startup items** - Other applications might compete for resources
2. **Clear old logs** - Delete files in `~/.audiobash/logs/` older than 7 days
3. **Verify disk space** - Ensure adequate free space
4. **Check antivirus** - Add AudioBash to exclusions if scanning slows startup

---

### Installation Issues

#### "node-pty failed to compile" (macOS)

**Solutions:**
```bash
# Install Xcode command line tools
xcode-select --install

# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### App Won't Open (macOS)

**Solutions:**

1. **First launch:**
   - Right-click the app → Open → Click "Open" in the dialog

2. **If blocked:**
   ```bash
   xattr -cr /Applications/AudioBash.app
   ```

3. **Check System Preferences:**
   - Security & Privacy → Allow apps downloaded from: App Store and identified developers

#### Missing Dependencies (Linux)

**Solutions:**
```bash
# Debian/Ubuntu
sudo apt update
sudo apt install build-essential python3 libx11-dev

# Fedora
sudo dnf install gcc-c++ python3 libX11-devel

# Then reinstall
rm -rf node_modules
npm install
```

---

## Error Code Reference

AudioBash uses error codes to help identify issues. Look for these in logs or error messages:

| Code | Category | Issue | Solution |
|------|----------|-------|----------|
| E1001 | Network | Connection timeout | Check internet, retry |
| E1002 | Network | WebSocket failed | Check if AudioBash desktop is running |
| E1003 | Network | Rate limit exceeded | Wait and retry |
| E2001 | Audio | Microphone denied | Grant microphone permission |
| E2002 | Audio | Recording failed | Check microphone connection |
| E2003 | Audio | Buffer overflow | Recording too long |
| E3001 | Terminal | PTY spawn failed | Restart application |
| E3002 | Terminal | Process crashed | New terminal will open |
| E4001 | Transcription | No API key | Add key in Settings |
| E4002 | Transcription | Transcription failed | Check API key and internet |
| E4003 | Transcription | Invalid API key | Verify API key is correct |
| E4004 | Transcription | Audio too short | Speak longer |
| E4005 | Transcription | No speech detected | Speak more clearly |
| E5001 | Storage | Settings corrupted | Settings will be reset |
| E8001 | System | Out of memory | Close other applications |
| E8002 | System | Native module failed | Reinstall application |

---

## Collecting Debug Information

If you need to report an issue, collect this information:

### 1. System Information
```bash
# macOS/Linux
uname -a
node --version
npm --version

# Windows PowerShell
$PSVersionTable
node --version
npm --version
```

### 2. Log Files
Find logs in:
- `~/.audiobash/logs/audiobash.log`
- `~/.audiobash/logs/crash-*.json` (if any)

### 3. Steps to Reproduce
1. What were you trying to do?
2. What did you expect to happen?
3. What actually happened?
4. Can you reproduce it consistently?

### 4. Screenshots
If there's a visual issue, take a screenshot showing:
- The error message
- The application state
- Any relevant settings

---

## Repair Workflows

### Complete Reset

If AudioBash is completely broken, try a full reset:

```bash
# 1. Close AudioBash completely

# 2. Clear settings and logs
rm -rf ~/.audiobash

# 3. Reinstall dependencies (from AudioBash directory)
rm -rf node_modules package-lock.json
npm install

# 4. Start fresh
npm run electron:dev
```

### Partial Reset (Keep Settings)

```bash
# Clear only logs
rm -rf ~/.audiobash/logs/*

# Clear only cache
rm -rf ~/.audiobash/cache/*
```

### Terminal-Only Reset

If only the terminal is broken:

1. Close all terminal tabs
2. Go to Settings → Advanced → Reset Terminal
3. Or restart AudioBash

---

## Getting Help

If this guide doesn't resolve your issue:

1. **Search existing issues**: https://github.com/jamditis/audiobash/issues
2. **Create a new issue** with:
   - Error codes (if any)
   - Log excerpts
   - System information
   - Steps to reproduce

3. **Email support**: Include the same information as above

---

## Preventive Measures

### Regular Maintenance

1. **Clear old logs monthly** - Prevents disk space issues
2. **Update regularly** - Get bug fixes and improvements
3. **Backup settings** - Copy `~/.audiobash/app-store.json` periodically

### Best Practices

1. **Don't run dangerous commands** - AudioBash executes real shell commands
2. **Monitor long-running processes** - They consume resources
3. **Use appropriate models** - Faster models for quick commands, accurate models for complex instructions
4. **Keep tabs manageable** - Close tabs you're not using

---

*Last updated: January 2026*
