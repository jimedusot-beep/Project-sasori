import {
  HUB_FAMILIES,
  hubFamily,
  TV_KEYS,
  ELMO_INPUTS,
  ELMO_SOUNDS,
  actionLabel,
} from './lib/hub-catalog.js';
import { HubSession } from './lib/hub-session.js';
import { RoutineRunner, validateRoutine } from './lib/routines.js';
import { ResearchStore } from './lib/storage.js';
import { recordId } from './lib/records.js';
import {
  emptyHubData,
  validateHubData,
  portableHubData,
  parseHubBackup,
  hubFailure,
  localCompanionURL,
} from './lib/hub-records.js';
import { TVRemote } from './lib/tv-remote.js';

const $ = (id) => document.getElementById(id);
const companion = document.querySelector('meta[name="sasori-runtime"]')?.content === 'local-helper';
const bluetoothAvailable =
  window.isSecureContext && typeof navigator.bluetooth?.requestDevice === 'function';
const inputLabels = [
  'Left hand',
  'Right hand',
  'Belly',
  'Clap',
  'Left + belly',
  'Right + belly',
  'Nose',
];
let store,
  data = emptyHubData(),
  ready = false,
  readOnly = false,
  familyId = 'elmo-l2l/v1';
let current = null,
  snapshot = null,
  routine = null,
  routineReport = null,
  actionBusy = false,
  cachedDevice = null;
let currentSetup = null,
  connectionSaved = false,
  endSaved = false,
  draft = [],
  saving = Promise.resolve();
const familyButtons = new Map(),
  sensors = [];
const node = (tag, text, cls = '') => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
const option = (value, label) => {
  const el = node('option', label);
  el.value = value;
  return el;
};
const selected = () => data.setups.find((s) => s.id === $('saved-setup').value);
const connected = () => snapshot?.state === 'connected';
const active = () => ['connecting', 'connected'].includes(snapshot?.state);
const running = () => routine?.active === true;
const locked = () => active() || running();
function notice(message) {
  $('storage-notice').hidden = !message;
  $('storage-notice').textContent = message || '';
}
function failure(error) {
  const info = hubFailure(error);
  $('failure-title').textContent = info.title;
  $('failure-hint').textContent = info.hint;
  $('failure-help').hidden = false;
}
function handle(fn) {
  return () => {
    try {
      Promise.resolve(fn()).catch(failure);
    } catch (error) {
      failure(error);
    }
  };
}
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function change(fn) {
  if (readOnly)
    return Promise.reject(
      new Error('Saved hub data is read-only until the storage issue is resolved.'),
    );
  const result = saving
    .catch(() => {})
    .then(async () => {
      data = await store.setHubData(validateHubData(fn(structuredClone(data))));
      renderLists();
      return data;
    });
  saving = result;
  return result;
}
function renderLists() {
  const chosen = data.selectedId;
  $('saved-setup').replaceChildren(option('', 'New device'));
  for (const s of data.setups)
    $('saved-setup').append(option(s.id, s.label + ' · ' + hubFamily(s.familyId).name));
  $('saved-setup').value = chosen;
  const previous = $('saved-routine').value;
  $('saved-routine').replaceChildren(option('', 'Choose a saved routine'));
  for (const r of data.routines.filter((r) => r.familyId === familyId))
    $('saved-routine').append(option(r.id, r.name));
  $('saved-routine').value = data.routines.some((r) => r.id === previous && r.familyId === familyId)
    ? previous
    : '';
  render();
}
async function restoreGrant(setup) {
  cachedDevice = null;
  render();
  if (!setup?.deviceId || typeof navigator.bluetooth?.getDevices !== 'function') return;
  try {
    const devices = await navigator.bluetooth.getDevices();
    if (selected()?.id === setup.id && !active()) {
      cachedDevice = devices.find((d) => d.id === setup.deviceId) || null;
      render();
    }
  } catch {
    /* Missing grants use the ordinary chooser on the next manual Connect. */
  }
}
function setFamily(id) {
  familyId = hubFamily(id).id;
  for (const [key, button] of familyButtons)
    button.setAttribute('aria-pressed', String(key === id));
  $('family-hint').textContent = hubFamily(id).hint;
  $('ble-options').hidden = id === 'tv-local/v1';
  $('elmo-options').hidden = id !== 'elmo-l2l/v1';
  $('elmo-controls').hidden = id !== 'elmo-l2l/v1';
  $('tv-options').hidden = id !== 'tv-local/v1';
  $('tv-controls').hidden = id !== 'tv-local/v1';
  $('generic-actions').hidden = !['ble-standard/v1', 'wowwee-mip/v1'].includes(id);
  $('tv-hosted').hidden = companion;
  $('tv-local').hidden = !companion;
  $('browser-help').textContent = bluetoothAvailable
    ? 'Bluetooth is available. Select your device in the chooser when prompted.'
    : companion
      ? 'Bluetooth requires a secure browser context. Use the hosted Sasori hub in Bluefy or compatible Chrome for Bluetooth; local TV controls work here.'
      : 'Use Bluefy on iPhone/iPad or compatible Chrome for Bluetooth. The offline demo works here.';
  $('hub-alert').textContent = id === 'wowwee-mip/v1' ? 'Blue chest light' : 'Find / mild alert';
  draft = [];
  $('routine-name').value = 'My routine';
  buildStepOptions();
  renderDraft();
  renderLists();
}
function loadSetup(setup) {
  current = null;
  snapshot = null;
  currentSetup = null;
  cachedDevice = null;
  routineReport = null;
  $('failure-help').hidden = true;
  $('hub-password').value = '';
  $('companion-pin').value = '';
  $('allow-setup').checked = false;
  $('owner-observation').value = 'not-tested';
  setFamily(setup?.familyId || familyId);
  $('device-label').value =
    setup?.label || (familyId === 'elmo-l2l/v1' ? 'My Elmo' : hubFamily(familyId).name);
  $('device-prefix').value = setup?.namePrefix ?? (familyId === 'elmo-l2l/v1' ? 'Elmo' : '');
  $('companion-address').value = setup?.companionURL || '';
  $('tv-driver').value = setup?.tv?.driver || 'roku';
  $('tv-target').value = setup?.tv?.target || '';
  $('ir-device').value = setup?.tv?.device || 'sasori-tv';
  updateTVFields();
  $('last-result').textContent = setup?.lastResult
    ? 'Last connection: ' +
      setup.lastResult.outcome +
      ' · ' +
      new Date(setup.lastResult.at).toLocaleString()
    : '';
  restoreGrant(setup);
  render();
}
function fields(skipTVTarget = false) {
  const old = selected();
  const setup = {
    id: old?.id || 'setup-' + recordId(),
    label: $('device-label').value.trim() || hubFamily(familyId).name,
    familyId,
    namePrefix: $('device-prefix').value.trim(),
  };
  if (old?.deviceId && old.familyId === familyId) setup.deviceId = old.deviceId;
  if (familyId === 'tv-local/v1') {
    if (companion && !skipTVTarget)
      setup.tv = {
        driver: $('tv-driver').value,
        target: $('tv-target').value.trim(),
        device: $('ir-device').value.trim() || 'sasori-tv',
      };
    else if ($('companion-address').value.trim())
      setup.companionURL = localCompanionURL($('companion-address').value.trim());
  }
  return validateHubData({ ...emptyHubData(), setups: [setup] }).setups[0];
}
async function remember(setup, device = null, last = null) {
  const clean = { ...setup };
  if (device && typeof device.id === 'string' && device.id && device.id.length <= 256)
    clean.deviceId = device.id;
  if (last) clean.lastResult = last;
  await change((value) => {
    const existing = value.setups.find((s) => s.id === clean.id);
    if (existing) value.setups[value.setups.indexOf(existing)] = clean;
    else value.setups.push(clean);
    value.selectedId = clean.id;
    return value;
  });
  currentSetup = clean;
}
function endResult(s) {
  const code = hubFailure({ code: s.failure?.code || s.reason || 'user-stop' }).code;
  return {
    at: new Date().toISOString(),
    outcome: ['user-stop', 'page-hidden', 'selection-cancelled'].includes(code)
      ? 'cancelled'
      : 'failed',
    code,
  };
}
function receive(session, value) {
  if (session !== current) return;
  snapshot = value;
  render();
  if (
    connectionSaved &&
    !endSaved &&
    value.state === 'disconnected' &&
    !value.synthetic &&
    currentSetup
  ) {
    endSaved = true;
    remember(currentSetup, session.device, endResult(value)).catch(() =>
      notice('Connection ended, but its latest result could not be saved.'),
    );
  }
}
async function connect(demo = false) {
  if (!ready || locked()) return;
  let setup;
  try {
    setup = fields(demo);
  } catch {
    notice('Check the setup label, TV target and local companion address.');
    return;
  }
  if (!demo && familyId !== 'tv-local/v1' && !bluetoothAvailable) {
    failure({ code: 'browser-unavailable' });
    return;
  }
  if (!demo && familyId === 'tv-local/v1' && !companion) {
    failure({ code: 'helper-required' });
    return;
  }
  const password = $('hub-password').value,
    pin = $('companion-pin').value;
  $('hub-password').value = '';
  $('companion-pin').value = '';
  $('failure-help').hidden = true;
  $('owner-observation').value = 'not-tested';
  routineReport = null;
  connectionSaved = false;
  endSaved = false;
  const session = new HubSession({
    familyId,
    synthetic: demo,
    bluetooth: navigator.bluetooth,
    companion,
    emit: (value) => receive(session, value),
  });
  current = session;
  currentSetup = setup;
  snapshot = session.snapshot();
  const options = {
    password,
    pin,
    showAll: $('show-all').checked,
    namePrefix: $('show-all').checked ? '' : setup.namePrefix,
    allowPasswordSetup: $('allow-setup').checked,
    ...(setup.tv || {}),
    ...(familyId === 'tv-local/v1'
      ? { device: setup.tv?.device || 'sasori-tv' }
      : {
          device: demo ? null : cachedDevice,
          rememberedId: demo ? '' : setup.deviceId || '',
        }),
  };
  try {
    // No storage or permission await occurs before the Bluetooth chooser's user activation.
    const pending = session.connect(options);
    render();
    await pending;
  } catch (error) {
    if (session === current) failure(snapshot?.failure || error);
  } finally {
    if (session === current && !demo) {
      cachedDevice = session.device;
      try {
        await remember(
          setup,
          session.device,
          snapshot?.state === 'connected'
            ? { at: new Date().toISOString(), outcome: 'connected', code: '' }
            : endResult(snapshot || {}),
        );
        connectionSaved = true;
        endSaved = snapshot?.state === 'disconnected';
      } catch {
        notice(
          'The connection result is available, but this setup could not be saved. Export a result before closing.',
        );
      }
    }
    render();
  }
}
async function act(intent, args = {}) {
  if (!current || running() || actionBusy) return;
  actionBusy = true;
  render();
  try {
    await current.dispatch(intent, args);
  } catch (error) {
    failure(error);
  } finally {
    actionBusy = false;
    render();
  }
}
function render() {
  const s = snapshot,
    lockedNow = locked(),
    busy = actionBusy || running() || !!s?.busy;
  for (const button of familyButtons.values()) button.disabled = lockedNow;
  for (const id of [
    'saved-setup',
    'new-setup',
    'device-label',
    'device-prefix',
    'show-all',
    'hub-password',
    'allow-setup',
    'tv-driver',
    'tv-target',
    'ir-device',
    'companion-pin',
    'ha-entities',
    'find-ha',
  ])
    $(id).disabled = lockedNow;
  $('hub-connect').disabled =
    !ready || lockedNow || (familyId === 'tv-local/v1' ? !companion : !bluetoothAvailable);
  $('hub-connect').textContent = connected()
    ? 'Connected'
    : active()
      ? 'Connection in progress'
      : cachedDevice
        ? 'Reconnect device →'
        : 'Connect device →';
  $('hub-demo').disabled = !ready || lockedNow;
  $('choose-again').hidden = !cachedDevice;
  $('choose-again').disabled = lockedNow;
  $('save-setup').disabled = !ready || readOnly || lockedNow;
  $('remove-setup').disabled = !selected() || readOnly || lockedNow;
  $('hub-import').disabled = !ready || readOnly || lockedNow;
  $('hub-export').disabled = !ready;
  $('source').textContent = s?.synthetic ? 'DEMO' : 'LIVE';
  $('demo-banner').hidden = !s?.synthetic;
  $('connected-name').textContent = s?.deviceName || hubFamily(familyId).name;
  $('controls-title').textContent =
    s?.state === 'connecting'
      ? 'Making contact…'
      : connected()
        ? 'Your controls are ready.'
        : s?.state === 'disconnected'
          ? 'Ready for next time.'
          : 'Ready when you are.';
  $('connection-state').textContent =
    s?.state === 'connecting'
      ? 'Connecting'
      : connected()
        ? s.synthetic
          ? 'Demo · ready'
          : s.authenticationOutcome === 'toy-reported-acceptance'
            ? 'Toy reported acceptance'
            : 'Connected'
        : 'Not connected';
  $('device-state').textContent =
    s?.volume != null
      ? 'Elmo volume ' + s.volume + ' / 15'
      : s?.battery != null
        ? 'Battery ' + s.battery + '%'
        : s?.statusText || s?.information?.state || s?.information?.firmware || 'Unknown';
  const message = !s
    ? 'Choose a device family, then connect or try its demo.'
    : s.state === 'connecting'
      ? 'Select your device and wait for connection setup to finish.'
      : connected() && s.busy
        ? 'Waiting for the device’s available state…'
        : connected() && s.lastAction
          ? s.lastAction === 'sound-requested'
            ? 'Sound request sent. Listen to your toy to check playback.'
            : s.lastAction === 'volume-requested'
              ? 'Volume request sent. The reported value is shown separately.'
              : s.familyId === 'tv-local/v1' && s.lastAction.endsWith('-requested')
                ? 'Remote button request sent. Check the physical device.'
                : 'Action finished. Results reflect replies or queued requests, not independent physical verification.'
          : connected()
            ? s.passwordSetupOutcome === 'toy-reported-acceptance'
              ? 'New-password acceptance reported. Reconnect afterward with setup unchecked to test retention.'
              : 'Choose an available action or start a saved routine.'
            : s.failure
              ? s.failure.title
              : 'Connection ended. Your saved setup is kept.';
  $('connection-message').textContent = message;
  if (s?.failure) failure(s.failure);
  $('volume-note').textContent =
    'Reported volume: ' +
    (s?.volume == null ? 'unknown' : s.volume + ' / 15') +
    (s?.volumeRequested == null ? '.' : '. Last requested: ' + s.volumeRequested + ' / 15.');
  sensors.forEach((el, i) => {
    const value = s?.inputs?.[ELMO_INPUTS[i]];
    el.textContent =
      inputLabels[i] + (value == null ? ' · unknown' : value ? ' · active' : ' · inactive');
    el.classList.toggle('on', value === true);
  });
  $('hub-sound').disabled = busy || !current?.can('sound', { id: Number($('sound-choice').value) });
  $('hub-volume').disabled =
    busy || !current?.can('volume', { level: Number($('volume-choice').value) });
  for (const [id, intent] of [
    ['hub-identify', 'identify'],
    ['hub-status', 'status'],
    ['hub-alert', 'alert'],
  ])
    $(id).disabled = busy || !current?.can(intent);
  for (const button of document.querySelectorAll('[data-tv-key]'))
    button.disabled = busy || !current?.can('key', { key: button.dataset.tvKey });
  $('hub-stop').disabled = !active() && !running();
  $('hub-result').disabled = !current || active() || running();
  $('owner-observation').disabled = !s || s.synthetic || !s.lastAction;
  $('simulate-touch').hidden = !s?.synthetic || familyId !== 'elmo-l2l/v1' || !connected();
  $('simulate-touch').disabled = !!s?.busy;
  $('ir-learning').hidden = !s?.learnAvailable || !companion;
  $('learn-button').disabled = busy || !connected() || !s?.learnAvailable;
  $('run-routine').disabled = !connected() || busy || !$('saved-routine').value;
  $('cancel-routine').disabled = !running();
  $('routine-result').disabled = !routineReport || running();
  for (const id of [
    'saved-routine',
    'routine-name',
    'routine-step',
    'step-sound',
    'step-volume',
    'step-wait',
    'step-touch',
    'step-key',
    'add-step',
    'remove-step',
    'clear-steps',
    'starter-routine',
    'save-routine',
    'remove-routine',
  ])
    $(id).disabled = running() || readOnly;
  $('saved-note').textContent = cachedDevice
    ? 'A previously granted device is ready to reuse. Connect still requires a manual press.'
    : 'Setup is saved locally; the browser may ask you to select the device again. No automatic connection.';
  countdown();
}
function countdown() {
  $('remaining').textContent = snapshot?.deadlineAt
    ? Math.max(0, Math.ceil((snapshot.deadlineAt - Date.now()) / 1000)) + 's remaining'
    : '';
}
function updateTVFields() {
  const mode = $('tv-driver').value;
  $('tv-target-label').textContent =
    mode === 'roku'
      ? 'Roku local IPv4 address'
      : mode === 'ha-media'
        ? 'Home Assistant media player entity'
        : 'Home Assistant IR remote entity';
  $('tv-target').placeholder =
    mode === 'roku'
      ? '192.168.1.40'
      : mode === 'ha-media'
        ? 'media_player.living_room'
        : 'remote.ir_hub';
  $('ir-device-field').hidden = mode !== 'ha-remote';
  $('find-ha').hidden = mode === 'roku';
}
function buildStepOptions() {
  $('routine-step').replaceChildren();
  const actions =
    familyId === 'elmo-l2l/v1'
      ? [
          ['status', 'Read status'],
          ['sound', 'Play a catalog sound'],
          ['volume', 'Set volume'],
          ['touch', 'Wait for a touch input'],
        ]
      : familyId === 'tv-local/v1'
        ? [
            ['status', 'Read status'],
            ['key', 'Press a remote button'],
          ]
        : [
            ['identify', 'Read device information'],
            ['status', 'Read status'],
            ['alert', familyId === 'wowwee-mip/v1' ? 'Blue chest light' : 'Mild alert'],
          ];
  for (const [value, label] of [...actions, ['wait', 'Wait briefly']])
    $('routine-step').append(option(value, label));
  updateStepFields();
}
function updateStepFields() {
  for (const type of ['sound', 'volume', 'wait', 'touch', 'key'])
    $('step-' + type + '-field').hidden = $('routine-step').value !== type;
}
function renderDraft() {
  $('routine-steps').replaceChildren();
  for (const step of draft)
    $('routine-steps').append(
      node(
        'li',
        step.kind === 'wait'
          ? 'Wait ' + step.ms + ' ms'
          : step.kind === 'touch'
            ? 'Wait up to ' +
              step.timeoutMs / 1000 +
              ' seconds for a new ' +
              inputLabels[ELMO_INPUTS.indexOf(step.input)].toLowerCase() +
              ' press'
            : actionLabel(familyId, step.intent, step.args),
      ),
    );
  if (!draft.length)
    $('routine-steps').append(node('li', 'No steps yet. Add one or load a starter.'));
}
function starter() {
  draft =
    familyId === 'elmo-l2l/v1'
      ? [
          { kind: 'touch', input: 'nose', timeoutMs: 10000 },
          { kind: 'action', intent: 'sound', args: { id: 9 } },
        ]
      : familyId === 'tv-local/v1'
        ? [
            { kind: 'action', intent: 'key', args: { key: 'volume-down' } },
            { kind: 'wait', ms: 500 },
            { kind: 'action', intent: 'key', args: { key: 'volume-down' } },
          ]
        : [
            { kind: 'action', intent: 'identify', args: {} },
            { kind: 'action', intent: 'status', args: {} },
          ];
  $('routine-name').value =
    familyId === 'elmo-l2l/v1'
      ? 'Nose → hello'
      : familyId === 'tv-local/v1'
        ? 'Volume down twice'
        : 'Quick status check';
  $('saved-routine').value = '';
  renderDraft();
  render();
}
for (const family of HUB_FAMILIES) {
  const button = node('button', family.name, 'family-button');
  button.type = 'button';
  button.dataset.family = family.id;
  button.append(node('small', family.kind === 'bluetooth' ? 'BLUETOOTH' : 'WI-FI / IR COMPANION'));
  button.addEventListener('click', () => {
    if (locked()) return;
    data.selectedId = '';
    $('saved-setup').value = '';
    familyId = family.id;
    loadSetup(null);
  });
  familyButtons.set(family.id, button);
  $('families').append(button);
}
for (const sound of ELMO_SOUNDS)
  for (const id of ['sound-choice', 'step-sound'])
    $(id).append(option(String(sound.id), sound.label));
ELMO_INPUTS.forEach((input, i) => {
  const el = node('li', inputLabels[i] + ' · unknown');
  sensors.push(el);
  $('touch-inputs').append(el);
  $('step-touch').append(option(input, inputLabels[i]));
});
for (const [key, label] of Object.entries(TV_KEYS))
  for (const id of ['step-key', 'learn-key']) $(id).append(option(key, label));
$('hub-connect').addEventListener(
  'click',
  handle(() => connect(false)),
);
$('hub-demo').addEventListener(
  'click',
  handle(() => connect(true)),
);
$('hub-password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('hub-connect').click();
  }
});
$('hub-stop').addEventListener('click', () => {
  routine?.cancel();
  current?.stop();
  render();
});
$('cancel-routine').addEventListener('click', () => routine?.cancel());
$('hub-status').addEventListener('click', () => act('status'));
$('hub-identify').addEventListener('click', () => act('identify'));
$('hub-alert').addEventListener('click', () => act('alert'));
$('hub-sound').addEventListener('click', () =>
  act('sound', { id: Number($('sound-choice').value) }),
);
$('hub-volume').addEventListener('click', () =>
  act('volume', { level: Number($('volume-choice').value) }),
);
for (const button of document.querySelectorAll('[data-tv-key]'))
  button.addEventListener('click', () => act('key', { key: button.dataset.tvKey }));
for (const id of ['sound-choice', 'volume-choice', 'saved-routine'])
  $(id).addEventListener('change', render);
$('simulate-touch').addEventListener(
  'click',
  handle(() => current?.simulateTouch()),
);
$('choose-again').addEventListener('click', () => {
  cachedDevice = null;
  render();
});
$('saved-setup').addEventListener('change', () => {
  data.selectedId = $('saved-setup').value;
  loadSetup(selected());
});
$('new-setup').addEventListener('click', () => {
  data.selectedId = '';
  $('saved-setup').value = '';
  loadSetup(null);
});
$('save-setup').addEventListener(
  'click',
  handle(async () => {
    try {
      await remember(fields());
    } catch {
      notice('Setup could not be saved. Check its fields and storage capacity.');
    }
  }),
);
$('remove-setup').addEventListener(
  'click',
  handle(async () => {
    const id = selected()?.id;
    if (!id) return;
    await change((v) => ({ ...v, selectedId: '', setups: v.setups.filter((s) => s.id !== id) }));
    loadSetup(null);
  }),
);
$('hub-export').addEventListener('click', () =>
  download(portableHubData(data), 'sasori-hub-backup.json'),
);
$('hub-import').addEventListener(
  'change',
  handle(async () => {
    const file = $('hub-import').files[0];
    $('hub-import').value = '';
    if (!file) return;
    try {
      if (file.size > 64000) throw new Error();
      const incoming = parseHubBackup(await file.text());
      await change((v) => ({
        ...v,
        setups: [...v.setups, ...incoming.setups],
        routines: [...v.routines, ...incoming.routines],
      }));
      notice('Backup imported as configuration. Select a device locally before running actions.');
    } catch {
      notice(
        'Import was not saved. Choose a valid hub backup within the 20-device, 20-routine and 64 KB limits.',
      );
    }
  }),
);
$('hub-result').addEventListener('click', () =>
  download(current.result($('owner-observation').value), 'sasori-connection-result.json'),
);
$('routine-result').addEventListener('click', () =>
  download(routineReport, 'sasori-routine-result.json'),
);
$('tv-driver').addEventListener('change', updateTVFields);
$('open-companion').addEventListener('click', () => {
  try {
    window.open(
      localCompanionURL($('companion-address').value.trim()),
      '_blank',
      'noopener,noreferrer',
    );
  } catch {
    notice('Enter a full local companion address, such as http://192.168.1.20:8765.');
  }
});
$('find-ha').addEventListener(
  'click',
  handle(async () => {
    const pin = $('companion-pin').value;
    $('companion-pin').value = '';
    const service = new TVRemote({ companion });
    const entities = await service.entities(pin);
    $('ha-entities').replaceChildren(option('', 'Choose a configured device'));
    for (const entity of entities)
      $('ha-entities').append(option(entity.id, entity.name + ' · ' + entity.id));
    $('ha-entities').hidden = false;
    $('ha-entities-label').hidden = false;
    if (!entities.length)
      notice(
        'No configured media players or remotes were returned. Configure Home Assistant on the companion, or enter a known entity ID manually.',
      );
  }),
);
$('ha-entities').addEventListener('change', () => {
  const id = $('ha-entities').value;
  if (id) {
    $('tv-target').value = id;
    $('tv-driver').value = id.startsWith('remote.') ? 'ha-remote' : 'ha-media';
    updateTVFields();
  }
});
$('learn-button').addEventListener(
  'click',
  handle(async () => {
    if (!current || running()) return;
    actionBusy = true;
    render();
    $('connection-message').textContent =
      'Learning requested. Point the original remote at the IR hub and press the selected button when the hub signals.';
    try {
      await current.backend.learn($('learn-key').value);
      notice(
        'IR learning request finished. Test the button on your device; successful capture still needs your observation.',
      );
    } finally {
      actionBusy = false;
      render();
    }
  }),
);
$('routine-step').addEventListener('change', updateStepFields);
$('add-step').addEventListener('click', () => {
  const type = $('routine-step').value;
  const step =
    type === 'wait'
      ? { kind: 'wait', ms: Number($('step-wait').value) }
      : type === 'touch'
        ? { kind: 'touch', input: $('step-touch').value, timeoutMs: 10000 }
        : {
            kind: 'action',
            intent: type,
            args:
              type === 'sound'
                ? { id: Number($('step-sound').value) }
                : type === 'volume'
                  ? { level: Number($('step-volume').value) }
                  : type === 'key'
                    ? { key: $('step-key').value }
                    : {},
          };
  try {
    const r = validateRoutine({
      id: 'routine-draft',
      name: $('routine-name').value.trim() || 'My routine',
      familyId,
      steps: [...draft, step],
    });
    draft = r.steps;
    renderDraft();
  } catch {
    notice(
      'That step exceeds a routine limit. Use up to 8 steps, one sound, four volume changes, one touch trigger and 15 seconds of waits.',
    );
  }
});
$('remove-step').addEventListener('click', () => {
  draft.pop();
  renderDraft();
});
$('clear-steps').addEventListener('click', () => {
  draft = [];
  renderDraft();
});
$('starter-routine').addEventListener('click', starter);
$('saved-routine').addEventListener('change', () => {
  const r = data.routines.find((r) => r.id === $('saved-routine').value);
  if (r) {
    draft = structuredClone(r.steps);
    $('routine-name').value = r.name;
    renderDraft();
  }
});
$('save-routine').addEventListener(
  'click',
  handle(async () => {
    try {
      const r = validateRoutine({
        id: $('saved-routine').value || 'routine-' + recordId(),
        name: $('routine-name').value,
        familyId,
        steps: draft,
      });
      await change((v) => ({
        ...v,
        routines: [...v.routines.filter((old) => old.id !== r.id), r],
      }));
      $('saved-routine').value = r.id;
      render();
    } catch {
      notice('Routine could not be saved. Check its name, steps, family and storage capacity.');
    }
  }),
);
$('remove-routine').addEventListener(
  'click',
  handle(async () => {
    const id = $('saved-routine').value;
    if (id) await change((v) => ({ ...v, routines: v.routines.filter((r) => r.id !== id) }));
  }),
);
$('run-routine').addEventListener(
  'click',
  handle(async () => {
    const saved = data.routines.find((r) => r.id === $('saved-routine').value);
    if (!saved || !current || running()) return;
    routine = new RoutineRunner({
      emit: (result) => {
        routineReport = result;
        $('routine-progress').textContent =
          result.outcome === 'running'
            ? 'Step ' +
              result.currentStep +
              ' / ' +
              result.totalSteps +
              ' · keep this page visible.'
            : result.outcome === 'completed'
              ? 'Routine completed: ' +
                result.completedSteps +
                ' steps. Check the physical effect yourself.'
              : result.reason === 'touch-timeout'
                ? 'No new touch press arrived in time. The routine stopped.'
                : 'Routine ' +
                  result.outcome +
                  '. Pending steps were stopped; already-sent effects may continue.';
        render();
      },
    });
    await routine.run(saved, current);
    render();
  }),
);
function hide() {
  $('hub-password').value = '';
  $('companion-pin').value = '';
  routine?.cancel();
  current?.stop('page-hidden');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
});
window.addEventListener('pagehide', hide);
setInterval(countdown, 1000);
setFamily(familyId);
render();
async function init() {
  store = await new ResearchStore().open();
  try {
    data = await store.getHubData();
    if (!data.legacyImported) {
      const old = await store.getControlSetups();
      data = await store.setHubData({
        ...data,
        legacyImported: true,
        setups: [
          ...data.setups,
          ...old.targets.slice(0, 20 - data.setups.length).map((s) => ({
            id: 'setup-' + recordId(),
            label: s.label,
            familyId: s.adapterId,
            namePrefix: s.namePrefix,
            ...(s.deviceId ? { deviceId: s.deviceId } : {}),
          })),
        ],
      });
    }
  } catch {
    readOnly = true;
    notice(
      'Saved hub data could not be read. Existing records are preserved; live controls and demos still work.',
    );
  }
  ready = true;
  renderLists();
  loadSetup(data.setups.find((s) => s.id === data.selectedId) || null);
  if (store.warning) notice(store.warning);
}
init().catch(() => {
  ready = true;
  notice('Storage could not open. Try the offline demo; export results before closing.');
  render();
});
