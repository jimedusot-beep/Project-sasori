import { setupIRImport } from './pocket-ir-import-ui.js';
import { PocketIRSession, createPocketDemo } from './lib/pocket-ir.js';
import { POCKET_PROFILES } from './lib/pocket-ir-profiles.js';
import {
  emptyPocketData,
  importPocketProfile,
  validatePocketProfile,
} from './lib/pocket-ir-setups.js';
import { ResearchStore } from './lib/storage.js';
const $ = (id) => document.getElementById(id);
const store = await new ResearchStore().open();
let data = emptyPocketData(),
  writable = true,
  acting = false,
  demo = false,
  session = null,
  preparedId = '',
  attempts = 0,
  irImport = null;
try {
  data = await store.getPocketData();
} catch {
  writable = false;
  $('storage-status').textContent = 'Saved setups could not be read. Reload before saving.';
}
if (writable)
  $('storage-status').textContent = store.persistent
    ? 'Setups stay in this browser. No account or uploads.'
    : store.warning;
const allProfiles = () => [...POCKET_PROFILES, ...data.profiles];
const chosen = () => allProfiles().find((p) => p.id === data.selected);
function record(message) {
  const item = document.createElement('li');
  item.textContent = (demo ? 'DEMO · ' : '') + String(message).slice(0, 180);
  $('events').prepend(item);
  while ($('events').children.length > 20) $('events').lastElementChild.remove();
}
function options() {
  $('profile').replaceChildren(
    ...allProfiles().map((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      return option;
    }),
  );
  $('profile').value = data.selected;
}
function render() {
  const profile = chosen(),
    connected = !!session?.connected,
    free = !acting && !session?.busy;
  const allowed = demo || $('owner-check').checked;
  const ready =
    connected &&
    preparedId === profile.id &&
    profile.buttons.every((b) => session.prepared.has(b.slot));
  $('profile').value = data.selected;
  $('profile').disabled = !free;
  $('connect').disabled = !$('owner-check').checked || connected || !free;
  $('demo').disabled = connected || !free;
  $('disconnect').disabled = !connected && !acting;
  $('prepare').disabled = !allowed || !connected || !free;
  $('save').disabled = !writable || !free;
  $('import').disabled = !writable || !free;
  $('delete').disabled = !writable || !free || !data.profiles.some((p) => p.id === profile.id);
  $('mode').textContent = demo ? 'OFFLINE DEMO · NO RADIO' : 'EXPERIMENTAL · ESP32 IR BRIDGE';
  $('profile-source').textContent =
    (POCKET_PROFILES.some((p) => p.id === profile.id) ? '' : 'User-supplied profile. ') +
    profile.source;
  $('ready-status').textContent = ready
    ? 'Remote ready · five slots maximum · one press, one request.'
    : 'Connect, then prepare this remote. Preparation stores buttons without emitting IR.';
  $('attempts').textContent = String(attempts);
  $('remote').replaceChildren(
    ...profile.buttons.map((button) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.textContent = button.label;
      key.className =
        button.id === 'power_toggle' || /^power$/i.test(button.label)
          ? 'remote-key power'
          : 'remote-key';
      key.disabled = !allowed || !ready || !free;
      key.addEventListener('click', () =>
        perform(async () => {
          if (preparedId !== chosen().id || (!demo && !$('owner-check').checked)) return;
          await session.transmit(button.slot);
          attempts++;
          record(button.label + ': bridge reports transmit attempted; physical effect unverified.');
        }),
      );
      return key;
    }),
  );
  irImport?.refresh();
}

async function perform(operation) {
  if (acting) return;
  acting = true;
  render();
  try {
    await operation();
    return { ok: true };
  } catch (error) {
    $('connection').textContent = error.message || 'Request failed. Reconnect and try again.';
    record($('connection').textContent);
    return { ok: false, message: $('connection').textContent };
  } finally {
    acting = false;
    render();
  }
}
function makeSession(isDemo) {
  demo = isDemo;
  preparedId = '';
  attempts = 0;
  session = new PocketIRSession({
    bluetooth: isDemo ? createPocketDemo() : navigator.bluetooth,
    onState: (message) => {
      if (!session.connected) preparedId = '';
      $('connection').textContent = (demo ? 'Demo: ' : '') + message;
      record(message);
      render();
    },
    onStatus: (status) => {
      record(status.message);
      render();
    },
  });
}
function stop(reason) {
  preparedId = '';
  session?.disconnect(reason);
  irImport?.cancelRead();
  render();
}
async function persist(next) {
  data = await store.setPocketData(next);
  options();
  $('storage-status').textContent = store.persistent
    ? 'Saved in this browser. Reopening never sends commands.'
    : 'Temporary setup only. Export before closing.';
}
$('connect').addEventListener('click', () =>
  perform(async () => {
    if (!$('owner-check').checked) return;
    makeSession(false);
    await session.connect();
  }),
);
$('demo').addEventListener('click', () =>
  perform(async () => {
    makeSession(true);
    await session.connect();
  }),
);
$('disconnect').addEventListener('click', () =>
  stop('Stopped. No further requests; emitted IR cannot be recalled.'),
);
$('prepare').addEventListener('click', () =>
  perform(async () => {
    if (!demo && !$('owner-check').checked) return;
    const profile = chosen();
    preparedId = '';
    session.clearPrepared();
    for (const button of profile.buttons) {
      $('connection').textContent = 'Preparing ' + button.label + '…';
      await session.configure(button);
    }
    preparedId = profile.id;
    $('connection').textContent = demo
      ? 'Demo remote ready. No real IR will be emitted.'
      : 'Remote ready. Point your bridge at your appliance.';
  }),
);
$('profile').addEventListener('change', () => {
  const selected = $('profile').value;
  return perform(async () => {
    preparedId = '';
    session?.clearPrepared();
    const next = { ...data, selected };
    if (writable) await persist(next);
    else data = next;
  });
});
$('owner-check').addEventListener('change', () => {
  if (!$('owner-check').checked && !demo) stop('Permission unchecked. Connection closed.');
  render();
});
$('save').addEventListener('click', () =>
  perform(async () => {
    const profile = chosen();
    const id = data.profiles.some((p) => p.id === profile.id) ? profile.id : 'custom-' + profile.id;
    const copy = validatePocketProfile({
      ...profile,
      id,
      name: $('setup-name').value.trim() || profile.name,
    });
    const epoch = session?.epoch;
    const wasPrepared = preparedId === profile.id;
    await persist(importPocketProfile(JSON.stringify(copy), data));
    // A label-only saved copy has identical bytes; do not reprogram a ready bridge.
    preparedId = wasPrepared && session?.connected && session.epoch === epoch ? copy.id : '';
  }),
);
$('export').addEventListener('click', () => {
  const profile = chosen(),
    copy = {
      ...profile,
      id: POCKET_PROFILES.some((p) => p.id === profile.id) ? 'custom-' + profile.id : profile.id,
    };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = copy.id + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('edit').addEventListener('click', () => {
  const profile = chosen();
  $('profile-json').value = JSON.stringify(
    { ...profile, id: profile.id.startsWith('custom-') ? profile.id : 'custom-' + profile.id },
    null,
    2,
  );
});
$('import').addEventListener('click', () =>
  perform(async () => {
    const next = importPocketProfile($('profile-json').value, data);
    await persist(next);
    preparedId = '';
    session?.clearPrepared();
  }),
);
$('delete').addEventListener('click', () =>
  perform(async () => {
    await persist({
      ...data,
      selected: POCKET_PROFILES[0].id,
      profiles: data.profiles.filter((p) => p.id !== data.selected),
    });
    preparedId = '';
    session?.clearPrepared();
  }),
);
$('clear-events').addEventListener('click', () => $('events').replaceChildren());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop('Page hidden. Reconnect and prepare again.');
    irImport?.clear();
  }
});
window.addEventListener('pagehide', () => {
  stop('Page closed.');
  irImport?.clear();
});
irImport = setupIRImport({
  canUse: () => !acting && !session?.busy,
  canSave: () => writable && !acting && !session?.busy,
  saveProfile: (profile) =>
    perform(async () => {
      const next = importPocketProfile(JSON.stringify(profile), data);
      await persist(next);
      preparedId = '';
      session?.clearPrepared();
    }),
});
options();
render();
