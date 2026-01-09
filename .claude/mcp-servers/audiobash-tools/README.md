# AudioBash Tools MCP Server

Custom Model Context Protocol (MCP) server providing development tools for the AudioBash project.

## Overview

This MCP server exposes AudioBash-specific development tools directly to Claude Code, allowing you to launch, test, build, and inspect the AudioBash Electron app through natural language commands.

## Installation

### 1. Install dependencies

From the MCP server directory:

```bash
cd .claude/mcp-servers/audiobash-tools
npm install
```

### 2. Configure Claude Code

Add this server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "audiobash-tools": {
      "command": "node",
      "args": [
        "/absolute/path/to/audiobash/.claude/mcp-servers/audiobash-tools/index.js"
      ]
    }
  }
}
```

**Important**: Replace `/absolute/path/to/audiobash/` with the actual absolute path to your AudioBash project root.

### 3. Restart Claude Desktop

The MCP server will automatically start when Claude Desktop launches.

## Available Tools

### `audiobash_launch_dev`

Launch AudioBash in development mode.

**Usage:**
```
Launch AudioBash in dev mode
```

**What it does:**
- Runs `npm run electron:dev`
- Starts Vite dev server + Electron app
- Enables hot reload for React components

**Note**: The dev server runs indefinitely. Use Ctrl+C in the terminal to stop it.

---

### `audiobash_run_tests`

Run the AudioBash test suite (70 tests).

**Parameters:**
- `filter` (optional): Test file pattern to filter tests (e.g., "Terminal", "IPC")
- `verbose` (optional): Run in verbose mode (default: false)

**Usage:**
```
Run all AudioBash tests
Run AudioBash tests for Terminal components
Run AudioBash tests in verbose mode
```

**What it does:**
- Executes Jest test suite
- Returns test results summary (passed/failed/total)
- Shows full test output

---

### `audiobash_list_ipc`

List all IPC (Inter-Process Communication) handlers defined in the Electron main process.

**Usage:**
```
List all IPC handlers in AudioBash
Show me the IPC channels
```

**What it does:**
- Parses `electron/main.cjs`
- Extracts all `ipcMain.handle()` and `ipcMain.on()` calls
- Returns handlers grouped by type (handle vs. on)

**Example output:**
```json
{
  "totalHandlers": 12,
  "handlers": {
    "handle": [
      "terminal-resize",
      "get-settings",
      "save-settings"
    ],
    "on": [
      "terminal-write",
      "terminal-input"
    ]
  }
}
```

---

### `audiobash_build`

Build AudioBash for a specific platform.

**Parameters:**
- `platform`: Target platform (default: `mac:arm64`)
  - `mac` - Universal macOS build
  - `mac:arm64` - Apple Silicon (M1/M2/M3)
  - `mac:x64` - Intel Mac
  - `win` - Windows
  - `linux` - Linux

**Usage:**
```
Build AudioBash for macOS
Build AudioBash for Windows
Build AudioBash for Apple Silicon
```

**What it does:**
- Runs electron-builder for the specified platform
- Creates distributable package (DMG, EXE, AppImage, etc.)
- Returns build output and any errors

**Note**: Builds can take 2-5 minutes depending on platform and machine.

---

### `audiobash_check_deps`

Check for outdated npm dependencies.

**Usage:**
```
Check AudioBash dependencies for updates
Are any AudioBash packages outdated?
```

**What it does:**
- Runs `npm outdated --json`
- Returns list of packages with version info
- Shows current, wanted, and latest versions

**Example output:**
```json
{
  "outdatedCount": 3,
  "outdated": [
    {
      "name": "electron",
      "current": "27.0.0",
      "wanted": "27.3.1",
      "latest": "28.0.0"
    }
  ]
}
```

---

## Example Claude Code Commands

Once the MCP server is configured, you can use natural language commands:

### Development workflow
```
"Launch AudioBash in dev mode"
"Run the tests and show me the results"
"Build AudioBash for my Mac"
```

### Debugging
```
"List all IPC handlers in AudioBash"
"Show me the IPC channels between main and renderer"
```

### Maintenance
```
"Check if any AudioBash dependencies are outdated"
"Are there updates available for the packages?"
```

### Filtered testing
```
"Run only the Terminal tests"
"Run tests for the VoicePanel component"
```

## Architecture

```
Claude Desktop
      ↓
   MCP Protocol (JSON-RPC via stdio)
      ↓
AudioBash Tools Server (this package)
      ↓
   Node.js child_process
      ↓
npm commands in AudioBash project root
```

The MCP server:
1. Receives tool calls from Claude via stdio
2. Executes npm commands in the AudioBash project directory
3. Parses output and returns structured results
4. Handles errors gracefully

## Troubleshooting

### Server not showing up in Claude

1. Check Claude Desktop config file syntax (valid JSON)
2. Ensure absolute path is correct
3. Restart Claude Desktop completely
4. Check Claude logs: Help → View Logs

### "Cannot find module @modelcontextprotocol/sdk"

```bash
cd .claude/mcp-servers/audiobash-tools
npm install
```

### Commands timing out

Some commands (like `electron:dev` and builds) run for a long time or indefinitely:
- `audiobash_launch_dev` has a 5s timeout (launches then exits)
- `audiobash_build` has a 5min timeout
- `audiobash_run_tests` has a 1min timeout

If you need longer timeouts, edit the `timeout` values in `index.js`.

### IPC handlers not parsing correctly

The `audiobash_list_ipc` tool uses regex to parse `electron/main.cjs`. If the file structure changes significantly, the regex patterns may need updating.

## Development

To modify the MCP server:

1. Edit `index.js` to add/modify tools
2. Update tool schemas in `ListToolsRequestSchema` handler
3. Add tool implementation in `CallToolRequestSchema` handler
4. Test with `node index.js` (should print "server running on stdio")
5. Restart Claude Desktop to reload changes

## Version History

**1.0.0** (2026-01-09)
- Initial release
- 5 development tools
- Support for macOS/Windows/Linux builds
- IPC handler introspection
- Dependency checking

## License

MIT - Same as AudioBash project

## Related Documentation

- [AudioBash Documentation](https://jamditis.github.io/audiobash/)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
