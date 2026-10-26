// Presentation only: this module never requests permissions or dispatches commands.
// The Hub and the Elmo Remote retain their existing adapter-specific controllers.
const STATE_LABELS = Object.freeze({
  idle: 'Not connected',
  choosing: 'Choosing a device',
  connecting: 'Connecting',
  authenticating: 'Checking device password',
  connected: 'Connected',
  ready: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection ended',
});

const ACTION_LABELS = Object.freeze({
  'sound-requested': 'Sound request',
  'volume-requested': 'Volume request',
  'effect-requested': 'Light or alert request',
  'state-read': 'Device information read',
  'greeting-requested': 'Greeting request',
});

function actionName(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (typeof action === 'string' && /^[a-z-]{1,40}-requested$/.test(action))
    return 'Remote button request';
  return 'No action recorded';
}

export function deviceDetailModel({
  deviceName = '',
  familyName = 'Device',
  state = 'idle',
  synthetic = false,
  canConnect = false,
  nativeUnsupported = false,
  lastAction = '',
  failure = false,
} = {}) {
  const connected = state === 'connected' || state === 'ready';
  const connecting = ['choosing', 'connecting', 'authenticating'].includes(state);
  const action = actionName(lastAction);
  const hasAction = action !== 'No action recorded';
  const progress = connected && synthetic ? 'Demo ready' : STATE_LABELS[state] || 'Not connected';
  const compatibility = nativeUnsupported
    ? 'Not supported by this native adapter'
    : canConnect
      ? 'Experimental · software-supported'
      : 'Demo available · live connection unavailable here';
  let happened;
  let next;
  if (failure) {
    happened = 'The last connection or action did not finish.';
    next = 'Read the recovery message below. Check the device, then try again or use Demo.';
  } else if (connecting) {
    happened = 'Sasori is setting up the selected connection.';
    next = 'Choose your device if asked. Use Stop & disconnect to cancel.';
  } else if (connected && synthetic) {
    happened = hasAction
      ? 'The demo handled your action without sending a device command.'
      : 'A simulated device is ready. No real device was contacted.';
    next = 'Try an available control, then save your result.';
  } else if (connected) {
    happened = hasAction
      ? 'Sasori handled the request through the connected adapter.'
      : 'The device is connected to Sasori.';
    next = hasAction
      ? 'Check what the physical device did. A sent command is not proof of an effect.'
      : 'Choose an available control. Stop when you finish.';
  } else {
    happened = state === 'disconnected' ? 'The connection has ended.' : 'Nothing is connected.';
    next = canConnect
      ? 'Press Connect or Try Demo to begin.'
      : nativeUnsupported
        ? 'Use the Research Lab for supported native controls, or try an offline demo.'
        : 'Try Demo now, or use a compatible browser or companion for a live connection.';
  }
  const outcome = !hasAction
    ? 'No action yet'
    : synthetic
      ? 'Demo only · no physical command sent'
      : lastAction === 'state-read'
        ? 'Software read completed · verify values on your device'
        : 'Command sent · physical effect not confirmed';
  return {
    name: String(deviceName || familyName),
    compatibility,
    progress,
    lastAction: action,
    outcome,
    happened,
    next,
    physical: 'Not independently verified',
  };
}

export function mountDeviceDetail(parent, doc = document) {
  const element = doc.createElement('section');
  element.className = 'sasori-device-detail';
  element.setAttribute('aria-label', 'Device details');
  const heading = doc.createElement('h3');
  heading.textContent = 'Device details';
  element.append(heading);
  const fields = new Map();
  const descriptions = doc.createElement('dl');
  for (const [id, label] of [
    ['name', 'Device'],
    ['compatibility', 'Support'],
    ['progress', 'Connection'],
    ['lastAction', 'Last action'],
    ['outcome', 'Result'],
    ['physical', 'Physical check'],
  ]) {
    const wrapper = doc.createElement('div');
    const term = doc.createElement('dt');
    const value = doc.createElement('dd');
    term.textContent = label;
    value.dataset.detailField = id;
    fields.set(id, value);
    wrapper.append(term, value);
    descriptions.append(wrapper);
  }
  const guidance = doc.createElement('p');
  guidance.className = 'device-detail-guidance';
  guidance.dataset.detailGuidance = '';
  element.append(descriptions, guidance);
  const anchor = parent.querySelector('.state-heading, .connection-display');
  if (anchor) anchor.after(element);
  else parent.prepend(element);
  return (model) => {
    for (const [field, value] of fields) value.textContent = model[field];
    guidance.textContent = model.happened + ' ' + model.next;
  };
}
