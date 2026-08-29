function ensureTray({ currentTray, TrayClass, icon, contextMenu, tooltip, onClick }) {
  if (currentTray) {
    currentTray.setContextMenu(contextMenu);
    return currentTray;
  }

  const tray = new TrayClass(icon);
  tray.setToolTip(tooltip);
  tray.setContextMenu(contextMenu);
  tray.on('click', onClick);
  return tray;
}

module.exports = { ensureTray };
