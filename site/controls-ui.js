import { CONTROL_ADAPTER } from './lib/standard-controls.js';
import { DeviceControls, CONTROL_FAMILIES, controlFamily } from './lib/device-controls.js';
import {
  trialFromAction,
  observeActionTrial,
  trialSummary,
  portableTrials,
  parseTrials,
  MAX_TRIAL_BYTES,
} from './lib/action-trials.js';
import {
  emptyControlSetups,
  rememberControlDevice,
  portableControlSetups,
  parseControlSetups,
  mergeControlSetups,
  MAX_CONTROL_SETUP_BYTES,
} from './lib/control-setups.js';

export async function mountControls({
  store,
  bluetooth,
  native = false,
  secure = true,
  download,
  canStart = () => true,
  changed = () => {},
}) {
  const $ = (id) => document.getElementById(id);
  const node = (tag, text, className = '') => {
    const el = document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  let setups = emptyControlSetups(),
    runner = null,
    demo = false,
    snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null },
    message = '',
    saving = false,
    actionRunning = false,
    runnerToken = 0,
    trials = [],
    selectedTrial = null,
    sourcesId = null;
  const granted = new Map();
  const selected = () => setups.targets.find((t) => t.id === $('u-device').value);
  const family = () => controlFamily($('u-family').value || CONTROL_ADAPTER.id);
  for (const descriptor of CONTROL_FAMILIES) {
    const option = node('option', descriptor.name);
    option.value = descriptor.id;
    $('u-family').append(option);
  }
  const status = (text) => {
    message = text;
    $('u-message').textContent = text;
  };
  const safe = (action) => (event) => {
    try {
      Promise.resolve(action(event)).catch((error) => {
        status(error.message);
        render();
      });
    } catch (error) {
      status(error.message);
      render();
    }
  };
  const active = () => ['connecting', 'connected'].includes(snapshot.state);
  const persist = async (next) => {
    saving = true;
    render();
    try {
      setups = await store.setControlSetups(next);
    } finally {
      saving = false;
      render();
    }
  };
  function renderTargets() {
    const chosen = setups.selectedId;
    $('u-device').replaceChildren();
    const first = node('option', 'Choose a new Bluetooth device');
    first.value = '';
    $('u-device').append(first);
    for (const target of setups.targets) {
      const option = node('option', target.label);
      option.value = target.id;
      $('u-device').append(option);
    }
    $('u-device').value = chosen;
    $('u-storage').textContent =
      (store.persistent
        ? 'Saved on this browser / app'
        : 'Temporary storage · export before closing') +
      ' · ' +
      setups.targets.length +
      ' / 20 devices';
  }
  function render() {
    const target = selected();
    $('u-state').textContent = (demo ? 'DEMO · ' : '') + snapshot.state;
    $('u-device-name').textContent = active()
      ? snapshot.label || 'Bluetooth device'
      : target?.label || 'No device selected';
    $('u-connect').disabled =
      active() || saving || actionRunning || !secure || !bluetooth?.requestDevice;
    $('u-connect').textContent = target ? 'Reconnect saved device' : 'Connect device';
    $('u-choose').disabled =
      active() || saving || actionRunning || !secure || !bluetooth?.requestDevice;
    $('u-demo').disabled = active() || saving || actionRunning;
    $('u-stop').disabled = !active();
    for (const intent of ['identify', 'status', 'alert'])
      $('u-' + intent).disabled =
        !snapshot.capabilities[intent] ||
        snapshot.busy ||
        snapshot.alerting ||
        actionRunning ||
        saving;
    for (const id of ['u-family', 'u-device', 'u-prefix', 'u-label', 'u-import'])
      $(id).disabled = active() || saving || actionRunning;
    $('u-save-name').disabled = active() || saving || !target;
    $('u-forget').disabled = active() || saving || !target;
    $('u-export').disabled = saving || !setups.targets.length;
    $('u-binding').textContent = target
      ? (native && target.deviceId) || granted.has(target.deviceId)
        ? 'Saved device reference available. Reconnect starts only when you press the button.'
        : 'Setup saved. Your platform may ask you to select the device again; the setup is kept.'
      : 'No UUID entry needed. Choose the device you want to connect.';
    $('u-values').replaceChildren();
    for (const [key, value] of Object.entries(snapshot.information || {}))
      $('u-values').append(node('dt', key), node('dd', value));
    $('u-battery').textContent =
      snapshot.statusText ||
      (snapshot.battery === null ? 'Battery: not read' : 'Battery: ' + snapshot.battery + '%');
    $('u-read-time').textContent = snapshot.lastReadAt
      ? 'Last read: ' +
        new Date(snapshot.lastReadAt).toLocaleTimeString() +
        (active() ? '' : ' · retained result, disconnected')
      : 'Use Identify or Status to read an available feature.';
    $('u-capabilities').replaceChildren();
    for (const [intent, label] of [
      ['identify', 'Model / firmware'],
      ['status', 'Battery status'],
      ['alert', family().id === CONTROL_ADAPTER.id ? 'Find / mild alert' : 'Blue chest LED'],
    ])
      $('u-capabilities').append(
        node(
          'li',
          label +
            ': ' +
            (snapshot.capabilities[intent]
              ? 'available in this connection'
              : active() && snapshot.state === 'connected'
                ? 'not exposed through this adapter'
                : 'check after connecting'),
        ),
      );
    if (!bluetooth?.requestDevice || !secure)
      $('u-platform').textContent =
        'Live controls need the native iPhone app or a secure Web Bluetooth browser. The demo works here.';
    else
      $('u-platform').textContent = native
        ? 'Native iPhone Bluetooth · ' + family().name
        : 'Web Bluetooth · ' + family().name;
    $('u-alert').textContent =
      family().id === CONTROL_ADAPTER.id ? 'Find / alert (1.5 s)' : 'Blue light (1.5 s)';
    $('u-check').disabled =
      !active() ||
      snapshot.state !== 'connected' ||
      snapshot.busy ||
      snapshot.alerting ||
      actionRunning ||
      saving ||
      !['identify', 'status', 'alert'].some((intent) => snapshot.capabilities[intent]);
    $('u-family-help').textContent =
      family().id === CONTROL_ADAPTER.id
        ? 'Standard identity, battery and mild-alert services; availability varies.'
        : 'Original WowWee MiP protocol only. Status/version queries and a dim blue LED action; no motion or sound commands. Selecting a model does not establish hardware verification.';
    if (sourcesId !== family().id) {
      sourcesId = family().id;
      $('u-sources').replaceChildren();
      for (const [index, href] of family().sources.entries()) {
        const label =
          family().id === CONTROL_ADAPTER.id
            ? [
                'Device Information',
                'Battery Service',
                'Immediate Alert',
                'Assigned UUIDs',
                'Find Me alert levels',
              ][index]
            : ['MiP transport / ASCII framing', 'MiP command table'][index];
        const link = node('a', label);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const item = node('li', '');
        item.append(link);
        $('u-sources').append(item);
      }
    }
    if (message) $('u-message').textContent = message;
    changed(active(), demo);
  }
  async function refreshPermissions() {
    // Reading previously granted references does not scan, connect, or prompt.
    if (!native && typeof bluetooth?.getDevices === 'function') {
      try {
        for (const d of await bluetooth.getDevices())
          if (typeof d.id === 'string') granted.set(d.id, d);
      } catch {
        /* Chooser remains available. */
      }
    }
    render();
  }
  function makeRunner(isDemo) {
    demo = isDemo;
    const token = ++runnerToken;
    runner = new DeviceControls({
      adapterId: family().id,
      synthetic: isDemo,
      bluetooth,
      emit: (event) => {
        if (token !== runnerToken) return;
        snapshot = event;
        if (event.message) status(event.message);
        $('u-demo-effect').hidden = !(demo && event.alerting);
        render();
      },
    });
    return runner;
  }
  async function captureAction(action, target) {
    if (!action || !target) return;
    const row = trialFromAction(action, target);
    await store.saveActionTrials([row]);
    trials = await store.getActionTrials();
    selectedTrial = row.id;
    renderTrials();
  }
  async function perform(intent) {
    if (!runner || actionRunning || saving) return;
    const current = runner,
      target = selected() || (demo ? { id: 'control-demo', label: 'Synthetic demo' } : null);
    actionRunning = true;
    render();
    try {
      if (intent === 'check') await current.runCheck();
      else await current.dispatch(intent);
    } catch (error) {
      status(error.message);
    } finally {
      try {
        if (current.lastAction) await captureAction(current.lastAction, target);
      } catch (error) {
        status('Action finished; trial could not be saved: ' + error.message);
      }
      actionRunning = false;
      render();
    }
  }
  async function connect(isDemo, forceChooser = false) {
    if (active() || saving || actionRunning) return;
    if (!canStart())
      throw new Error('Stop the current inspection before opening another connection.');
    const target = selected(),
      prefix = $('u-prefix').value.trim(),
      label = $('u-label').value.trim();
    const current = makeRunner(isDemo);
    const connection = current.connect({
      device: !isDemo && !forceChooser && target ? granted.get(target.deviceId) || null : null,
      namePrefix: !forceChooser && target ? target.namePrefix : prefix,
      rememberedId: !isDemo && !forceChooser ? target?.deviceId || '' : '',
    });
    try {
      await connection;
      if (runner !== current || !active() || isDemo) return;
      const device = current.device;
      if (typeof device.id === 'string') granted.set(device.id, device);
      try {
        const next = rememberControlDevice(setups, device, {
          adapterId: family().id,
          targetId: !forceChooser ? target?.id || '' : '',
          label: forceChooser ? label : target?.label || label,
          namePrefix: !forceChooser && target ? target.namePrefix : prefix,
        });
        await persist(next);
        renderTargets();
        renderTrials();
        render();
      } catch (error) {
        status('Connected, but this setup could not be saved: ' + error.message);
      }
    } catch (error) {
      if (runner === current && error.name !== 'AbortError') status(error.message);
      if (target && current.lastAction) {
        try {
          await captureAction(current.lastAction, target);
        } catch (saveError) {
          status(saveError.message);
        }
      }
    }
    render();
  }
  $('u-connect').addEventListener(
    'click',
    safe(() => connect(false)),
  );
  $('u-choose').addEventListener(
    'click',
    safe(() => connect(false, true)),
  );
  $('u-demo').addEventListener(
    'click',
    safe(() => connect(true)),
  );
  for (const intent of ['identify', 'status', 'alert'])
    $('u-' + intent).addEventListener(
      'click',
      safe(() => perform(intent)),
    );
  $('u-stop').addEventListener('click', () => runner?.stop());
  $('u-check').addEventListener(
    'click',
    safe(() => perform('check')),
  );
  $('u-family').addEventListener(
    'change',
    safe(async () => {
      if (active()) return;
      $('u-device').value = '';
      snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null };
      demo = false;
      await persist({ ...setups, selectedId: '' });
      renderTrials();
      status('Protocol family selected. Choose your matching device.');
    }),
  );
  $('u-device').addEventListener(
    'change',
    safe(async () => {
      const next = { ...setups, selectedId: $('u-device').value };
      const target = next.targets.find((t) => t.id === next.selectedId);
      $('u-family').value = target?.adapterId || family().id;
      $('u-label').value = target?.label || '';
      $('u-prefix').value = target?.namePrefix || '';
      snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null };
      demo = false;
      await persist(next);
      renderTrials();
      status('Setup selected. Press Connect to continue.');
    }),
  );
  $('u-save-name').addEventListener(
    'click',
    safe(async () => {
      const target = selected();
      if (!target || active()) return;
      const next = {
        ...setups,
        targets: setups.targets.map((t) =>
          t.id === target.id
            ? { ...t, label: $('u-label').value.trim(), namePrefix: $('u-prefix').value.trim() }
            : t,
        ),
      };
      await persist(next);
      renderTargets();
      render();
      status('Name and connection filter saved.');
    }),
  );
  $('u-forget').addEventListener(
    'click',
    safe(async () => {
      const target = selected();
      if (!target || active()) return;
      await persist({
        ...setups,
        selectedId: '',
        targets: setups.targets.filter((t) => t.id !== target.id),
      });
      renderTargets();
      renderTrials();
      $('u-label').value = '';
      $('u-prefix').value = '';
      render();
      status(
        'Saved setup removed. Bluetooth permission is managed by your browser or system settings.',
      );
    }),
  );
  $('u-export').addEventListener(
    'click',
    safe(() =>
      download(
        'sasori-controls.json',
        JSON.stringify(portableControlSetups(setups), null, 2),
        'application/json',
      ),
    ),
  );
  $('u-import').addEventListener(
    'change',
    safe(async (event) => {
      const input = event.target;
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (active() || saving) throw new Error('Stop the connection before importing setups.');
        if (file.size > MAX_CONTROL_SETUP_BYTES)
          throw new Error('Control setup import limit is 64 KB.');
        const incoming = parseControlSetups(await file.text());
        await persist(mergeControlSetups(setups, incoming));
        renderTargets();
        renderTrials();
        render();
        status(
          'Imported setups as new copies. Select a device once to bind each imported setup on this platform.',
        );
      } finally {
        input.value = '';
      }
    }),
  );
  $('u-report').addEventListener(
    'click',
    safe(() =>
      download(
        'sasori-control-report.json',
        JSON.stringify(
          {
            format: 'sasori.control-report',
            schemaVersion: 1,
            source: demo ? 'synthetic' : 'local-device-observation',
            adapterId: snapshot.adapterId || family().id,
            state: snapshot.state,
            information: snapshot.information,
            battery: snapshot.battery,
            statusText: snapshot.statusText || '',
            lastReadAt: snapshot.lastReadAt,
            observedCapabilities: snapshot.capabilities,
            authenticationVerified: false,
            physicalEffectVerified: false,
          },
          null,
          2,
        ),
        'application/json',
      ),
    ),
  );
  function renderTrials() {
    const target = selected(),
      rows = trials
        .filter((r) => (!target || $('u-trials-all').checked ? true : r.targetId === target.id))
        .slice()
        .reverse();
    $('u-trial-list').replaceChildren();
    for (const row of rows) {
      const button = node(
        'button',
        `${row.label} · ${new Date(row.startedAt).toLocaleTimeString()} · ${row.intent} · ${row.outcome} · ${row.source}`,
        'secondary',
      );
      button.addEventListener('click', () => {
        selectedTrial = row.id;
        renderTrials();
      });
      $('u-trial-list').append(button);
    }
    const row = trials.find((r) => r.id === selectedTrial && rows.some((s) => s.id === r.id));
    $('u-trial-summary').textContent = target
      ? trialSummary(trials, target.id).label
      : 'Choose a saved device to review fresh-connection checks. Showing all saved trials; demo and imported claims never count.';
    $('u-trial-detail').textContent = row
      ? `${row.model} · ${row.firmware} · ${row.durationMs} ms · ${row.cleanup} · ${row.error || row.stages.join('; ')}`
      : 'Run a connection check, then record what you observed on the device.';
    $('u-observed').value = row?.observed || 'not-tested';
    $('u-recovered').value = row?.recovered || 'not-tested';
    $('u-trial-notes').value = row?.notes || '';
    $('u-observation-save').disabled = !row;
    $('u-trial-remove').disabled = !row;
    $('u-trials-export').disabled = !trials.length;
  }
  $('u-trials-all').addEventListener('change', renderTrials);
  $('u-trial-remove').addEventListener(
    'click',
    safe(async () => {
      if (!selectedTrial) return;
      await store.removeActionTrial(selectedTrial);
      selectedTrial = null;
      trials = await store.getActionTrials();
      renderTrials();
      status('Selected trial removed.');
    }),
  );
  $('u-observation-save').addEventListener(
    'click',
    safe(async () => {
      const row = trials.find((r) => r.id === selectedTrial);
      if (!row) return;
      const updated = observeActionTrial(row, {
        observed: $('u-observed').value,
        recovered: $('u-recovered').value,
        notes: $('u-trial-notes').value,
      });
      await store.saveActionTrials([updated]);
      trials = await store.getActionTrials();
      renderTrials();
      status(
        'Owner observation saved. It does not certify authentication or independent hardware verification.',
      );
    }),
  );
  $('u-trials-export').addEventListener(
    'click',
    safe(() =>
      download(
        'sasori-action-trials.json',
        JSON.stringify(portableTrials(trials), null, 2),
        'application/json',
      ),
    ),
  );
  $('u-trials-import').addEventListener(
    'change',
    safe(async (event) => {
      const input = event.target;
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_TRIAL_BYTES) throw new Error('Trial import limit is 400 KB.');
        const rows = parseTrials(await file.text());
        await store.saveActionTrials(rows);
        trials = await store.getActionTrials();
        renderTrials();
        status('Trials imported as claims; they do not count as local hardware checks.');
      } finally {
        input.value = '';
      }
    }),
  );
  try {
    setups = await store.getControlSetups();
  } catch (error) {
    status('Saved control setups could not be loaded: ' + error.message);
  }
  try {
    trials = await store.getActionTrials();
  } catch (error) {
    status('Saved action trials could not be loaded: ' + error.message);
  }
  renderTargets();
  $('u-family').value = selected()?.adapterId || CONTROL_ADAPTER.id;
  renderTrials();
  $('u-label').value = selected()?.label || '';
  $('u-prefix').value = selected()?.namePrefix || '';
  render();
  refreshPermissions();
  return {
    isActive: active,
    stop: (reason) => {
      if (active())
        runner?.stop(
          reason === 'page-hidden'
            ? 'Paused while Sasori is hidden. Your saved setup is kept.'
            : 'Stopped. Your saved setup is kept.',
        );
    },
    useToy(toy) {
      if (active()) throw new Error('Stop the current connection before choosing another device.');
      $('u-device').value = '';
      $('u-family').value = CONTROL_ADAPTER.id;
      $('u-label').value = toy.label;
      $('u-prefix').value = toy.namePrefix || '';
      snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null };
      demo = false;
      renderTrials();
      status(
        'Ready to check standard controls for ' +
          toy.label +
          '. Proprietary actions still use a matching device adapter.',
      );
      render();
    },
  };
}
