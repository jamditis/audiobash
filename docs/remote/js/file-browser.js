/**
 * AudioBash Remote - File Browser Module
 * Provides file browsing, editing, and management from mobile
 */

export class FileBrowser {
  constructor(wsManager, activeTabId) {
    this.wsManager = wsManager;
    this.activeTabId = activeTabId;
    this.currentPath = '';
    this.pathHistory = [];
    this.files = [];
    this.selectedFile = null;
    this.isVisible = false;
    this.editingFile = null;
    this.originalContent = '';

    // DOM elements
    this.elements = {
      fileBrowser: document.getElementById('file-browser'),
      fileEditor: document.getElementById('file-editor'),
      terminalContainer: document.getElementById('terminal-container'),
      fileList: document.getElementById('file-list'),
      currentPath: document.getElementById('current-path'),
      backBtn: document.getElementById('file-back-btn'),
      newBtn: document.getElementById('file-new-btn'),
      filesBtn: document.getElementById('files-btn'),
      editorBack: document.getElementById('editor-back-btn'),
      editorFilename: document.getElementById('editor-filename'),
      editorSave: document.getElementById('editor-save-btn'),
      fileContent: document.getElementById('file-content'),
    };

    this.setupEventListeners();
    this.setupWebSocketHandlers();
  }

  setupEventListeners() {
    // Toggle file browser
    this.elements.filesBtn?.addEventListener('click', () => this.toggle());

    // Navigation
    this.elements.backBtn?.addEventListener('click', () => this.goBack());

    // New file/folder
    this.elements.newBtn?.addEventListener('click', () => this.showNewDialog());

    // Editor controls
    this.elements.editorBack?.addEventListener('click', () => this.closeEditor());
    this.elements.editorSave?.addEventListener('click', () => this.saveFile());

    // Track content changes
    this.elements.fileContent?.addEventListener('input', () => {
      this.checkModified();
    });
  }

  setupWebSocketHandlers() {
    // File list response
    this.wsManager.on('file_list_response', (msg) => {
      if (msg.success) {
        this.currentPath = msg.path;
        this.files = msg.files;
        this.renderFileList();
        this.elements.currentPath.textContent = this.truncatePath(msg.path);
      } else {
        this.showError('Failed to list files: ' + msg.error);
      }
    });

    // File read response
    this.wsManager.on('file_read_response', (msg) => {
      if (msg.success) {
        this.showEditor(msg.path, msg.content);
      } else {
        this.showError('Failed to read file: ' + msg.error);
      }
    });

    // File write response
    this.wsManager.on('file_write_response', (msg) => {
      if (msg.success) {
        this.originalContent = this.elements.fileContent.value;
        this.checkModified();
        this.showToast('File saved');
      } else {
        this.showError('Failed to save: ' + msg.error);
      }
    });

    // File delete response
    this.wsManager.on('file_delete_response', (msg) => {
      if (msg.success) {
        this.refresh();
        this.showToast('Deleted');
      } else {
        this.showError('Failed to delete: ' + msg.error);
      }
    });

    // Create folder response
    this.wsManager.on('file_create_folder_response', (msg) => {
      if (msg.success) {
        this.refresh();
        this.showToast('Folder created');
      } else {
        this.showError('Failed to create folder: ' + msg.error);
      }
    });
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.isVisible = true;
    this.elements.filesBtn?.classList.add('active');
    this.elements.terminalContainer?.classList.add('hidden');
    this.elements.fileBrowser?.classList.remove('hidden');
    this.elements.fileEditor?.classList.add('hidden');

    // Load current directory
    this.loadDirectory();
  }

  hide() {
    this.isVisible = false;
    this.elements.filesBtn?.classList.remove('active');
    this.elements.fileBrowser?.classList.add('hidden');
    this.elements.fileEditor?.classList.add('hidden');
    this.elements.terminalContainer?.classList.remove('hidden');
    this.pathHistory = [];
  }

  loadDirectory(path = null) {
    this.wsManager.send({
      type: 'file_list',
      tabId: this.activeTabId,
      dirPath: path,
    });
  }

  refresh() {
    this.loadDirectory(this.currentPath);
  }

  goBack() {
    if (this.pathHistory.length > 0) {
      const prevPath = this.pathHistory.pop();
      this.loadDirectory(prevPath);
    } else {
      // Go to parent directory
      const parentPath = this.getParentPath(this.currentPath);
      if (parentPath && parentPath !== this.currentPath) {
        this.loadDirectory(parentPath);
      }
    }
  }

  getParentPath(currentPath) {
    if (!currentPath) return null;
    const parts = currentPath.replace(/\\/g, '/').split('/');
    parts.pop();
    if (parts.length === 0) return null;
    // Handle Windows drives (C:)
    if (parts.length === 1 && parts[0].endsWith(':')) {
      return parts[0] + '/';
    }
    return parts.join('/') || '/';
  }

  truncatePath(fullPath) {
    if (!fullPath) return '/';
    const maxLen = 35;
    if (fullPath.length <= maxLen) return fullPath;
    return '...' + fullPath.slice(-maxLen + 3);
  }

  renderFileList() {
    if (!this.elements.fileList) return;

    if (this.files.length === 0) {
      this.elements.fileList.innerHTML = `
        <div class="file-empty">This folder is empty</div>
      `;
      return;
    }

    this.elements.fileList.innerHTML = this.files.map(file => `
      <div class="file-item" data-name="${this.escapeHtml(file.name)}" data-is-dir="${file.isDirectory}">
        <svg class="file-icon ${file.isDirectory ? 'folder' : 'file'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${file.isDirectory
            ? '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'
            : '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>'}
        </svg>
        <div class="file-info">
          <div class="file-name">${this.escapeHtml(file.name)}</div>
          <div class="file-meta">${file.isDirectory ? 'Folder' : this.formatSize(file.size)}</div>
        </div>
        <div class="file-actions">
          ${!file.isDirectory ? `
            <button class="file-action-btn edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          ` : ''}
          <button class="file-action-btn delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Add click handlers
    this.elements.fileList.querySelectorAll('.file-item').forEach(item => {
      const name = item.dataset.name;
      const isDir = item.dataset.isDir === 'true';

      // Main item click - navigate or edit
      item.addEventListener('click', (e) => {
        // Ignore if clicking action buttons
        if (e.target.closest('.file-action-btn')) return;

        if (isDir) {
          this.pathHistory.push(this.currentPath);
          const newPath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + name;
          this.loadDirectory(newPath);
        } else {
          this.openFile(name);
        }
      });

      // Edit button
      item.querySelector('.file-action-btn.edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFile(name);
      });

      // Delete button
      item.querySelector('.file-action-btn.delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFile(name, isDir);
      });
    });
  }

  openFile(filename) {
    const filePath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + filename;
    this.wsManager.send({
      type: 'file_read',
      tabId: this.activeTabId,
      filePath: filePath,
    });
  }

  showEditor(filePath, content) {
    this.editingFile = filePath;
    this.originalContent = content;

    // Extract filename from path
    const filename = filePath.split(/[/\\]/).pop();
    this.elements.editorFilename.textContent = filename;
    this.elements.fileContent.value = content;

    // Show editor, hide browser
    this.elements.fileBrowser?.classList.add('hidden');
    this.elements.fileEditor?.classList.remove('hidden');

    // Focus editor
    this.elements.fileContent?.focus();
    this.checkModified();
  }

  closeEditor() {
    if (this.isModified()) {
      if (!confirm('Discard unsaved changes?')) return;
    }

    this.editingFile = null;
    this.originalContent = '';
    this.elements.fileContent.value = '';

    // Show browser, hide editor
    this.elements.fileEditor?.classList.add('hidden');
    this.elements.fileBrowser?.classList.remove('hidden');
  }

  saveFile() {
    if (!this.editingFile) return;

    this.wsManager.send({
      type: 'file_write',
      tabId: this.activeTabId,
      filePath: this.editingFile,
      content: this.elements.fileContent.value,
    });
  }

  isModified() {
    return this.elements.fileContent?.value !== this.originalContent;
  }

  checkModified() {
    if (this.isModified()) {
      this.elements.editorSave?.classList.add('modified');
    } else {
      this.elements.editorSave?.classList.remove('modified');
    }
  }

  deleteFile(filename, isDirectory) {
    const type = isDirectory ? 'folder' : 'file';
    if (!confirm(`Delete ${type} "${filename}"?`)) return;

    const filePath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + filename;
    this.wsManager.send({
      type: 'file_delete',
      tabId: this.activeTabId,
      filePath: filePath,
    });
  }

  showNewDialog() {
    const type = prompt('Create new:\n1 = File\n2 = Folder\n\nEnter 1 or 2:');
    if (!type) return;

    const isFolder = type.trim() === '2';
    const name = prompt(`Enter ${isFolder ? 'folder' : 'file'} name:`);
    if (!name) return;

    const newPath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + name;

    if (isFolder) {
      this.wsManager.send({
        type: 'file_create_folder',
        tabId: this.activeTabId,
        folderPath: newPath,
      });
    } else {
      // Create empty file
      this.wsManager.send({
        type: 'file_write',
        tabId: this.activeTabId,
        filePath: newPath,
        content: '',
      });
    }
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    alert(message);
  }

  showToast(message) {
    // Simple toast - could be enhanced
    console.log('[FileBrowser]', message);
  }

  setActiveTab(tabId) {
    this.activeTabId = tabId;
    if (this.isVisible) {
      // Reload for new tab's working directory
      this.pathHistory = [];
      this.loadDirectory();
    }
  }
}
