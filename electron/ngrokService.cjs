/**
 * ngrok service for exposing WebSocket server to public internet
 * Supports both ngrok CLI and @ngrok/ngrok npm package
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

class NgrokService {
  constructor() {
    this.process = null;
    this.tunnelUrl = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.error = null;
    this.onStatusChange = null;
    this.outputBuffer = '';
    this.ngrokModule = null; // For npm package mode
    this.listener = null; // ngrok listener from npm package
  }

  /**
   * Check if NGROK_AUTHTOKEN environment variable is set
   * Required for longer tunnel sessions
   */
  hasAuthToken() {
    return !!process.env.NGROK_AUTHTOKEN;
  }

  /**
   * Get path to ngrok binary (if installed)
   */
  getNgrokBinaryPath() {
    const binaryName = process.platform === 'win32' ? 'ngrok.exe' : 'ngrok';

    // Try to find in PATH
    try {
      const which = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${which} ${binaryName}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (result) {
        console.log('[NgrokService] Found ngrok CLI at:', result.split('\n')[0]);
        return result.split('\n')[0];
      }
    } catch (err) {
      console.log('[NgrokService] ngrok CLI not found in PATH');
    }

    // Check common install locations
    const commonPaths = [];

    if (process.platform === 'win32') {
      commonPaths.push(
        path.join(os.homedir(), 'ngrok.exe'),
        path.join(os.homedir(), 'Downloads', 'ngrok.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'ngrok', 'ngrok.exe'),
        path.join(process.env.ProgramFiles || '', 'ngrok', 'ngrok.exe')
      );
    } else if (process.platform === 'darwin') {
      commonPaths.push(
        '/usr/local/bin/ngrok',
        '/opt/homebrew/bin/ngrok',
        path.join(os.homedir(), 'ngrok'),
        path.join(os.homedir(), 'Downloads', 'ngrok')
      );
    } else {
      commonPaths.push(
        '/usr/local/bin/ngrok',
        '/usr/bin/ngrok',
        path.join(os.homedir(), 'ngrok'),
        path.join(os.homedir(), 'bin', 'ngrok')
      );
    }

    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) {
        console.log('[NgrokService] Found ngrok at:', p);
        return p;
      }
    }

    return null;
  }

  /**
   * Check if @ngrok/ngrok npm package is available
   */
  checkNpmPackage() {
    try {
      this.ngrokModule = require('@ngrok/ngrok');
      console.log('[NgrokService] @ngrok/ngrok npm package is available');
      return true;
    } catch (err) {
      console.log('[NgrokService] @ngrok/ngrok npm package not installed');
      this.ngrokModule = null;
      return false;
    }
  }

  /**
   * Start the tunnel using npm package
   */
  async startWithNpmPackage(port) {
    if (!this.ngrokModule) {
      throw new Error('@ngrok/ngrok package not available');
    }

    console.log(`[NgrokService] Starting tunnel via npm package on port ${port}`);

    try {
      // Create a forward listener
      this.listener = await this.ngrokModule.forward({
        addr: port,
        authtoken_from_env: true
      });

      const url = this.listener.url();
      console.log('[NgrokService] Tunnel established:', url);

      // Convert to wss:// for WebSocket use
      this.tunnelUrl = url.replace(/^https?:\/\//, 'wss://');
      this.status = 'connected';
      this.notifyStatusChange();

    } catch (err) {
      console.error('[NgrokService] npm package tunnel failed:', err);
      throw err;
    }
  }

  /**
   * Start the tunnel using CLI
   */
  async startWithCli(port, binary) {
    console.log(`[NgrokService] Starting tunnel via CLI: ${binary} http ${port}`);

    return new Promise((resolve, reject) => {
      // Spawn: ngrok http PORT --log stdout --log-format json
      // Using JSON log format for easier parsing
      const args = ['http', String(port), '--log', 'stdout', '--log-format', 'json'];

      this.process = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure auth token is passed if set
          NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN
        }
      });

      // Parse stdout for tunnel URL
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.outputBuffer += output;

        // Process each line (ngrok outputs JSON per line)
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            // Try to parse as JSON (ngrok --log-format json)
            const logEntry = JSON.parse(line);
            console.log('[NgrokService] log:', logEntry.msg || logEntry);

            // Look for the URL in JSON output
            if (logEntry.url) {
              this.handleUrlFound(logEntry.url);
              resolve();
            }

            // Also check for addr field which contains the URL
            if (logEntry.addr && logEntry.addr.includes('ngrok')) {
              this.handleUrlFound(logEntry.addr);
              resolve();
            }

          } catch (parseErr) {
            // Not JSON, try plain text parsing
            console.log('[NgrokService] stdout:', line.trim());
            const urlMatch = this.extractNgrokUrl(line);
            if (urlMatch) {
              this.handleUrlFound(urlMatch);
              resolve();
            }
          }
        }
      });

      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[NgrokService] stderr:', output.trim());

        // Check for common errors
        if (output.toLowerCase().includes('err_ngrok_')) {
          this.status = 'error';
          this.error = this.parseNgrokError(output);
          this.notifyStatusChange();
          reject(new Error(this.error));
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[NgrokService] Process exited with code ${code}, signal ${signal}`);
        this.status = 'disconnected';
        this.tunnelUrl = null;
        this.process = null;

        if (code !== 0 && code !== null && this.status !== 'error') {
          this.error = `ngrok process exited with code ${code}`;
          this.status = 'error';
        }

        this.notifyStatusChange();
      });

      this.process.on('error', (err) => {
        console.error('[NgrokService] Process error:', err);
        this.status = 'error';
        this.error = err.message;
        this.process = null;
        this.notifyStatusChange();
        reject(err);
      });

      // Timeout after 30 seconds (ngrok can take a bit longer)
      setTimeout(() => {
        if (this.status === 'connecting') {
          console.warn('[NgrokService] Connection timeout');
          this.status = 'error';
          this.error = 'Connection timeout - unable to establish tunnel';
          this.stop();
          this.notifyStatusChange();
          reject(new Error(this.error));
        }
      }, 30000);
    });
  }

  /**
   * Extract ngrok URL from text output
   */
  extractNgrokUrl(text) {
    // Match various ngrok URL patterns
    const patterns = [
      /https?:\/\/[a-z0-9-]+\.ngrok\.io/i,
      /https?:\/\/[a-z0-9-]+\.ngrok-free\.app/i,
      /https?:\/\/[a-z0-9-]+\.ngrok\.app/i,
      /https?:\/\/[a-z0-9-]+\.ngrok\.dev/i,
      /Forwarding\s+(https?:\/\/[^\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Return the URL, handling the Forwarding pattern specially
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Handle when URL is found
   */
  handleUrlFound(url) {
    // Convert to wss:// for WebSocket use
    this.tunnelUrl = url.replace(/^https?:\/\//, 'wss://');
    this.status = 'connected';
    console.log('[NgrokService] Tunnel established:', this.tunnelUrl);
    this.notifyStatusChange();
  }

  /**
   * Parse ngrok error messages into user-friendly text
   */
  parseNgrokError(output) {
    if (output.includes('ERR_NGROK_105') || output.includes('authentication')) {
      return 'ngrok authentication required. Set NGROK_AUTHTOKEN environment variable or run: ngrok config add-authtoken <token>';
    }
    if (output.includes('ERR_NGROK_108') || output.includes('tunnel session')) {
      return 'ngrok tunnel session limit reached. Upgrade your ngrok plan or wait for existing sessions to expire.';
    }
    if (output.includes('ERR_NGROK_120')) {
      return 'ngrok region error. Try a different region.';
    }
    if (output.includes('ERR_NGROK_226')) {
      return 'ngrok free plan limit: Only one online tunnel per ngrok agent. Stop other tunnels first.';
    }

    // Extract error code if present
    const errMatch = output.match(/ERR_NGROK_\d+/);
    if (errMatch) {
      return `ngrok error: ${errMatch[0]}. Check ngrok documentation for details.`;
    }

    return output.trim();
  }

  /**
   * Start the tunnel
   */
  async start(port = 8765) {
    if (this.process || this.listener) {
      console.log('[NgrokService] Tunnel already running');
      return;
    }

    this.status = 'connecting';
    this.error = null;
    this.outputBuffer = '';
    this.notifyStatusChange();

    // Check for auth token
    if (!this.hasAuthToken()) {
      console.warn('[NgrokService] NGROK_AUTHTOKEN not set. Tunnel may have limited duration.');
    }

    try {
      // First, try npm package (more reliable)
      if (this.checkNpmPackage()) {
        await this.startWithNpmPackage(port);
        return;
      }

      // Fall back to CLI
      const binary = this.getNgrokBinaryPath();
      if (binary) {
        await this.startWithCli(port, binary);
        return;
      }

      // Neither available
      this.status = 'error';
      this.error = 'ngrok not found. Install via npm: npm install @ngrok/ngrok\nOr download CLI from: https://ngrok.com/download';
      this.notifyStatusChange();

    } catch (err) {
      console.error('[NgrokService] Failed to start tunnel:', err);
      this.status = 'error';
      this.error = err.message;
      this.process = null;
      this.listener = null;
      this.notifyStatusChange();
    }
  }

  /**
   * Stop the tunnel
   */
  async stop() {
    console.log('[NgrokService] Stopping tunnel');

    // Stop CLI process if running
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    // Stop npm package listener if running
    if (this.listener) {
      try {
        await this.listener.close();
      } catch (err) {
        console.error('[NgrokService] Error closing listener:', err);
      }
      this.listener = null;
    }

    // Also disconnect the ngrok module if available
    if (this.ngrokModule) {
      try {
        await this.ngrokModule.disconnect();
      } catch (err) {
        // Ignore errors during disconnect
      }
    }

    this.tunnelUrl = null;
    this.status = 'disconnected';
    this.error = null;
    this.notifyStatusChange();
  }

  /**
   * Check if ngrok is available (CLI or npm package)
   */
  checkBinary() {
    const hasNpmPackage = this.checkNpmPackage();
    const binary = this.getNgrokBinaryPath();
    const hasAuthToken = this.hasAuthToken();

    if (hasNpmPackage) {
      return {
        available: true,
        path: '@ngrok/ngrok (npm package)',
        hasAuthToken,
        message: hasAuthToken
          ? 'ngrok npm package is installed and authenticated'
          : 'ngrok npm package is installed. Set NGROK_AUTHTOKEN for longer sessions.'
      };
    }

    if (binary) {
      return {
        available: true,
        path: binary,
        hasAuthToken,
        message: hasAuthToken
          ? 'ngrok CLI is installed and authenticated'
          : 'ngrok CLI is installed. Set NGROK_AUTHTOKEN for longer sessions.'
      };
    }

    return {
      available: false,
      path: null,
      hasAuthToken: false,
      message: 'ngrok not found. Install via npm: npm install @ngrok/ngrok\nOr download CLI from: https://ngrok.com/download'
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      tunnelUrl: this.tunnelUrl,
      error: this.error,
      hasAuthToken: this.hasAuthToken()
    };
  }

  /**
   * Notify listeners of status change
   */
  notifyStatusChange() {
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }
}

module.exports = { NgrokService };
