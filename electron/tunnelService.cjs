/**
 * tunnelto service for exposing WebSocket server to public internet
 * Uses tunnelto CLI to create a secure tunnel to localhost
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

class TunnelService {
  constructor() {
    this.process = null;
    this.tunnelUrl = null;
    this.subdomain = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.error = null;
    this.onStatusChange = null;
    this.outputBuffer = '';
  }

  /**
   * Generate a random subdomain like 'audiobash-a3f7x2'
   */
  generateSubdomain() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const random = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `audiobash-${random}`;
  }

  /**
   * Get path to tunnelto binary (bundled or system)
   */
  getTunneltoBinaryPath() {
    // Check if tunnelto is in PATH
    const binaryName = process.platform === 'win32' ? 'tunnelto.exe' : 'tunnelto';

    // Try to find in PATH
    try {
      const { execSync } = require('child_process');
      const which = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${which} ${binaryName}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (result) {
        console.log('[TunnelService] Found tunnelto at:', result.split('\n')[0]);
        return result.split('\n')[0]; // First result
      }
    } catch (err) {
      console.log('[TunnelService] tunnelto not found in PATH');
    }

    // TODO: Check bundled binary in app resources
    // const resourcesPath = process.resourcesPath;
    // const bundledPath = path.join(resourcesPath, 'bin', binaryName);
    // if (fs.existsSync(bundledPath)) {
    //   return bundledPath;
    // }

    return null;
  }

  /**
   * Start the tunnel
   */
  async start(port = 8765) {
    if (this.process) {
      console.log('[TunnelService] Tunnel already running');
      return;
    }

    const binary = this.getTunneltoBinaryPath();
    if (!binary) {
      this.status = 'error';
      this.error = 'tunnelto binary not found. Please install: cargo install tunnelto';
      this.notifyStatusChange();
      return;
    }

    this.subdomain = this.generateSubdomain();
    this.status = 'connecting';
    this.error = null;
    this.outputBuffer = '';
    this.notifyStatusChange();

    console.log(`[TunnelService] Starting tunnel: ${binary} --port ${port} --subdomain ${this.subdomain}`);

    try {
      // Spawn: tunnelto --port 8765 --subdomain audiobash-xxx
      this.process = spawn(binary, [
        '--port', String(port),
        '--subdomain', this.subdomain
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Parse stdout to detect successful connection
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.outputBuffer += output;
        console.log('[TunnelService] stdout:', output.trim());

        // Look for success indicators in tunnelto output
        // tunnelto typically outputs: "tunneling to https://subdomain.tunnelto.dev"
        const urlMatch = output.match(/https?:\/\/[^\s]+tunnelto\.dev/i);
        if (urlMatch) {
          this.tunnelUrl = urlMatch[0];
          // Convert to wss:// for WebSocket
          this.tunnelUrl = this.tunnelUrl.replace(/^https?:\/\//, 'wss://');
          this.status = 'connected';
          console.log('[TunnelService] Tunnel established:', this.tunnelUrl);
          this.notifyStatusChange();
        }
      });

      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[TunnelService] stderr:', output.trim());

        // Check for errors
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
          this.status = 'error';
          this.error = output.trim();
          this.notifyStatusChange();
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[TunnelService] Process exited with code ${code}, signal ${signal}`);
        this.status = 'disconnected';
        this.tunnelUrl = null;
        this.process = null;

        if (code !== 0 && code !== null) {
          this.error = `Tunnel process exited with code ${code}`;
        }

        this.notifyStatusChange();
      });

      this.process.on('error', (err) => {
        console.error('[TunnelService] Process error:', err);
        this.status = 'error';
        this.error = err.message;
        this.process = null;
        this.notifyStatusChange();
      });

      // Timeout after 15 seconds if not connected
      setTimeout(() => {
        if (this.status === 'connecting') {
          console.warn('[TunnelService] Connection timeout');
          this.status = 'error';
          this.error = 'Connection timeout - unable to establish tunnel';
          this.stop();
          this.notifyStatusChange();
        }
      }, 15000);

    } catch (err) {
      console.error('[TunnelService] Failed to start tunnel:', err);
      this.status = 'error';
      this.error = err.message;
      this.process = null;
      this.notifyStatusChange();
    }
  }

  /**
   * Stop the tunnel
   */
  stop() {
    if (this.process) {
      console.log('[TunnelService] Stopping tunnel');
      this.process.kill();
      this.process = null;
    }
    this.tunnelUrl = null;
    this.status = 'disconnected';
    this.error = null;
    this.notifyStatusChange();
  }

  /**
   * Check if tunnelto binary is available
   */
  checkBinary() {
    const binary = this.getTunneltoBinaryPath();
    return {
      available: !!binary,
      path: binary || null,
      message: binary
        ? 'tunnelto is installed and ready'
        : 'tunnelto not found. Install with: cargo install tunnelto'
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      tunnelUrl: this.tunnelUrl,
      subdomain: this.subdomain,
      error: this.error,
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

module.exports = { TunnelService };
