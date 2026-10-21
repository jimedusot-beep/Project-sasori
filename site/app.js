'use strict';
// Experiment 001 is intentionally read-only. No app-level BLE writes in this file.
const byId = id => document.getElementById(id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stateText = byId('state');
const connectButton = byId('connect');
const disconnectButton = byId('disconnect');
let currentSession = null;
let nextSessionId = 0;
let lines = [];

function renderState(label) { stateText.textContent = label; }
function log(message) {
  lines.push(new Date().toISOString() + ' ' + message);
  if (lines.length > 500) lines = lines.slice(-500);
  byId('log').textContent = lines.join('\n');
  byId('log').scrollTop = byId('log').scrollHeight;
}
function hex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function notificationHandler(session, event) {
  if (currentSession !== session || session.finished) return;
  const value = event.target.value;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  log('RX ' + hex(bytes) + ' | TEXT ' + JSON.stringify(new TextDecoder().decode(bytes)));
}
function finish(session, reason) {
  if (session.finished) return;
  session.finished = true;
  if (session.timer !== null) clearTimeout(session.timer);
  if (session.characteristic && session.listener) {
    try { session.characteristic.removeEventListener('characteristicvaluechanged', session.listener); } catch (_) {}
  }
  if (currentSession !== session) return; // Old device events must not disrupt a new connection.
  currentSession = null;
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  renderState('Disconnected · ' + reason);
  log('STATE disconnected; reason=' + reason + '; session=' + session.id);
}
function stopSession(session, reason) {
  if (!session || session.finished) return;
  session.stopReason = reason;
  // This is subscription cleanup, not a device command.
  if (session.characteristic) {
    try {
      const promise = session.characteristic.stopNotifications();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch (_) {}
  }
  try {
    if (session.server && session.server.connected) session.server.disconnect();
  } catch (error) {
    log('DISCONNECT error: ' + (error.message || String(error)));
  }
  finish(session, reason);
}
async function connect() {
  if (currentSession) return;
  const serviceUUID = byId('svc').value.trim();
  const notifyUUID = byId('notify').value.trim();
  if (!UUID.test(serviceUUID) || !UUID.test(notifyUUID)) {
    log('ERROR Enter two verified 128-bit UUIDs from original V4 source or nRF Connect.');
    return;
  }
  if (!navigator.bluetooth) {
    log('ERROR Web Bluetooth is unavailable in this browser. Try Bluefy.');
    return;
  }
  const session = {
    id: ++nextSessionId, device: null, server: null, characteristic: null,
    listener: null, timer: null, stopReason: null, finished: false
  };
  currentSession = session;
  connectButton.disabled = true;
  disconnectButton.disabled = true;
  renderState('Selecting device');
  log('MODE inspect-only; session=' + session.id + '; no application commands sent');
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true, optionalServices: [serviceUUID]
    });
    if (currentSession !== session || session.finished) return;
    session.device = device;
    log('Device selected: ' + JSON.stringify(device.name || 'Unnamed BLE device'));
    device.addEventListener('gattserverdisconnected', () => {
      finish(session, session.stopReason || 'unexpected-link-loss');
    }, { once: true });
    renderState('Connecting');
    session.server = await device.gatt.connect();
    if (currentSession !== session || session.finished) {
      if (session.server.connected) session.server.disconnect();
      return;
    }
    log('GATT connected');
    renderState('Discovering service');
    const service = await session.server.getPrimaryService(serviceUUID);
    if (currentSession !== session || session.finished) return;
    log('Custom service found');
    session.characteristic = await service.getCharacteristic(notifyUUID);
    if (currentSession !== session || session.finished) return;
    if (!session.characteristic.properties.notify) {
      throw new Error('Selected characteristic does not support notifications.');
    }
    session.listener = event => notificationHandler(session, event);
    session.characteristic.addEventListener('characteristicvaluechanged', session.listener);
    await session.characteristic.startNotifications();
    if (currentSession !== session || session.finished) return;
    log('Notification subscription active');
    renderState('Connected · read-only');
    disconnectButton.disabled = false;
    session.timer = setTimeout(() => {
      log('Inspection window ended after 15 seconds');
      stopSession(session, 'timed-inspection');
    }, 15000);
  } catch (error) {
    if (currentSession !== session || session.finished) return;
    const reason = error.name === 'NotFoundError' ? 'selection-cancelled' : 'error';
    log('ERROR ' + (error.name || 'Error') + ': ' + (error.message || String(error)));
    stopSession(session, reason);
  }
}
function disconnect() { stopSession(currentSession, 'manual'); }
function download(filename, body) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
connectButton.addEventListener('click', connect);
disconnectButton.addEventListener('click', disconnect);
byId('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    log('Diagnostic log copied; inspect before sharing');
  } catch (error) {
    log('Clipboard unavailable: ' + error.message + '. Use Export log instead.');
  }
});
byId('export').addEventListener('click', () => download('project-sasori-elmo-log.txt', lines.join('\n') + '\n'));
byId('clear').addEventListener('click', () => { lines = []; byId('log').textContent = ''; log('Diagnostic log cleared'); });
byId('support').textContent = navigator.bluetooth
  ? 'Web Bluetooth API detected. Permissions are requested only after tapping Connect.'
  : 'Web Bluetooth unavailable. Open the deployed site in Bluefy on iPhone.';
log('Sasori BLE inspection lab loaded; no commands sent before Connect.');