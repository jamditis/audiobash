/**
 * Cloudflare Tunnel service for exposing WebSocket server to public internet
 * Uses cloudflared CLI to create a quick tunnel to localhost
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

class CloudflareService {
  constructor() {
    this.process = null;
    this.tunnelUrl = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.error = null;
    this.onStatusChange = null;
    this.outputBuffer = '';
  }

  /**
   * Get path to cloudflared binary (if installed)
   */
  getCloudflareBinaryPath() {
    const binaryName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

    // Try to find in PATH
    try {
      const which = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${which} ${binaryName}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (result) {
        console.log('[CloudflareService] Found cloudflared at:', result.split(/\r?\n/)[0]);
        return result.split(/\r?\n/)[0];
      }
    } catch (err) {
      console.log('[CloudflareService] cloudflared not found in PATH');
    }

    // Check common install locations
    const commonPaths = [];

    if (process.platform === 'win32') {
      commonPaths.push(
        path.join(os.homedir(), 'cloudflared.exe'),
        path.join(os.homedir(), 'Downloads', 'cloudflared.exe'),
        path.join(os.homedir(), 'Desktop', 'cloudflared.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe'),
        path.join(process.env.ProgramFiles || '', 'cloudflared', 'cloudflared.exe'),
        'C:\\cloudflared\\cloudflared.exe',
        // Scoop
        path.join(os.homedir(), 'scoop', 'shims', 'cloudflared.exe')
      );
    } else if (process.platform === 'darwin') {
      commonPaths.push(
        '/usr/local/bin/cloudflared',
        '/opt/homebrew/bin/cloudflared',
        // MacPorts
        '/opt/local/bin/cloudflared',
        path.join(os.homedir(), 'cloudflared'),
        path.join(os.homedir(), 'Downloads', 'cloudflared')
      );
    } else {
      commonPaths.push(
        '/usr/local/bin/cloudflared',
        '/usr/bin/cloudflared',
        // Snap
        '/snap/bin/cloudflared',
        path.join(os.homedir(), 'cloudflared'),
        path.join(os.homedir(), 'bin', 'cloudflared'),
        path.join(os.homedir(), '.local', 'bin', 'cloudflared')
      );
    }

    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) {
        console.log('[CloudflareService] Found cloudflared at:', p);
        return p;
      }
    }

    return null;
  }

  /**
   * Extract Cloudflare tunnel URL from text output
   */
  extractTunnelUrl(text) {
    // Match Cloudflare tunnel URL patterns
    const patterns = [
      /https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
      /https?:\/\/[a-z0-9-]+\.cfargotunnel\.com/i,
      // JSON format from --url output
      /"url"\s*:\s*"(https?:\/\/[^"]+)"/i,
      // Plain URL in output
      /INF\s+\|\s+(https?:\/\/[a-z0-9-]+\.[a-z]+\.com)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Return the URL, handling capture groups
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Start the tunnel using CLI (quick tunnel mode - no account needed)
   */
  async start(port = 8765) {
    if (this.process) {
      console.log('[CloudflareService] Tunnel already running');
      return;
    }

    const binary = this.getCloudflareBinaryPath();
    if (!binary) {
      this.status = 'error';
      this.error = 'cloudflared not found. Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
      this.notifyStatusChange();
      throw new Error(this.error);
    }

    this.status = 'connecting';
    this.error = null;
    this.outputBuffer = '';
    this.notifyStatusChange();

    console.log(`[CloudflareService] Starting tunnel: ${binary} tunnel --url http://localhost:${port}`);

    return new Promise((resolve, reject) => {
      // Spawn: cloudflared tunnel --url http://localhost:PORT
      // This creates a "quick tunnel" that doesn't require authentication
      const args = ['tunnel', '--url', `http://localhost:${port}`];

      this.process = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // cloudflared outputs the tunnel URL to stderr
      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        this.outputBuffer += output;
        console.log('[CloudflareService] output:', output.trim());

        // Look for the tunnel URL
        const url = this.extractTunnelUrl(output);
        if (url && this.status !== 'connected') {
          // Convert to wss:// for WebSocket use
          this.tunnelUrl = url.replace(/^https?:\/\//, 'wss://');
          this.status = 'connected';
          console.log('[CloudflareService] Tunnel established:', this.tunnelUrl);
          this.notifyStatusChange();
          resolve();
        }

        // Check for errors
        if (output.toLowerCase().includes('error') && !url) {
          // Only treat as error if we haven't connected yet
          if (this.status !== 'connected') {
            this.status = 'error';
            this.error = this.parseCloudflareError(output);
            this.notifyStatusChange();
            reject(new Error(this.error));
          }
        }
      });

      // Also check stdout (some versions output there)
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.outputBuffer += output;
        console.log('[CloudflareService] stdout:', output.trim());

        const url = this.extractTunnelUrl(output);
        if (url && this.status !== 'connected') {
          this.tunnelUrl = url.replace(/^https?:\/\//, 'wss://');
          this.status = 'connected';
          console.log('[CloudflareService] Tunnel established:', this.tunnelUrl);
          this.notifyStatusChange();
          resolve();
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[CloudflareService] Process exited with code ${code}, signal ${signal}`);
        this.status = 'disconnected';
        this.tunnelUrl = null;
        this.process = null;

        if (code !== 0 && code !== null && this.status !== 'error') {
          this.error = `cloudflared process exited with code ${code}`;
          this.status = 'error';
        }

        this.notifyStatusChange();
      });

      this.process.on('error', (err) => {
        console.error('[CloudflareService] Process error:', err);
        this.status = 'error';
        this.error = err.message;
        this.process = null;
        this.notifyStatusChange();
        reject(err);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.status === 'connecting') {
          console.warn('[CloudflareService] Connection timeout');
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
   * Parse cloudflared error messages into user-friendly text
   */
  parseCloudflareError(output) {
    if (output.includes('failed to connect') || output.includes('connection refused')) {
      return 'Failed to connect to local server. Make sure the port is accessible.';
    }
    if (output.includes('invalid port') || output.includes('port')) {
      return 'Invalid port configuration. Check the port number.';
    }
    if (output.includes('quic') || output.includes('QUIC')) {
      return 'QUIC connection error. This may be a network configuration issue.';
    }

    // Return trimmed error
    const lines = output.split('\n').filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('failed'));
    if (lines.length > 0) {
      return lines[0].trim().slice(0, 200);
    }

    return output.trim().slice(0, 200);
  }

  /**
   * Stop the tunnel
   */
  stop() {
    console.log('[CloudflareService] Stopping tunnel');

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.tunnelUrl = null;
    this.status = 'disconnected';
    this.error = null;
    this.notifyStatusChange();
  }

  /**
   * Check if cloudflared is available
   */
  checkBinary() {
    const binary = this.getCloudflareBinaryPath();

    if (binary) {
      return {
        available: true,
        path: binary,
        message: 'cloudflared is installed and ready (quick tunnel mode - no account required)'
      };
    }

    return {
      available: false,
      path: null,
      message: 'cloudflared not found. Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      tunnelUrl: this.tunnelUrl,
      error: this.error
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

module.exports = { CloudflareService };
