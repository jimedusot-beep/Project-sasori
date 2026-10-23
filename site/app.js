import { BluetoothTransport } from './lib/bluetooth.js';
import { SimulationTransport } from './lib/simulation.js';
import { AuthExperiment } from './lib/auth.js';
import { analyzeElmoNotification } from './elmo-packets.mjs';
import {
  PROFILES,
  ELMO_SERVICE,
  ELMO_NOTIFY,
  ELMO_NOTIFY_PROBES,
  GATT_REGISTRY,
  normalizeUUID,
} from './lib/profiles.js';
import { CAPABILITIES, validateCommand, virtualPosition } from './lib/safety.js';
import { Diagnostics, explainError } from './lib/diagnostics.js';
import { ResearchStore } from './lib/storage.js';
import { mountDiscovery } from './discovery-ui.js';
import { mountDeviceHub } from './device-hub.js';
import { createNativeBluetooth } from './lib/native-bluetooth.js';
import { bluetoothSupport, makeInspection, identityOf } from './lib/devices.js';
import { connectionResult } from './lib/connection-result.js';
import { DEVICE_INFORMATION_SERVICE, DEVICE_INFORMATION_SOURCE } from './lib/device-information.js';
import {
  createToy,
  validateToy,
  exportToys,
  parseToys,
  asDeviceProfile,
  MAX_TOY_FILE_BYTES,
} from './lib/toys.js';
import {
  createSession,
  portableRecord,
  parseImport,
  serializeBackup,
  compareSessions,
  sessionText,
  reviseNotes,
  MAX_FILE_BYTES,
} from './lib/records.js';

const $ = (id) => document.getElementById(id);
const node = (tag, text, className = '') => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};
const labels = {
  overview: 'Overview',
  protocol: 'Protocol explorer',
  toys: 'Devices',
  discovery: 'Discovery workbench',
  sessions: 'Research records',
  controls: 'Control laboratory',
  research: 'Evidence & guides',
};
function analyzeOfflinePacket() {
  try {
    $('packet-result').textContent = JSON.stringify(
      analyzeElmoNotification($('packet-hex').value),
      null,
      2,
    );
  } catch (error) {
    $('packet-result').textContent = 'Cannot decode: ' + error.message;
  }
}
$('packet-decode').addEventListener('click', analyzeOfflinePacket);
$('packet-sample').addEventListener('click', () => {
  $('packet-hex').value = '604e65774d6f64654964783a313200';
  analyzeOfflinePacket();
});
const store = new ResearchStore();
let diagnostics = new Diagnostics(),
  session = null,
  transport = null,
  running = false,
  ready = false;
let records = [],
  selectedId = null,
  noteSavePending = false,
  deleteArmed = null,
  deleteTimer,
  settingsTimer,
  sequenceTimer,
  sequenceDeadline,
  audioContext;
let settings = {};
let toys = [],
  editingToyId = null;
let deviceHub = null,
  deviceLabel = '';
const nativePlugin = globalThis.SasoriNativeBluetooth;
const nativeBluetooth = nativePlugin ? createNativeBluetooth(nativePlugin) : null;
const currentBluetooth = () => nativeBluetooth || navigator.bluetooth;
const connectionSecure = () => !!nativeBluetooth || window.isSecureContext;
const supportState = () =>
  bluetoothSupport({
    secure: connectionSecure(),
    bluetooth: currentBluetooth(),
    native: !!nativeBluetooth,
  });
const refreshHub = () => deviceHub?.render();
const allProfiles = () => [...PROFILES, ...toys.map(asDeviceProfile)];
const currentProfile = () => allProfiles().find((p) => p.id === $('profile').value) || PROFILES[0];
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
}
function log(level, message, details = {}) {
  const event = diagnostics.add(level, message, details);
  if (session) {
    session.events.push(event);
    if (session.events.length > 400) session.events.shift();
  }
  $('log').textContent = diagnostics.text();
  $('raw-log').textContent = JSON.stringify(diagnostics.events, null, 2);
  $('log').scrollTop = $('log').scrollHeight;
}
function problem(error) {
  const explanation = explainError(error);
  notice(explanation.message + ' ' + explanation.nextStep);
  log('error', explanation.message);
}
function safe(action) {
  return (event) => {
    try {
      Promise.resolve(action(event)).catch(problem);
    } catch (error) {
      problem(error);
    }
  };
}
function navigate(page) {
  if (!labels[page]) page = 'overview';
  document.querySelectorAll('.page').forEach((el) => {
    el.hidden = el.id !== 'page-' + page;
  });
  document.querySelectorAll('[data-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page === page) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('breadcrumb').textContent = labels[page];
  history.replaceState(null, '', '#' + page);
  window.scrollTo(0, 0);
  if (page === 'sessions') refreshRecords().catch(problem);
}
document
  .querySelectorAll('[data-page], [data-go]')
  .forEach((el) => el.addEventListener('click', () => navigate(el.dataset.page || el.dataset.go)));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

function renderProfileOptions(selected = $('profile').value) {
  $('profile').replaceChildren();
  const templates = node('optgroup', '');
  templates.label = 'Research templates · simulation only';
  for (const profile of allProfiles()) {
    const option = node('option', (profile.custom ? 'My toy' : profile.id) + ' / ' + profile.label);
    option.value = profile.id;
    if (profile.service || profile.custom) $('profile').append(option);
    else templates.append(option);
  }
  $('profile').append(templates);
  $('profile').value = allProfiles().some((p) => p.id === selected) ? selected : '001';
}
renderProfileOptions();
function applyProfile() {
  const profile = currentProfile();
  $('svc').value = profile.service || '';
  // First-time Elmo setup starts with metadata, without subscribing to a hypothesis.
  $('notify').value = profile.id === '001' ? '' : profile.notify || '';
  $('name-prefix').value = profile.custom ? profile.namePrefix : profile.id === '001' ? 'Elmo' : '';
  $('consent').checked = false;
  $('show-all-devices').checked = false;
  syncProbeSelection();
  updateMode();
}
for (const probe of ELMO_NOTIFY_PROBES) {
  const option = node('option', probe.label);
  option.value = probe.id;
  $('notify-preset').append(option);
}
const customProbe = node('option', 'Custom UUID (manual research)');
customProbe.value = 'custom';
$('notify-preset').append(customProbe);
function syncProbeSelection() {
  const uuid = $('notify').value.trim().toLowerCase();
  const matching = ELMO_NOTIFY_PROBES.find((probe) => probe.uuid === uuid);
  $('notify-preset').value = matching?.id || 'custom';
  $('connection-task').value =
    $('svc').value.trim().toLowerCase() === DEVICE_INFORMATION_SERVICE
      ? 'identify'
      : uuid
        ? 'capture'
        : 'metadata';
}
$('connection-task').addEventListener('change', () => {
  const task = $('connection-task').value;
  const profile = currentProfile();
  const previousNotify = $('svc').value === profile.service ? $('notify').value : '';
  $('svc').value = task === 'identify' ? DEVICE_INFORMATION_SERVICE : profile.service || '';
  $('notify').value = task === 'capture' ? previousNotify || profile.notify || '' : '';
  $('consent').checked = false;
  syncProbeSelection();
  $('connection-task').value = task;
  if (task === 'capture' && !$('notify').value) {
    $('uuid-settings').open = true;
    notice(
      'Choose an observed notification channel after a metadata inspection, or enter its sourced UUID.',
    );
  }
  updateMode();
  saveSettings();
});
for (const [id, profileId] of [
  ['quick-elmo', '001'],
  ['quick-identify', 'identify'],
])
  $(id).addEventListener('click', () => {
    if (!ready || running) return;
    $('profile').value = profileId;
    $('simulation').checked = false;
    applyProfile();
    saveSettings();
    $('connection-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
    $(profileId === 'identify' ? 'name-prefix' : 'consent').focus({ preventScroll: true });
    notice(
      profileId === 'identify'
        ? 'Enter the toy’s Bluetooth name, or enable Show all Bluetooth devices. Sasori will read available model / revision fields.'
        : 'Elmo connection details selected. Power it on, close its other app, confirm ownership, and connect.',
    );
  });
$('notify-preset').addEventListener('change', () => {
  const probe = ELMO_NOTIFY_PROBES.find((entry) => entry.id === $('notify-preset').value);
  if (!probe) {
    $('uuid-settings').open = true;
    notice('Enter a sourced characteristic UUID manually; no inspection starts automatically.');
    return;
  }
  $('notify').value = probe.uuid;
  syncProbeSelection();
  updateMode();
  saveSettings();
  if (probe.id === 'metadata') {
    notice('Metadata-only inspection selected. No characteristic subscription will occur.');
  } else {
    notice(
      `Candidate ${probe.id} notification probe selected. The next manual inspection will subscribe only to this characteristic; no application commands will be sent.`,
    );
  }
});
function updateMode() {
  const simulated = $('simulation').checked;
  $('mode-badge').textContent = simulated ? 'SIMULATION · NO HARDWARE' : 'LIVE · INSPECTION ONLY';
  $('mode-badge').classList.toggle('warm', simulated);
  $('simulation-config').hidden = !simulated;
  $('live-config').hidden = simulated;
  $('connect').textContent = simulated ? 'Run simulated inspection ↗' : 'Connect & inspect ↗';
  $('support').textContent = simulated
    ? 'Synthetic fixtures only. Bluetooth permissions and hardware are never accessed.'
    : supportState().detail;
  $('hub-browser-help').hidden = simulated;
  const profile = currentProfile();
  $('device-title').textContent = profile.label;
  $('profile-status').textContent = profile.status;
  $('connect').disabled =
    !ready ||
    running ||
    (!simulated &&
      (!currentBluetooth()?.requestDevice ||
        !connectionSecure() ||
        (!profile.service && !profile.custom)));
  $('load-profile').disabled = profile.id !== '001' || running;
  $('keep-setup').disabled = !ready || running;
  for (const id of ['quick-elmo', 'quick-identify', 'connection-task'])
    $(id).disabled = !ready || running;
  const task = $('connection-task').value;
  $('connection-task').querySelector('[value="capture"]').disabled = profile.id === 'identify';
  $('connection-task-hint').textContent =
    task === 'identify'
      ? 'Reads available manufacturer, model, hardware, firmware, and software strings. No UUID entry needed; not every toy exposes them.'
      : task === 'capture'
        ? 'Listen to one notification channel for 15 seconds. You can choose channels found in your previous inspection.'
        : 'Find this service and its connection channels first. No notification subscription.';
  $('elmo-probe-settings').hidden = profile.id !== '001' || task !== 'capture';
  $('toy-source').hidden = !profile.custom;
  $('toy-source').textContent = profile.custom
    ? 'UUID source (user supplied): ' + profile.sourceNote
    : '';
  $('specimen-name').textContent = profile.label;
  $('specimen-model').textContent = profile.id === '001' ? 'HASBRO · B6572' : 'INSPECTION PROFILE';
  $('specimen-number').textContent = profile.custom ? 'MY TOY' : profile.id;
  $('active-experiment').textContent =
    'PROJECT SASORI / ' + (profile.custom ? profile.label : 'EXPERIMENT ' + profile.id);
  document.querySelector('.specimen-art').hidden = profile.id !== '001';
  $('toy-save').disabled = !ready || running;
  $('toy-import').disabled = !ready || running;
  $('toy-list')
    .querySelectorAll('button')
    .forEach((button) => {
      button.disabled = running;
    });
  $('toy-list')
    .querySelectorAll('[data-device-state]')
    .forEach((badge) => {
      badge.textContent =
        running && session?.profileId === badge.dataset.deviceState
          ? 'Active inspection'
          : 'Not connected';
    });
  document.body.classList.toggle('engineering', $('engineering').checked);
  if (!$('engineering').checked) $('include-payloads').checked = false;
  syncRecordActions();
  refreshHub();
}
function saveSettings(immediate = false) {
  clearTimeout(settingsTimer);
  const persist = () => {
    settings = {
      schemaVersion: 1,
      profile: $('profile').value,
      service: $('svc').value,
      notify: $('notify').value,
      namePrefix: $('name-prefix').value,
      engineering: $('engineering').checked,
    };
    store.setSettings(settings).catch(problem);
  };
  if (immediate === true) persist();
  else settingsTimer = setTimeout(persist, 250);
}
for (const id of ['simulation', 'profile', 'engineering'])
  $(id).addEventListener('change', () => {
    if (id !== 'engineering') $('consent').checked = false;
    if (id === 'profile') applyProfile();
    updateMode();
    saveSettings();
  });
$('svc').addEventListener('input', () => {
  syncProbeSelection();
  updateMode();
  saveSettings();
});
$('name-prefix').addEventListener('input', saveSettings);
$('notify').addEventListener('input', () => {
  syncProbeSelection();
  updateMode();
  saveSettings();
});
$('load-profile').addEventListener('click', () => {
  $('svc').value = ELMO_SERVICE;
  $('notify').value = ELMO_NOTIFY;
  $('name-prefix').value = 'Elmo';
  syncProbeSelection();
  updateMode();
  saveSettings();
  notice(
    'Published Elmo profile loaded from NonaSuomy/Love2LearnElmo. Its UUIDs are community-reported; a live inspection will establish whether they exist on your unit. No connection has been started.',
  );
});
function lockConnection(locked) {
  running = locked;
  for (const id of [
    'profile',
    'connection-task',
    'simulation',
    'svc',
    'notify',
    'notify-preset',
    'consent',
    'simulation-scenario',
    'show-all-devices',
    'name-prefix',
  ])
    $(id).disabled = locked;
  $('disconnect').disabled = !locked;
  $('global-stop').disabled = !locked;
  updateMode();
  if (session) renderServices(session.services);
}
function renderServices(services) {
  const target = $('service-map');
  target.replaceChildren();
  target.classList.remove('empty');
  if (!services.length) {
    target.textContent = 'No service metadata captured.';
    return;
  }
  for (const s of services) {
    const wrapper = node('div', '', 'gatt-service');
    wrapper.append(node('code', s.uuid), node('p', s.evidence));
    for (const c of s.characteristics) {
      const characteristic = node('div', '', 'gatt-characteristic');
      characteristic.append(
        node('code', c.uuid),
        node('p', c.properties.join(' · ') + ' / no writes enabled'),
      );
      if (
        s.evidence === 'observed-this-session' &&
        c.evidence === 'observed-this-session' &&
        c.properties.some((p) => ['notify', 'indicate'].includes(p))
      ) {
        const choose = node('button', 'Use for next inspection', 'text-button');
        choose.disabled = running;
        choose.addEventListener('click', () => prepareEndpoint(s.uuid, c.uuid));
        characteristic.append(choose);
      }
      wrapper.append(characteristic);
    }
    target.append(wrapper);
  }
}
function prepareEndpoint(service, uuid) {
  if (running) return;
  $('svc').value = service;
  $('notify').value = uuid;
  $('consent').checked = false;
  syncProbeSelection();
  updateMode();
  saveSettings();
  navigate('overview');
  notice(
    'Observed channel selected. Confirm ownership and reconnect to capture it. Save the setup to reuse this channel.',
  );
}
function renderPackets() {
  const target = $('packets');
  target.replaceChildren();
  target.classList.remove('empty');
  const filter = $('packet-filter').value.toLowerCase();
  const packets = (session?.packets || [])
    .filter((p) =>
      [p.text, p.hex, p.characteristic, p.kind].join(' ').toLowerCase().includes(filter),
    )
    .slice(-100)
    .reverse();
  if (!packets.length) {
    target.append(node('p', 'No matching notifications.'));
    return;
  }
  for (const p of packets) {
    const row = node('article', '', 'packet');
    row.append(
      node(
        'small',
        (session.source === 'simulated' ? 'SYNTHETIC · ' : 'LIVE OBSERVATION · ') +
          p.timestamp +
          ' · ' +
          p.length +
          ' bytes',
      ),
    );
    row.append(
      node('span', p.text, 'payload'),
      node('code', p.hex),
      node('p', p.characteristic),
      node('p', p.description),
    );
    if (p.truncated || p.malformed)
      row.append(
        node(
          'p',
          'Flag: ' +
            (p.truncated ? 'payload truncated; ' : '') +
            (p.malformed ? 'malformed / non-UTF-8' : ''),
        ),
      );
    target.append(row);
  }
}
$('packet-filter').addEventListener('input', renderPackets);
function handleEvent(event) {
  if (!session) return;
  if (event.type === 'device') {
    deviceLabel = event.label;
  } else if (event.type === 'stage') {
    $('inspection-stage').textContent =
      'Stage: ' + event.stage + ' · ' + event.elapsedMs + ' ms elapsed';
    log('stage', event.stage + ' at ' + event.elapsedMs + ' ms');
  } else if (event.type === 'state') {
    $('state').textContent = event.state[0].toUpperCase() + event.state.slice(1);
    $('state-detail').textContent =
      event.reason ||
      (session.source === 'simulated'
        ? 'Synthetic Bluetooth lifecycle'
        : 'No application commands sent');
    log(
      'state',
      (session.source === 'simulated' ? 'SIMULATED · ' : 'LIVE · ') +
        event.state +
        (event.reason ? ' / ' + event.reason : ''),
    );
    if (event.state === 'inspecting') saveSession(false).catch(problem);
    if (event.state === 'disconnected') {
      if (session.inspection) session.inspection.gattDurationMs = event.gattDurationMs || 0;
      session.endedAt = new Date().toISOString();
      session.outcome = event.reason || 'disconnected';
      if (
        !session.stats.packets &&
        session.inspection?.notify &&
        event.reason === 'inspection-complete'
      )
        session.outcome = 'inconclusive-no-notifications';
      lockConnection(false);
      $('next-step').textContent = connectionResult(session).next;
      saveSession(false).catch(problem);
    }
  } else if (event.type === 'packet') {
    session.packets.push(event.packet);
    if (session.packets.length > 500) session.packets.shift();
    session.stats.packets++;
    session.stats.bytes += event.packet.length;
    if (event.packet.malformed) session.stats.malformed++;
    if (event.packet.truncated) session.stats.truncated++;
    $('packet-count').textContent = session.stats.packets + ' RX';
    $('packet-bytes').textContent = session.stats.bytes + ' bytes received';
    log(
      'rx',
      event.packet.length +
        ' bytes · ' +
        event.packet.kind +
        (event.packet.malformed ? ' · malformed' : ''),
    );
    renderPackets();
    if (session.stats.packets % 10 === 0) saveSession(false).catch(problem);
  } else if (event.type === 'device-information') {
    session.deviceInformation = event.information;
    // Model strings are device-reported observations; declared identity is unchanged.
  } else if (event.type === 'services') {
    session.services = event.services;
    renderServices(event.services);
    $('gatt-evidence').textContent =
      session.source === 'simulated' ? 'SYNTHETIC' : 'OBSERVED THIS SESSION';
    log('info', 'Service metadata captured; writable properties do not establish command safety.');
  } else if (event.type === 'error') {
    session.outcome = 'error';
    notice(event.error.message + ' ' + event.error.nextStep);
    log(
      'error',
      (event.error.stage ? event.error.stage + ': ' : '') + event.error.message,
      event.error,
    );
  } else log(event.type, event.message || 'Transport event');
  refreshHub();
}
$('connect').addEventListener(
  'click',
  safe(() => {
    if (!ready || running) return;
    const simulated = $('simulation').checked;
    const profile = currentProfile();
    if (!simulated) {
      if (!$('consent').checked)
        throw new Error('Confirm that you own or are authorized to inspect this device.');
      normalizeUUID($('svc').value);
      if ($('notify').value.trim()) normalizeUUID($('notify').value);
      if ($('connection-task').value === 'capture' && !$('notify').value.trim())
        throw new Error('Choose an observed notification channel or enter its sourced UUID first.');
    }
    diagnostics = new Diagnostics();
    session = createSession(simulated ? 'simulated' : 'live', $('profile').value);
    deviceLabel = '';
    if (profile.service || $('svc').value.trim())
      session.inspection = makeInspection(
        profile,
        $('svc').value,
        $('notify').value.trim(),
        simulated ? 'simulation' : nativeBluetooth ? 'core-bluetooth' : 'web-bluetooth',
      );
    session.title = (
      profile.label + (simulated ? ' · simulated inspection' : ' · inspection')
    ).slice(0, 180);
    $('session-title').value = session.title;
    $('session-source').textContent = simulated ? 'SIMULATED SESSION' : 'LIVE INSPECTION';
    $('include-payloads').checked = false;
    $('inspection-stage').textContent = simulated
      ? 'Simulation active; no Bluetooth connection'
      : 'Stage: preparing manual inspection of ' + profile.label;
    $('packet-count').textContent = '0 RX';
    $('packet-bytes').textContent = '0 bytes received';
    $('notice').hidden = true;
    $('gatt-evidence').textContent = 'NO CAPTURE';
    renderServices([]);
    renderPackets();
    for (const id of ['save-session', 'export-json', 'export-text']) $(id).disabled = false;
    lockConnection(true);
    log(
      'info',
      simulated
        ? 'Synthetic fixture started. No Bluetooth access.'
        : 'Inspection only. No authentication, motor, audio, or firmware commands.',
    );
    if (!simulated)
      log('info', 'Configured inspection profile: ' + profile.label, {
        service: $('svc').value.trim().toLowerCase(),
        notify: $('notify').value.trim().toLowerCase() || 'none',
        preset: $('notify-preset').value,
      });
    transport = simulated
      ? new SimulationTransport(handleEvent)
      : new BluetoothTransport({ emit: handleEvent, bluetooth: currentBluetooth() });
    saveSettings(true);
    const result = simulated
      ? transport.connect({ scenario: $('simulation-scenario').value })
      : transport.connect({
          service: $('svc').value,
          notify: $('notify').value.trim(),
          durationMs: 15000,
          showAllDevices: $('show-all-devices').checked,
          namePrefix: $('name-prefix').value,
        });
    return Promise.resolve(result).catch((error) => {
      lockConnection(false);
      session.endedAt = new Date().toISOString();
      session.outcome = 'setup-error';
      problem(error);
      return saveSession(false);
    });
  }),
);
for (const id of ['disconnect', 'global-stop'])
  $(id).addEventListener('click', () => transport?.disconnect('user'));
$('session-title').addEventListener('input', () => {
  if (session) session.title = $('session-title').value || 'Untitled experiment';
});
async function saveSession(show = true) {
  if (!session) return;
  const snapshot = portableRecord(session, $('include-payloads').checked);
  await store.save(snapshot);
  $('autosave-status').textContent =
    (store.persistent ? 'Saved on this browser · ' : 'Temporary memory only · ') +
    snapshot.stats.packets +
    ' notifications · ' +
    (snapshot.payloadsIncluded
      ? 'RAW PAYLOADS INCLUDED. Review before sharing.'
      : 'Payload bytes omitted.');
  if (show)
    notice(
      store.persistent
        ? 'Session saved locally. It is not synchronized across devices.'
        : store.warning,
    );
  await refreshRecords();
}
$('save-session').addEventListener(
  'click',
  safe(() => saveSession()),
);
function download(name, body, type) {
  if (nativePlugin?.shareFile) return nativePlugin.shareFile({ name, text: body }).catch(problem);
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function requireToyEditing() {
  if (!ready || running)
    throw new Error('Wait for storage and stop the inspection before changing device profiles.');
}
function editToy(toy = null) {
  editingToyId = toy?.id || null;
  $('toy-name').value = toy?.label || '';
  $('toy-model').value = toy?.model || '';
  $('toy-revision').value = toy?.revision || 'unknown';
  $('toy-firmware').value = toy?.firmware || 'unknown';
  $('toy-prefix').value = toy?.namePrefix || '';
  $('toy-service').value = toy?.service || '';
  $('toy-notify').value = toy?.notify || '';
  $('toy-source-note').value = toy?.sourceNote || '';
  $('toy-form-title').textContent = toy ? 'Edit device profile' : 'Add a device';
}
function renderToys() {
  $('toy-list').replaceChildren();
  $('toy-export').disabled = toys.length === 0;
  $('toy-storage-summary').textContent =
    (store.persistent ? 'Saved on this browser' : 'Temporary memory only; export before closing') +
    ' · ' +
    toys.length +
    ' / 20 device profiles';
  if (!toys.length)
    $('toy-list').append(
      node(
        'p',
        'Your saved device profiles will appear here. The built-in Elmo profile remains in the connection manager.',
      ),
    );
  for (const toy of toys) {
    const card = node('article', '', 'toy-profile');
    card.append(
      node('h3', toy.label),
      node(
        'p',
        toy.namePrefix
          ? 'Bluetooth name starts with: ' + toy.namePrefix
          : 'Name unknown · Show all devices required',
      ),
      node('code', toy.service),
      node(
        'p',
        toy.notify ? 'Notification endpoint configured' : 'Metadata only · no subscription',
      ),
      node('p', 'User-supplied source: ' + toy.sourceNote, 'hint'),
    );
    const identity = identityOf(toy);
    card.append(
      node(
        'p',
        identity.model + ' · board ' + identity.revision + ' · firmware ' + identity.firmware,
      ),
    );
    const stateBadge = node(
      'p',
      running && session?.profileId === toy.id ? 'Active inspection' : 'Not connected',
      'badge subtle',
    );
    stateBadge.dataset.deviceState = toy.id;
    card.append(stateBadge);
    const actions = node('div', '', 'actions');
    const load = node('button', 'Load for inspection', 'secondary');
    load.addEventListener(
      'click',
      safe(() => {
        requireToyEditing();
        $('profile').value = toy.id;
        applyProfile();
        $('uuid-settings').open = false;
        saveSettings();
        navigate('overview');
        notice('Device setup loaded. Confirm ownership, then tap Connect & inspect.');
      }),
    );
    const edit = node('button', 'Edit', 'text-button');
    edit.addEventListener(
      'click',
      safe(() => {
        requireToyEditing();
        editToy(toy);
      }),
    );
    const remove = node('button', 'Delete profile', 'text-button');
    let armed = false;
    remove.addEventListener(
      'click',
      safe(async () => {
        requireToyEditing();
        if (!armed) {
          armed = true;
          remove.textContent = 'Confirm profile deletion';
          setTimeout(() => {
            armed = false;
            remove.textContent = 'Delete profile';
          }, 5000);
          return;
        }
        const selected = $('profile').value === toy.id;
        await store.removeToy(toy.id);
        toys = await store.listToys();
        renderProfileOptions();
        if (selected) applyProfile();
        if (editingToyId === toy.id) editToy();
        renderToys();
        saveSettings();
        notice('Toy profile deleted. Its saved inspection sessions were preserved.');
      }),
    );
    for (const button of [load, edit, remove]) button.disabled = running;
    actions.append(load, edit, remove);
    card.append(actions);
    $('toy-list').append(card);
  }
}
$('toy-new').addEventListener('click', () => editToy());
$('toy-form').addEventListener(
  'submit',
  safe(async (event) => {
    event.preventDefault();
    requireToyEditing();
    const fields = {
      label: $('toy-name').value,
      model: $('toy-model').value.trim() || $('toy-name').value,
      revision: $('toy-revision').value.trim() || 'unknown',
      firmware: $('toy-firmware').value.trim() || 'unknown',
      namePrefix: $('toy-prefix').value,
      service: $('toy-service').value,
      notify: $('toy-notify').value.trim(),
      sourceNote: $('toy-source-note').value,
    };
    const toy = editingToyId
      ? validateToy({ ...fields, format: 'sasori.toy', schemaVersion: 1, id: editingToyId })
      : createToy(fields);
    await store.saveToys([toy]);
    toys = await store.listToys();
    renderProfileOptions();
    if ($('profile').value === toy.id) {
      applyProfile();
      saveSettings();
    }
    editToy(toy);
    renderToys();
    notice(
      store.persistent
        ? 'Device profile saved on this browser. Choose Load for inspection when ready.'
        : store.warning,
    );
  }),
);
function prepareSavedDevice(record = null) {
  requireToyEditing();
  const profile = currentProfile();
  editToy(profile.custom ? profile : null);
  $('toy-name').value = profile.id === 'identify' ? 'My Bluetooth toy' : profile.label;
  const sourceRecord = record || (session?.profileId === profile.id ? session : null);
  const info =
    sourceRecord?.source === 'live' && !sourceRecord.importedAt
      ? sourceRecord.deviceInformation
      : null;
  $('toy-model').value =
    profile.model || (profile.id === 'identify' ? info?.model : null) || profile.label;
  $('toy-revision').value =
    (profile.revision !== 'unknown' && profile.revision) ||
    info?.hardware?.slice(0, 60) ||
    'unknown';
  $('toy-firmware').value =
    (profile.firmware !== 'unknown' && profile.firmware) ||
    info?.firmware?.slice(0, 60) ||
    'unknown';
  $('toy-prefix').value = $('name-prefix').value;
  const identifying = record?.inspection?.service === DEVICE_INFORMATION_SERVICE;
  const currentObserved = record?.services.some(
    (s) =>
      s.evidence === 'observed-this-session' &&
      s.uuid === $('svc').value &&
      (!$('notify').value ||
        s.characteristics.some(
          (c) => c.evidence === 'observed-this-session' && c.uuid === $('notify').value,
        )),
  );
  $('toy-service').value = currentObserved
    ? $('svc').value
    : identifying && profile.id !== 'identify'
      ? profile.service
      : record?.inspection?.service || $('svc').value;
  $('toy-notify').value = currentObserved
    ? $('notify').value
    : identifying
      ? ''
      : (record?.inspection?.notify ?? $('notify').value);
  const service = $('toy-service').value.trim().toLowerCase();
  const notify = $('toy-notify').value.trim().toLowerCase();
  const observedRecord = record || (session?.profileId === profile.id ? session : null);
  const observed =
    observedRecord?.source === 'live' &&
    !observedRecord.importedAt &&
    observedRecord.services.some(
      (s) =>
        s.evidence === 'observed-this-session' &&
        s.uuid === service &&
        (!notify ||
          s.characteristics.some(
            (c) => c.evidence === 'observed-this-session' && c.uuid === notify,
          )),
    );
  $('toy-source-note').value = observed
    ? 'Observed in Sasori session ' +
      observedRecord.id +
      ' at ' +
      observedRecord.startedAt +
      '; model / revision strings are device-reported, not independent verification.'
    : service === DEVICE_INFORMATION_SERVICE
      ? DEVICE_INFORMATION_SOURCE
      : service === profile.service && (!notify || notify === profile.notify)
        ? profile.custom
          ? profile.sourceNote
          : profile.source || ''
        : '';
  navigate('toys');
}
$('keep-setup').addEventListener(
  'click',
  safe(() => prepareSavedDevice()),
);
$('toy-export').addEventListener(
  'click',
  safe(() =>
    download('sasori-toys.json', JSON.stringify(exportToys(toys), null, 2), 'application/json'),
  ),
);
$('toy-import').addEventListener(
  'change',
  safe(async () => {
    const input = $('toy-import');
    try {
      requireToyEditing();
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_TOY_FILE_BYTES) throw new Error('Device profile import limit is 128 KB.');
      const copies = parseToys(await file.text()).map(createToy);
      await store.saveToys(copies);
      toys = await store.listToys();
      renderProfileOptions();
      renderToys();
      notice(
        'Imported ' +
          copies.length +
          ' device profiles as new copies. Review their source notes before inspection.',
      );
    } finally {
      input.value = '';
    }
  }),
);
$('copy').addEventListener(
  'click',
  safe(async () => {
    try {
      await navigator.clipboard.writeText(diagnostics.text());
      notice('Sanitized diagnostic log copied. Raw packet payloads are omitted.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('log'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      notice('Clipboard access unavailable. The log is selected; use Copy in the browser menu.');
    }
  }),
);
$('export-json').addEventListener(
  'click',
  safe(() => {
    if (session)
      download(
        'sasori-session.json',
        JSON.stringify(portableRecord(session, $('include-payloads').checked), null, 2),
        'application/json',
      );
  }),
);
$('export-text').addEventListener(
  'click',
  safe(() => {
    if (session) download('sasori-report.txt', sessionText(session), 'text/plain');
  }),
);
async function refreshRecords() {
  records = await store.list();
  $('backup').disabled = !records.length;
  $('record-count').textContent = records.length;
  $('storage-state').textContent = store.persistent
    ? 'IndexedDB · ' + records.length + ' records'
    : 'Temporary memory only';
  $('storage-summary').textContent =
    (store.persistent ? 'IndexedDB available. ' : 'TEMPORARY MEMORY. ') +
    records.length +
    ' / 50 records · 8 MB application budget.' +
    (store.corrupt.length
      ? ' ' +
        store.corrupt.length +
        ' corrupt records skipped. Export valid records before clearing browser storage.'
      : '');
  $('recover-corrupt').hidden = !store.corrupt.length;
  renderRecords();
  syncRecordActions();
  updateComparisonOptions();
  refreshHub();
}
function renderRecords() {
  $('records').replaceChildren();
  const query = $('record-search').value.toLowerCase();
  const filtered = records.filter((r) =>
    [r.title, r.notes, r.outcome, r.source].join(' ').toLowerCase().includes(query),
  );
  if (!filtered.length)
    $('records').append(
      node(
        'p',
        records.length
          ? 'No matching research records.'
          : 'Your notebook is ready. Run a simulation or create your first note.',
        'empty',
      ),
    );
  for (const r of filtered) {
    const button = node('button', '', 'record-row' + (r.id === selectedId ? ' selected' : ''));
    button.append(
      node(
        'span',
        (r.importedAt ? 'IMPORTED / ' : '') + r.source.toUpperCase(),
        'badge ' + (r.source === 'simulated' ? 'warm' : 'subtle'),
      ),
      node('h3', r.title),
      node('p', new Date(r.startedAt).toLocaleString()),
      node('p', r.stats.packets + ' notifications · ' + r.outcome),
    );
    button.addEventListener('click', () => selectRecord(r.id));
    $('records').append(button);
  }
}
function selectRecord(id) {
  const r = records.find((item) => item.id === id);
  selectedId = r?.id || null;
  deleteArmed = null;
  $('delete-record').textContent = 'Delete record';
  for (const key of [
    'record-title',
    'record-notes',
    'update-record',
    'export-record',
    'delete-record',
  ])
    $(key).disabled = !r;
  $('record-title').value = r?.title || '';
  $('record-notes').value = r?.notes || '';
  $('record-meta').textContent = r
    ? (r.importedAt ? 'IMPORTED CLAIM / ' : '') +
      r.source.toUpperCase() +
      ' · ' +
      r.outcome +
      ' · ' +
      r.stats.packets +
      ' notifications · schema v' +
      r.schemaVersion
    : 'Select a record to inspect or edit its notes.';
  $('record-history').replaceChildren();
  for (const revision of r?.noteHistory || []) {
    const details = node('details', '');
    details.append(
      node(
        'summary',
        revision.title + ' · saved before ' + new Date(revision.savedAt).toLocaleString(),
      ),
      node('p', revision.notes),
    );
    $('record-history').append(details);
  }
  renderRecords();
  syncRecordActions();
}
function syncRecordActions() {
  const active = running && session?.id === selectedId;
  const selected = records.some((r) => r.id === selectedId);
  for (const id of ['record-title', 'record-notes', 'update-record'])
    $(id).disabled = !selected || noteSavePending;
  $('delete-record').disabled = !selected || active || noteSavePending;
  $('record-delete-help').textContent = active
    ? 'Stop the active inspection before deleting its record.'
    : 'Deletion requires a second click. Export a backup first if this record matters.';
}
$('record-search').addEventListener('input', renderRecords);
$('update-record').addEventListener(
  'click',
  safe(async () => {
    const r = records.find((item) => item.id === selectedId);
    if (!r || noteSavePending) return;
    noteSavePending = true;
    // Read the editor before locking it, and keep concurrent saves from basing
    // their revision history on the same stale stored record.
    const title = $('record-title').value || 'Untitled experiment';
    const notes = $('record-notes').value;
    syncRecordActions();
    try {
      const current =
        session?.id === r.id ? portableRecord(session, $('include-payloads').checked) : r;
      const revised = reviseNotes(current, title, notes);
      // Update the live source before awaiting storage. A notification can trigger an
      // autosave while this transaction is pending; that snapshot must include the edit.
      if (session?.id === r.id) {
        session.title = revised.title;
        session.notes = revised.notes;
        session.noteHistory = revised.noteHistory;
        $('session-title').value = revised.title;
      }
      await store.save(revised);
      await refreshRecords();
      if (selectedId === r.id) selectRecord(r.id);
      notice('Research notes saved on this browser.');
    } finally {
      noteSavePending = false;
      syncRecordActions();
    }
  }),
);
$('delete-record').addEventListener(
  'click',
  safe(async () => {
    if (!selectedId) return;
    if (noteSavePending) return;
    if (running && session?.id === selectedId) {
      notice('Stop the active inspection before deleting its record.');
      return;
    }
    if (deleteArmed !== selectedId) {
      deleteArmed = selectedId;
      $('delete-record').textContent = 'Confirm deletion';
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        deleteArmed = null;
        $('delete-record').textContent = 'Delete record';
      }, 5000);
      return;
    }
    const id = selectedId;
    await store.remove(id);
    clearTimeout(deleteTimer);
    await refreshRecords();
    if (selectedId === id) selectRecord(null);
    notice('Record deleted locally.');
  }),
);
$('export-record').addEventListener(
  'click',
  safe(() => {
    const r = records.find((item) => item.id === selectedId);
    if (r)
      download(
        'sasori-record.json',
        JSON.stringify(portableRecord(r), null, 2),
        'application/json',
      );
  }),
);
$('new-note').addEventListener(
  'click',
  safe(async () => {
    const r = createSession('imported', $('profile').value, 'Research note');
    r.endedAt = r.startedAt;
    r.outcome = 'note';
    await store.save(r);
    await refreshRecords();
    selectRecord(r.id);
    $('record-notes').focus();
  }),
);
let recoveryArmed = false,
  recoveryTimer;
$('recover-corrupt').addEventListener(
  'click',
  safe(async () => {
    if (!store.corrupt.length) return;
    if (!recoveryArmed) {
      recoveryArmed = true;
      $('recover-corrupt').textContent =
        'Confirm removal of ' + store.corrupt.length + ' invalid records';
      notice(
        'Export a backup of valid records first. Confirming removes only records that failed validation; their contents cannot be recovered by this app.',
      );
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        recoveryArmed = false;
        $('recover-corrupt').textContent = 'Remove invalid records';
      }, 5000);
      return;
    }
    for (const invalid of [...store.corrupt]) await store.remove(invalid.id);
    recoveryArmed = false;
    clearTimeout(recoveryTimer);
    $('recover-corrupt').textContent = 'Remove invalid records';
    await refreshRecords();
    notice('Invalid records removed. Valid experiments were preserved.');
  }),
);
$('backup').addEventListener(
  'click',
  safe(async () => {
    const all = await store.list();
    download('sasori-backup.json', serializeBackup(all), 'application/json');
  }),
);
$('import-file').addEventListener(
  'change',
  safe(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Import limit is 13 MB.');
      const imported = parseImport(await file.text(), file.name);
      await store.importCopies(imported);
      await refreshRecords();
      notice(
        imported.length +
          ' research record(s) imported as new copies. Original provenance is preserved; imported claims are not independently verified.',
      );
    } finally {
      event.target.value = '';
    }
  }),
);
function updateComparisonOptions() {
  for (const id of ['compare-first', 'compare-second']) {
    const previous = $(id).value;
    $(id).replaceChildren();
    for (const r of records) {
      const option = node('option', r.source.toUpperCase() + ' / ' + r.title);
      option.value = r.id;
      $(id).append(option);
    }
    if (records.some((r) => r.id === previous)) $(id).value = previous;
  }
  if (records.length > 1 && $('compare-first').value === $('compare-second').value)
    $('compare-second').selectedIndex = 1;
}
$('compare').addEventListener('click', () => {
  const a = records.find((r) => r.id === $('compare-first').value),
    b = records.find((r) => r.id === $('compare-second').value);
  $('comparison').replaceChildren();
  if (!a || !b) {
    $('comparison').textContent = 'Save at least two captures to compare them.';
    return;
  }
  if (a.id === b.id) {
    $('comparison').textContent = 'Select two different sessions.';
    return;
  }
  const table = node('table', '', 'comparison-table'),
    head = node('tr', '');
  for (const title of ['Notification kind', a.source + ' / ' + a.title, b.source + ' / ' + b.title])
    head.append(node('th', title));
  const thead = node('thead', ''),
    body = node('tbody', '');
  thead.append(head);
  table.append(thead, body);
  for (const row of compareSessions(a, b)) {
    const tr = node('tr', '');
    for (const value of [row.kind, row.first, row.second]) tr.append(node('td', String(value)));
    body.append(tr);
  }
  if (!body.children.length) {
    const tr = node('tr', '');
    for (const value of ['No notification categories', '0', '0']) tr.append(node('td', value));
    body.append(tr);
  }
  $('comparison').append(table);
});
const auth = new AuthExperiment((event) => {
  $('auth-state').textContent =
    'SYNTHETIC · ' + event.state + ' · no Elmo handshake or Bluetooth traffic';
  $('auth-run').disabled = event.state === 'awaiting';
  $('auth-cancel').disabled = event.state !== 'awaiting';
});
$('auth-run').addEventListener(
  'click',
  safe(() => auth.start({ simulation: true, consent: true, scenario: $('auth-scenario').value })),
);
$('auth-cancel').addEventListener('click', () => auth.cancel());
for (const entry of GATT_REGISTRY) {
  const row = node('div', '');
  row.append(
    node('h3', entry.label),
    node('code', entry.uuid),
    node('p', entry.properties + ' · ' + entry.evidence),
  );
  $('registry').append(row);
}
for (const capability of CAPABILITIES) {
  const row = node('div', '', 'capability');
  row.append(node('h3', capability.label), node('span', 'LOCKED / UNVERIFIED'));
  $('capabilities').append(row);
}
function setPose(value) {
  value = virtualPosition(value);
  $('pose').value = value;
  $('pose-value').textContent = value.toFixed(2);
  $('virtual-arm').style.transform = 'rotate(' + value * 65 + 'deg)';
  $('virtual-status').textContent =
    'SIMULATED position ' + value.toFixed(2) + ' · no hardware traffic.';
}
function stopSequence() {
  clearInterval(sequenceTimer);
  clearTimeout(sequenceDeadline);
  sequenceTimer = null;
  $('play-sequence').disabled = false;
  setPose(0);
}
$('pose').addEventListener(
  'input',
  safe(() => {
    const value = Number($('pose').value);
    stopSequence();
    validateCommand('actuator', { simulation: true, consent: true });
    setPose(value);
  }),
);
$('play-sequence').addEventListener(
  'click',
  safe(() => {
    validateCommand('sequence', { simulation: true, consent: true });
    stopSequence();
    $('play-sequence').disabled = true;
    let tick = 0;
    sequenceTimer = setInterval(() => {
      setPose(Math.sin(++tick / 3) * 0.8);
    }, 160);
    sequenceDeadline = setTimeout(stopSequence, 4000);
  }),
);
$('stop-sequence').addEventListener('click', () => {
  stopSequence();
  window.speechSynthesis?.cancel();
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null;
  $('virtual-status').textContent = 'Simulation stopped. No hardware power was changed.';
});
$('speak').addEventListener(
  'click',
  safe(() => {
    if (!('speechSynthesis' in window))
      throw new Error('Speech synthesis is unavailable in this browser.');
    validateCommand('voice', { simulation: true, consent: true });
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance($('speech-text').value.slice(0, 120)));
    $('audio-status').textContent =
      'LOCAL AUDIO PREVIEW · speech requested on this device; not sent to Elmo.';
  }),
);
$('tone').addEventListener(
  'click',
  safe(async () => {
    validateCommand('sound', { simulation: true, consent: true });
    if (!window.AudioContext) throw new Error('Web Audio is unavailable in this browser.');
    if (audioContext) await audioContext.close();
    audioContext = new AudioContext();
    await audioContext.resume();
    const context = audioContext,
      oscillator = context.createOscillator(),
      gain = context.createGain();
    gain.gain.value = 0.05;
    oscillator.frequency.value = 440;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    oscillator.onended = () => {
      context.close().catch(() => {});
      if (audioContext === context) audioContext = null;
    };
    $('audio-status').textContent = 'LOCAL AUDIO PREVIEW · 300 ms tone requested on this device.';
  }),
);
const troubleshooting = {
  support:
    'Use the HTTPS site in Bluefy on iPhone. Normal Safari may not expose Web Bluetooth. Other platforms need a compatible browser; feature detection does not prove device compatibility.',
  chooser:
    'Power on your own Elmo, enable Bluetooth, bring it nearby, and close other apps connected to it. The chooser filters names beginning with Elmo. Retry by tapping Connect; this lab never reconnects automatically.',
  service:
    'The community profile may differ from your firmware. Inspect the service list with nRF Connect, record the actual UUIDs and properties, and update the custom settings. Do not subscribe to firmware services or guess commands.',
  silent:
    'A notification subscription does not guarantee messages. Check the notify UUID and source; export a metadata report and repeat once. Silence does not establish authentication success or failure.',
  disconnect:
    'Check the recorded reason: user, inspection-complete, page-hidden, packet-limit, and unexpected are distinct. Keep the page visible. Unexpected disconnects may be range, power, firmware sleep, or another app.',
  storage:
    'Records belong to this browser and this exact site origin. Private browsing, clearing data, iOS eviction, and using another browser can remove or separate records. Import a JSON backup; no automatic cross-device sync exists.',
};
function updateTrouble() {
  $('trouble-answer').textContent = troubleshooting[$('trouble').value];
}
$('trouble').addEventListener('change', updateTrouble);
updateTrouble();
function stopAll(reason) {
  transport?.disconnect(reason);
  auth.cancel();
  stopSequence();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAll('page-hidden');
});
window.addEventListener('pagehide', () => stopAll('page-hidden'));
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  problem(event.reason);
});
window.addEventListener('error', () => {
  notice(
    'The interface encountered an error. Stop the inspection, export your log if possible, and reload.',
  );
  transport?.disconnect('interface-error');
});
async function initialize() {
  $('connect').disabled = true;
  await store.open();
  settings = await store.getSettings();
  toys = await store.listToys();
  renderProfileOptions(settings.profile);
  renderToys();
  applyProfile();
  // A saved custom profile is authoritative; old per-window preferences must not undo edits.
  if (!currentProfile().custom) {
    if (typeof settings.service === 'string') $('svc').value = settings.service.slice(0, 128);
    if (typeof settings.notify === 'string') $('notify').value = settings.notify.slice(0, 128);
    if (typeof settings.namePrefix === 'string')
      $('name-prefix').value = settings.namePrefix.slice(0, 60);
  }
  syncProbeSelection();
  $('engineering').checked = settings.engineering === true;
  ready = true;
  updateMode();
  await refreshRecords();
  deviceHub = mountDeviceHub({
    getState: () => ({
      profile: currentProfile(),
      session,
      records,
      running,
      state: transport?.state || 'idle',
      support: supportState(),
      deviceLabel,
    }),
    notice,
    navigate,
    selectRecord,
    prepareEndpoint,
    saveDevice: safe((record) => prepareSavedDevice(record)),
    exportReport: safe((record) => {
      if (!record || running) return;
      download(
        'sasori-connection-report.json',
        JSON.stringify(portableRecord(record), null, 2),
        'application/json',
      );
    }),
  });
  await mountDiscovery({ store, download }).catch(problem);
  if (store.warning) notice(store.warning);
  log('info', 'Project Sasori v0.2.0 ready. No connection starts without your action.');
  navigate(location.hash.slice(1));
}
initialize().catch((error) => {
  ready = true;
  updateMode();
  problem(error);
});
