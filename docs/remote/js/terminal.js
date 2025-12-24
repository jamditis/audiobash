/**
 * Terminal manager for mobile
 * Wraps xterm.js with mobile-optimized settings
 */

export class RemoteTerminal {
  constructor(container, wsManager) {
    this.container = container;
    this.wsManager = wsManager;
    this.term = null;
    this.fitAddon = null;
    this.activeTabId = null;
    this.resizeObserver = null;
  }

  /**
   * Initialize the terminal
   * @param {string} activeTabId - Initial active tab ID
   */
  initialize(activeTabId) {
    this.activeTabId = activeTabId;

    // Create xterm instance with mobile-friendly settings
    this.term = new Terminal({
      theme: {
        background: '#050505',
        foreground: '#e0e0e0',
        cursor: '#ff3333',
        cursorAccent: '#050505',
        selection: 'rgba(255, 51, 51, 0.3)',
        black: '#000000',
        red: '#ff3333',
        green: '#33ff33',
        yellow: '#ffaa00',
        blue: '#3366ff',
        magenta: '#ff33ff',
        cyan: '#33ffff',
        white: '#e0e0e0',
        brightBlack: '#666666',
        brightRed: '#ff6666',
        brightGreen: '#66ff66',
        brightYellow: '#ffcc00',
        brightBlue: '#6699ff',
        brightMagenta: '#ff66ff',
        brightCyan: '#66ffff',
        brightWhite: '#ffffff',
      },
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      // Mobile-specific settings
      convertEol: true,
      scrollOnUserInput: true,
    });

    // Load fit addon
    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);

    // Open in container
    this.term.open(this.container);

    // Initial fit
    this.fit();

    // Handle user input - send to server
    this.term.onData((data) => {
      this.wsManager.send({
        type: 'terminal_write',
        tabId: this.activeTabId,
        data: data,
      });
    });

    // Handle resize
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.fit(), 100);
    });

    // ResizeObserver for container size changes
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.fit();
      });
      this.resizeObserver.observe(this.container);
    }

    // Listen for terminal data from server
    this.wsManager.on('terminal_data', (message) => {
      if (message.tabId === this.activeTabId) {
        this.term.write(message.data);
      }
    });

    // Listen for tabs update
    this.wsManager.on('tabs_update', (message) => {
      // Emit event for app to handle tab selector update
      if (this.onTabsUpdate) {
        this.onTabsUpdate(message.tabs);
      }
    });
  }

  /**
   * Fit terminal to container and notify server
   */
  fit() {
    if (!this.fitAddon || !this.term) return;

    try {
      this.fitAddon.fit();
      // Notify server of new dimensions
      this.wsManager.send({
        type: 'terminal_resize',
        tabId: this.activeTabId,
        cols: this.term.cols,
        rows: this.term.rows,
      });
    } catch (err) {
      // Ignore fit errors during transitions
    }
  }

  /**
   * Switch to a different tab
   * @param {string} tabId - Tab ID to switch to
   */
  switchTab(tabId) {
    if (tabId === this.activeTabId) return;

    this.activeTabId = tabId;
    this.term.clear();
    this.wsManager.send({
      type: 'switch_tab',
      tabId: tabId,
    });
  }

  /**
   * Clear the terminal display
   */
  clear() {
    this.term?.clear();
  }

  /**
   * Focus the terminal
   */
  focus() {
    this.term?.focus();
  }

  /**
   * Dispose of the terminal
   */
  dispose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.term?.dispose();
  }
}
