const { contextBridge, ipcRenderer } = require('electron');
const call = (name) => (...args) => ipcRenderer.invoke('ponyhaven:' + name, ...args);
const listen = (channel) => (callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on('ponyhaven:' + channel, listener);
  return () => ipcRenderer.removeListener('ponyhaven:' + channel, listener);
};
contextBridge.exposeInMainWorld('ponyDesktop', {
  status: call('status'), activate: call('activate'),
  load: call('load'), save: call('save'), rename: call('rename'),
  linkCloud: call('link-cloud'),
  createProfile: call('create-profile'), selectProfile: call('select-profile'),
  backup: call('backup'), exportSave: call('export'),
  engines: call('engines'), launch: call('launch'), stopGame: call('stop-game'),
  levels: call('levels'), importLevel: call('import-level'), removeLevel: call('remove-level'),
  onGame: listen('game'),
  relayOpen: call('relay-open'), relayClose: call('relay-close'),
  relaySend: call('relay-send'), onPacket: listen('packet'),
  fullscreen: call('fullscreen'),
});
