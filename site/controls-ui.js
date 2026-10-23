import { StandardControls, CONTROL_ADAPTER, createControlDemo } from './lib/standard-controls.js';
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
    saving = false;
  const granted = new Map();
  const selected = () => setups.targets.find((t) => t.id === $('u-device').value);
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
    $('u-connect').disabled = active() || saving || !secure || !bluetooth?.requestDevice;
    $('u-connect').textContent = target ? 'Reconnect saved device' : 'Connect device';
    $('u-choose').disabled = active() || saving || !secure || !bluetooth?.requestDevice;
    $('u-demo').disabled = active() || saving;
    $('u-stop').disabled = !active();
    for (const intent of ['identify', 'status', 'alert'])
      $('u-' + intent).disabled =
        !snapshot.capabilities[intent] || snapshot.busy || snapshot.alerting;
    for (const id of ['u-device', 'u-prefix', 'u-label', 'u-import'])
      $(id).disabled = active() || saving;
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
      snapshot.battery === null ? 'Battery: not read' : 'Battery: ' + snapshot.battery + '%';
    $('u-read-time').textContent = snapshot.lastReadAt
      ? 'Last read: ' +
        new Date(snapshot.lastReadAt).toLocaleTimeString() +
        (active() ? '' : ' · retained result, disconnected')
      : 'Use Identify or Status to read an available feature.';
    $('u-capabilities').replaceChildren();
    for (const [intent, label] of [
      ['identify', 'Model / firmware'],
      ['status', 'Battery status'],
      ['alert', 'Find / mild alert'],
    ])
      $('u-capabilities').append(
        node(
          'li',
          label +
            ': ' +
            (snapshot.capabilities[intent]
              ? 'available in this connection'
              : active() && snapshot.state === 'connected'
                ? 'not exposed through these standard services'
                : 'check after connecting'),
        ),
      );
    if (!bluetooth?.requestDevice || !secure)
      $('u-platform').textContent =
        'Live controls need the native iPhone app or a secure Web Bluetooth browser. The demo works here.';
    else
      $('u-platform').textContent = native
        ? 'Native iPhone Bluetooth · shared standard controls'
        : 'Web Bluetooth · shared standard controls';
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
    runner = new StandardControls({
      bluetooth: isDemo ? createControlDemo() : bluetooth,
      emit: (event) => {
        snapshot = event;
        if (event.message) status(event.message);
        $('u-demo-effect').hidden = !(demo && event.alerting);
        render();
      },
    });
    return runner;
  }
  async function connect(isDemo, forceChooser = false) {
    if (active() || saving) return;
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
          targetId: !forceChooser ? target?.id || '' : '',
          label: forceChooser ? label : target?.label || label,
          namePrefix: !forceChooser && target ? target.namePrefix : prefix,
        });
        await persist(next);
        renderTargets();
        render();
      } catch (error) {
        status('Connected, but this setup could not be saved: ' + error.message);
      }
    } catch (error) {
      if (runner === current && error.name !== 'AbortError') status(error.message);
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
  for (const intent of ['identify', 'status', 'alert', 'stop'])
    $('u-' + intent).addEventListener(
      'click',
      safe(() => runner?.dispatch(intent)),
    );
  $('u-device').addEventListener(
    'change',
    safe(async () => {
      const next = { ...setups, selectedId: $('u-device').value };
      const target = next.targets.find((t) => t.id === next.selectedId);
      $('u-label').value = target?.label || '';
      $('u-prefix').value = target?.namePrefix || '';
      snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null };
      demo = false;
      await persist(next);
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
            adapterId: CONTROL_ADAPTER.id,
            state: snapshot.state,
            information: snapshot.information,
            battery: snapshot.battery,
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
  $('u-sources').replaceChildren();
  for (const [index, href] of CONTROL_ADAPTER.sources.entries()) {
    const a = node(
      'a',
      [
        'Device Information',
        'Battery Service',
        'Immediate Alert',
        'Assigned UUIDs',
        'Find Me alert levels',
      ][index],
    );
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const item = node('li', '');
    item.append(a);
    $('u-sources').append(item);
  }
  try {
    setups = await store.getControlSetups();
  } catch (error) {
    status('Saved control setups could not be loaded: ' + error.message);
  }
  renderTargets();
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
      $('u-label').value = toy.label;
      $('u-prefix').value = toy.namePrefix || '';
      snapshot = { state: 'idle', busy: false, capabilities: {}, information: {}, battery: null };
      demo = false;
      status(
        'Ready to check standard controls for ' +
          toy.label +
          '. Proprietary actions still use a matching device adapter.',
      );
      render();
    },
  };
}
