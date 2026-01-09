# Performance Check

Analyze AudioBash performance including bundle size, memory leak patterns, React re-render triggers, and PTY cleanup verification.

## Your Role

You are a performance engineer analyzing AudioBash for optimization opportunities and potential issues.

## Analysis Categories

### 1. Bundle Size Analysis

Analyze the production build to identify large dependencies:

```bash
# Build the app
npm run electron:build:linux

# Analyze bundle contents
ls -lh dist/linux-unpacked/resources/app.asar

# Check total app size
du -sh dist/linux-unpacked/
```

**Review package.json dependencies:**

```bash
# List all dependencies with their sizes
npm list --depth=0

# Check for unnecessary dependencies
cat package.json | grep -A 50 '"dependencies"'
```

**Common bloat sources:**
- `electron` - Expected (100+ MB)
- `node-pty` - Required for terminal
- `xterm` and `@xterm/addon-*` - Required for terminal UI
- Unused packages - Remove if found

**Calculate bundle breakdown:**
- Electron framework: ~120 MB
- Node modules: Check actual size
- Application code: Should be < 5 MB
- Assets: Icons, fonts, etc.

### 2. Memory Leak Patterns

Search for common memory leak patterns in React components:

```bash
# Check for missing cleanup in useEffect
grep -rn "useEffect" src/ --include="*.tsx" -A 10 | grep -v "return"

# Check for event listeners without cleanup
grep -rn "addEventListener" src/ --include="*.tsx" --include="*.ts" -B 2 -A 8

# Check for intervals/timeouts without cleanup
grep -rn "setInterval\|setTimeout" src/ --include="*.tsx" --include="*.ts" -B 2 -A 8
```

**Expected patterns:**

```typescript
// GOOD: Cleanup in useEffect
useEffect(() => {
  const handler = () => { /* ... */ };
  window.addEventListener('resize', handler);

  return () => {
    window.removeEventListener('resize', handler);
  };
}, []);

// BAD: No cleanup
useEffect(() => {
  window.addEventListener('resize', handler);
  // ⚠️ Missing cleanup - memory leak!
}, []);
```

**Files to review:**
- `/home/user/audiobash/src/components/Terminal.tsx` - Check PTY data listener cleanup
- `/home/user/audiobash/src/components/VoicePanel.tsx` - Check MediaRecorder cleanup
- `/home/user/audiobash/src/App.tsx` - Check IPC listener cleanup

### 3. React Re-render Triggers

Analyze components for unnecessary re-renders:

```bash
# Check for inline object/array literals in props
grep -rn "\s<[A-Z][a-zA-Z]*.*={{" src/ --include="*.tsx"

# Check for inline function definitions
grep -rn "\s<[A-Z][a-zA-Z]*.*={() =>" src/ --include="*.tsx"

# Check for missing useMemo/useCallback
grep -rn "const.*=.*\[.*\]" src/ --include="*.tsx" -A 2 | grep -v "useMemo\|useState"
```

**Common anti-patterns:**

```typescript
// BAD: New object on every render
<Component config={{ theme: 'dark' }} />

// GOOD: Memoized config
const config = useMemo(() => ({ theme: 'dark' }), []);
<Component config={config} />

// BAD: New function on every render
<Button onClick={() => doSomething()} />

// GOOD: useCallback
const handleClick = useCallback(() => doSomething(), []);
<Button onClick={handleClick} />
```

**Review state management:**
- Check if state updates trigger unnecessary child re-renders
- Verify React.memo usage for expensive components
- Check context value memoization

### 4. PTY Cleanup Verification

Verify that PTY processes are properly cleaned up:

```bash
# Review PTY lifecycle management
grep -rn "pty.spawn\|pty.kill\|pty.destroy" electron/main.cjs -B 3 -A 10
```

**Expected behavior:**
- PTY spawned on app start
- PTY killed on app quit
- Data listeners removed on cleanup
- No orphaned shell processes

**Check for:**
```javascript
// GOOD: Proper cleanup
app.on('before-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
});

mainWindow.on('closed', () => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
});
```

**Test for orphaned processes:**
```bash
# After running and closing the app, check for leftover shells
ps aux | grep -E "bash|zsh|powershell" | grep -v grep
```

### 5. Terminal Performance

Check xterm.js configuration for performance optimizations:

**Files to review:**
- `/home/user/audiobash/src/components/Terminal.tsx`

**Expected optimizations:**
```typescript
// Fast scroll mode for large outputs
{ fastScrollModifier: 'alt' }

// Disable ligatures if not needed (faster rendering)
{ fontLigatures: false }

// Limit scrollback buffer
{ scrollback: 1000 } // Not unlimited

// Use canvas renderer (faster)
{ rendererType: 'canvas' }
```

### 6. Build Performance

Check Vite configuration for optimization:

```bash
# Review vite.config.ts
cat vite.config.ts
```

**Expected optimizations:**
- Minification enabled in production
- Tree shaking enabled
- Code splitting for large modules
- Source maps disabled or external in production

### 7. Startup Time

Measure and identify slow startup patterns:

```bash
# Check for synchronous file operations at startup
grep -rn "readFileSync\|writeFileSync" electron/main.cjs src/

# Check for unnecessary imports
grep -rn "^import.*from" src/ --include="*.tsx" --include="*.ts" | wc -l
```

**Optimize:**
- Lazy load heavy dependencies
- Use async file operations
- Defer non-critical initialization
- Minimize startup imports

## Report Format

Provide findings in this format:

```
## Performance Analysis Report

### Bundle Size
- Total app size: 142 MB
  - Electron: 120 MB (expected)
  - Node modules: 18 MB
  - App code: 4 MB ✓
- Largest dependencies:
  - electron: 120 MB (required)
  - node-pty: 8 MB (required)
  - xterm: 3 MB (required)

### Memory Leak Patterns
✓ All useEffect hooks have cleanup functions
✓ Event listeners properly removed
⚠️ setInterval in VoicePanel.tsx:45 - check if cleanup needed

### React Re-renders
✓ Terminal component uses React.memo
⚠️ Found 3 inline object props (App.tsx:67, 89, 102)
  - Consider extracting to constants
✓ useCallback used for event handlers

### PTY Cleanup
✓ PTY killed on app quit
✓ PTY killed on window close
✓ No orphaned processes detected

### Terminal Performance
✓ Scrollback limited to 1000 lines
✓ Canvas renderer enabled
✗ Font ligatures enabled (consider disabling for performance)

### Build Configuration
✓ Minification enabled
✓ Tree shaking enabled
⚠️ Source maps included in production (adds 2 MB)

### Startup Time
✓ No synchronous file operations
✓ Lazy loading used for services
✓ Minimal startup imports

### Recommendations
1. Extract inline object props to constants (minor impact)
2. Disable font ligatures if not using ligature fonts
3. Remove production source maps or make external
4. Consider code splitting for transcription services

### Performance Score: 8.5/10
```

## Now Execute

Perform the complete performance analysis following all categories above and provide the detailed report.
