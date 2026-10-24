import {
  PocketIRSession,
  validatePocketConfig,
  validatePocketSlot,
} from './lib/pocket-ir.js';

const $ = (id) => document.getElementById(id);
const savedThisSession = new Set();
let acting = false;
let eventCount = 0;

function record(message) {
  const list = $('events');
  if (!eventCount) list.replaceChildren();
  const entry = document.createElement('li');
  entry.textContent = new Date().toLocaleTimeString() + ' — ' + String(message).slice(0, 180);
  list.prepend(entry);
  eventCount += 1;
  if (list.children.length > 30) list.lastElementChild.remove();
}

const session = new PocketIRSession({
  bluetooth: navigator.bluetooth,
  onState: (message) => {
    $('connection').textContent = message;
    if (!session.connected) savedThisSession.clear();
    record(message);
    render();
  },
  onStatus: (status) => {
    record(status.message);
    if (status.type === 'saved' && session.connected)
      savedThisSession.add(status.slot);
    render();
  },
});

function chosenSlot() {
  return validatePocketSlot(Number($('slot').value));
}

function render() {
  const authorized = $('owner-check').checked;
  const connected = session.connected;
  const free = !acting && !session.busy;
  $('connect').disabled = !authorized || connected || !free;
  $('disconnect').disabled = !connected && !session.busy;
  $('configure').disabled = !authorized || !connected || !free;
  const stored = savedThisSession.has(Number($('slot').value));
  $('transmit').disabled = !authorized || !connected || !free || !stored;
  $('slot-status').textContent = stored
    ? 'Slot ' + $('slot').value + ' was acknowledged as stored in this connection. One manual test is available.'
    : 'No stored acknowledgment for slot ' + $('slot').value +
      ' in this connection. Configure and wait for the bridge before transmitting.';
}

async function perform(operation) {
  if (acting) return;
  acting = true;
  render();
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    $('connection').textContent = message;
    record('Action failed: ' + message);
  } finally {
    acting = false;
    render();
  }
}

$('connect').addEventListener('click', () => perform(async () => {
  if (!$('owner-check').checked) return;
  savedThisSession.clear();
  await session.connect();
}));

$('disconnect').addEventListener('click', () => {
  session.disconnect();
  savedThisSession.clear();
  render();
});

$('configure').addEventListener('click', () => perform(async () => {
  if (!$('owner-check').checked || !session.connected) return;
  const config = validatePocketConfig({
    slot: chosenSlot(),
    proto: $('proto').value,
    code: $('code').value.trim(),
    bits: Number($('bits').value),
  });
  // Previously stored code for this slot may now be changing. Require a fresh ack.
  savedThisSession.delete(config.slot);
  render();
  await session.configure(config);
}));

$('transmit').addEventListener('click', () => perform(async () => {
  const slot = chosenSlot();
  if (!$('owner-check').checked || !savedThisSession.has(slot) || !session.connected) return;
  await session.transmit(slot);
}));

$('slot').addEventListener('change', render);
$('owner-check').addEventListener('change', render);
$('clear-events').addEventListener('click', () => {
  eventCount = 0;
  const entry = document.createElement('li');
  entry.textContent = 'Log cleared. No events are retained.';
  $('events').replaceChildren(entry);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (session.connected || session.busy))
    session.disconnect('Page hidden: bridge connection closed.');
});
window.addEventListener('pagehide', () => {
  if (session.connected || session.busy) session.disconnect('Page closed.');
});
render();
