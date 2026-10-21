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
import {
  createSession,
  portableRecord,
  parseImport,
  backup,
  compareSessions,
  sessionText,
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
  deleteArmed = null,
  deleteTimer,
  settingsTimer,
  sequenceTimer,
  sequenceDeadline,
  audioContext;
let settings = {};
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

for (const profile of PROFILES) {
  const option = node('option', profile.id + ' / ' + profile.label);
  option.value = profile.id;
  $('profile').append(option);
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
  const matching = ELMO_NOTIFY_PROBES.find((probe) => probe.uuid === $('notify').value.trim().toLowerCase());
  $('notify-preset').value = matching?.id || 'custom';
}
$('notify-preset').addEventListener('change', () => {
  const probe = ELMO_NOTIFY_PROBES.find((entry) => entry.id === $('notify-preset').value);
  if (!probe) {
    $('uuid-settings').open = true;
    notice('Enter a sourced characteristic UUID manually; no inspection starts automatically.');
    return;
  }
  $('notify').value = probe.uuid;
  saveSettings();
  notice(
    probe.id === 'metadata'
      ? 'Metadata-only inspection selected. No characteristic subscription will occur.'
      : 'Candidate ' + probe.id + ' notification probe selected. The next manual inspection will subscribe only to this characteristic; no application commands will be sent.',
  );
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
    : !window.isSecureContext
      ? 'HTTPS is required for Bluetooth access. Open the published secure URL.'
      : navigator.bluetooth?.requestDevice
        ? 'Web Bluetooth detected. Device compatibility still requires physical testing.'
        : 'Web Bluetooth unavailable. On iPhone, open this HTTPS page in Bluefy. Simulation works here.';
  const profile = PROFILES.find((p) => p.id === $('profile').value);
  $('device-title').textContent = profile.label;
  $('profile-status').textContent = profile.status;
  $('connect').disabled =
    !ready ||
    running ||
    (!simulated &&
      (!navigator.bluetooth?.requestDevice || !window.isSecureContext || profile.id !== '001'));
  $('load-profile').disabled = profile.id !== '001' || running;
  document.body.classList.toggle('engineering', $('engineering').checked);
  if (!$('engineering').checked) $('include-payloads').checked = false;
}
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    settings = {
      schemaVersion: 1,
      profile: $('profile').value,
      service: $('svc').value,
      notify: $('notify').value,
      engineering: $('engineering').checked,
    };
    store.setSettings(settings).catch(problem);
  }, 250);
}
for (const id of ['simulation', 'profile', 'engineering'])
  $(id).addEventListener('change', () => {
    if (id !== 'engineering') $('consent').checked = false;
    updateMode();
    saveSettings();
  });
$('svc').addEventListener('input', saveSettings);
$('notify').addEventListener('input', () => {
  syncProbeSelection();
  saveSettings();
});
$('load-profile').addEventListener('click', () => {
  $('svc').value = ELMO_SERVICE;
  $('notify').value = ELMO_NOTIFY;
  syncProbeSelection();
  saveSettings();
  notice(
    'Published Elmo profile loaded from NonaSuomy/Love2LearnElmo. Its UUIDs are community-reported; a live inspection will establish whether they exist on your unit. No connection has been started.',
  );
});
function lockConnection(locked) {
  running = locked;
  for (const id of [
    'profile',
    'simulation',
    'svc',
    'notify',
    'notify-preset',
    'consent',
    'simulation-scenario',
    'show-all-devices',
  ])
    $(id).disabled = locked;
  $('disconnect').disabled = !locked;
  $('global-stop').disabled = !locked;
  updateMode();
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
      wrapper.append(characteristic);
    }
    target.append(wrapper);
  }
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
  if (event.type === 'stage') {
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
      session.endedAt = new Date().toISOString();
      session.outcome = event.reason || 'disconnected';
      if (!session.stats.packets && event.reason === 'inspection-complete')
        session.outcome = 'inconclusive-no-notifications';
      lockConnection(false);
      const next =
        session.source === 'simulated'
          ? 'Simulation finished. This does not verify real Bluetooth compatibility.'
          : session.stats.packets
            ? 'Inspection captured notifications. Review the observed service map and save notes; authentication is still unverified.'
            : 'No notifications captured. Review the disconnect reason and profile; do not infer authentication success.';
      $('next-step').textContent = next;
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
}
$('connect').addEventListener(
  'click',
  safe(() => {
    if (!ready || running) return;
    const simulated = $('simulation').checked;
    if (!simulated) {
      if (!$('consent').checked)
        throw new Error('Confirm that you own or are authorized to inspect this device.');
      normalizeUUID($('svc').value);
      if ($('notify').value.trim()) normalizeUUID($('notify').value);
    }
    diagnostics = new Diagnostics();
    session = createSession(simulated ? 'simulated' : 'live', $('profile').value);
    $('session-title').value = session.title;
    $('session-source').textContent = simulated ? 'SIMULATED SESSION' : 'LIVE INSPECTION';
    $('include-payloads').checked = false;
    $('inspection-stage').textContent = simulated
      ? 'Simulation active; no Bluetooth connection'
      : 'Stage: preparing manual Elmo inspection';
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
      log('info', 'Configured community candidate probe', {
        service: $('svc').value.trim().toLowerCase(),
        notify: $('notify').value.trim().toLowerCase() || 'none',
        preset: $('notify-preset').value,
      });
    transport = simulated
      ? new SimulationTransport(handleEvent)
      : new BluetoothTransport({ emit: handleEvent });
    const result = simulated
      ? transport.connect({ scenario: $('simulation-scenario').value })
      : transport.connect({
          service: $('svc').value,
          notify: $('notify').value.trim(),
          durationMs: 15000,
          showAllDevices: $('show-all-devices').checked,
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
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
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
  updateComparisonOptions();
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
  renderRecords();
}
$('record-search').addEventListener('input', renderRecords);
$('update-record').addEventListener(
  'click',
  safe(async () => {
    const r = records.find((item) => item.id === selectedId);
    if (!r) return;
    r.title = $('record-title').value || 'Untitled experiment';
    r.notes = $('record-notes').value;
    await store.save(r);
    if (session?.id === r.id) {
      session.title = r.title;
      session.notes = r.notes;
      $('session-title').value = r.title;
    }
    await refreshRecords();
    notice('Research notes saved on this browser.');
  }),
);
$('delete-record').addEventListener(
  'click',
  safe(async () => {
    if (!selectedId) return;
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
    await store.remove(selectedId);
    clearTimeout(deleteTimer);
    await refreshRecords();
    selectRecord(null);
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
    download('sasori-backup.json', JSON.stringify(backup(all), null, 2), 'application/json');
  }),
);
$('import-file').addEventListener(
  'change',
  safe(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Import limit is 2 MB.');
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
  if (PROFILES.some((p) => p.id === settings.profile)) $('profile').value = settings.profile;
  if (typeof settings.service === 'string') $('svc').value = settings.service.slice(0, 128);
  if (typeof settings.notify === 'string') $('notify').value = settings.notify.slice(0, 128);
  syncProbeSelection();
  $('engineering').checked = settings.engineering === true;
  ready = true;
  updateMode();
  await refreshRecords();
  if (store.warning) notice(store.warning);
  log('info', 'Project Sasori v0.2.0 ready. No connection starts without your action.');
  navigate(location.hash.slice(1));
}
initialize().catch((error) => {
  ready = true;
  updateMode();
  problem(error);
});
