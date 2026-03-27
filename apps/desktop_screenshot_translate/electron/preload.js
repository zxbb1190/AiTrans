const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aitransDesktop', {
  onOverlayStart(callback) {
    return subscribe('overlay:start', callback);
  },
  onPanelData(callback) {
    return subscribe('panel:set-data', callback);
  },
  onPanelCommand(callback) {
    return subscribe('panel:command', callback);
  },
  loadConversationState() {
    return ipcRenderer.sendSync('panel:load-conversation-state-sync');
  },
  saveConversationState(payload) {
    return ipcRenderer.invoke('panel:save-conversation-state', payload);
  },
  clearConversationState() {
    return ipcRenderer.invoke('panel:clear-conversation-state');
  },
  submitSelection(selection) {
    return ipcRenderer.invoke('overlay:submit-selection', selection);
  },
  cancelCapture(reason) {
    return ipcRenderer.invoke('overlay:cancel', { reason });
  },
  copyTranslation(text) {
    return ipcRenderer.invoke('panel:copy-translation', { text });
  },
  copyCaptureImage(dataUrl) {
    return ipcRenderer.invoke('panel:copy-capture-image', { dataUrl });
  },
  readClipboardText() {
    return ipcRenderer.invoke('panel:read-clipboard-text');
  },
  closePanel() {
    return ipcRenderer.invoke('panel:close');
  },
  setPanelPinned(payload) {
    return ipcRenderer.invoke('panel:set-pinned', payload);
  },
  recapture() {
    return ipcRenderer.invoke('panel:recapture');
  },
  retryTranslation(payload) {
    return ipcRenderer.invoke('panel:retry-translation', payload);
  },
  translateEditedSource(payload) {
    return ipcRenderer.invoke('panel:translate-edited-source', payload);
  },
  sendTextMessage(payload) {
    return ipcRenderer.invoke('panel:send-text-message', payload);
  },
  openSetupGuide() {
    return ipcRenderer.invoke('panel:open-setup');
  },
  getProjectSummary() {
    return ipcRenderer.invoke('panel:get-project-summary');
  },
  toggleChatWindow() {
    return ipcRenderer.invoke('anchor:toggle-panel');
  },
  openEntryMenu() {
    return ipcRenderer.invoke('anchor:open-menu');
  },
  getAnchorBounds() {
    return ipcRenderer.invoke('anchor:get-bounds');
  },
  setAnchorPosition(payload) {
    return ipcRenderer.invoke('anchor:set-position', payload);
  },
  onSetupData(callback) {
    return subscribe('setup:set-data', callback);
  },
  getSetupGuideState() {
    return ipcRenderer.invoke('setup:get-guide-state');
  },
  openConfigDirectory() {
    return ipcRenderer.invoke('setup:open-config-directory');
  },
  openConfigFile() {
    return ipcRenderer.invoke('setup:open-config-file');
  },
  copyConfigPath() {
    return ipcRenderer.invoke('setup:copy-config-path');
  },
  saveSetupConfig(payload) {
    return ipcRenderer.invoke('setup:save-config', payload);
  },
  closeSetupGuide() {
    return ipcRenderer.invoke('setup:close');
  },
});
