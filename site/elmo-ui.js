import { ElmoRemote, createElmoDemo } from './lib/elmo-remote.js';
import { ELMO_INPUTS } from './lib/elmo-codec.js';
import { deviceDetailModel, mountDeviceDetail } from './lib/device-detail.js';

const $ = (id) => document.getElementById(id);
const updateDeviceDetail = mountDeviceDetail(document.querySelector('.controls-card'));

const labels = [
  'Left hand',
  'Right hand',
  'Belly',
  'Clap',
  'Left + belly',
  'Right + belly',
  'Nose',
];
const errors = {
  'password-required':
    'Enter your existing Elmo password, or a new one for setup (4–128 characters).',
  'password-rejected':
    'Elmo rejected that password. Check the toy’s existing password and reconnect.',
  'password-not-set':
    'Elmo reports no password is set. Enter a new password, select “Set this password if Elmo reports none”, and reconnect.',
  'password-setup-not-confirmed':
    'Elmo still reports no password after setup. No second setup write was sent. Save the result before retrying.',
  'selection-cancelled': 'No toy selected. Your next connection is one click away.',
  'browser-unavailable': 'Open this link in Chrome on a computer, or Bluefy on iPhone / iPad.',
  'unsupported-device':
    'This toy does not expose the expected Elmo channels. Try connection inspection in the laboratory.',
  'malformed-authentication':
    'Elmo sent an unsupported authentication reply. The connection was closed.',
  'unsupported-notification': 'Elmo sent an unsupported notification. The connection was closed.',
  'unsolicited-acceptance':
    'The reply arrived before Sasori’s challenge response. Connect again to make a fresh check.',
  'changed-challenge': 'The authentication challenge changed. Reconnect to make a fresh check.',
  'authentication-timeout':
    'No accepted handshake arrived in time. Close other Elmo apps, check the password, and reconnect.',
  'operation-timeout': 'Bluetooth took too long. Check Elmo’s power and range, then reconnect.',
  'session-timeout': 'This 30-second connection has ended. Enter the password again to reconnect.',
  'connection-lost': 'Elmo disconnected. Check its power and range, then reconnect.',
  'notification-limit': 'The notification limit was reached. Reconnect for a fresh session.',
  'page-hidden':
    'Disconnected while the page was hidden. Keep this page open during a live connection.',
  'bluetooth-error':
    'The Bluetooth connection failed. Check Bluetooth permission, toy power, and competing apps.',
  'user-stop': 'Disconnected. You can reconnect when you’re ready.',
  'not-ready': 'Connect and finish authentication before using that action.',
};
let runner = null,
  lastLiveDevice = null;
let state = { state: 'idle', busy: false, synthetic: false, report: null };
const supported =
  window.isSecureContext && typeof navigator.bluetooth?.requestDevice === 'function';
const active = () => ['choosing', 'connecting', 'authenticating', 'ready'].includes(state.state);
const sensors = ELMO_INPUTS.map((name, index) => {
  const item = document.createElement('li');
  item.textContent = labels[index];
  item.dataset.sensor = name;
  $('elmo-inputs').append(item);
  return item;
});
function render(next = state) {
  const wasReady = state.state === 'ready' && !state.busy;
  state = next;
  const connected = state.state === 'ready',
    working = active(),
    report = state.report;
  $('mode').textContent = state.synthetic ? 'DEMO' : 'LIVE';
  $('demo-note').hidden = !state.synthetic;
  $('elmo-password').disabled = working;
  $('allow-password-setup').disabled = working;
  $('show-all').disabled = working;
  $('elmo-connect').disabled = working || !supported;
  $('elmo-connect').textContent = working
    ? 'Connection in progress'
    : lastLiveDevice
      ? 'Reconnect Elmo →'
      : 'Connect Elmo →';
  $('elmo-demo').disabled = working;
  $('elmo-choose').hidden = !lastLiveDevice;
  $('elmo-choose').disabled = working || !supported;
  $('elmo-greet').disabled = !connected || state.busy || report?.soundRequestedId != null;
  $('elmo-status').disabled = !connected || state.busy;
  $('elmo-disconnect').disabled = !working;
  $('elmo-save').disabled = working || !report;
  $('elmo-device').textContent = working || report ? state.deviceName || 'YOUR ELMO' : 'YOUR ELMO';
  $('controls-title').textContent =
    {
      idle: 'Let’s connect.',
      choosing: 'Choose your Elmo.',
      connecting: 'Making contact…',
      authenticating: 'Checking the password…',
      ready: report?.helloQueued ? 'Hello requested.' : 'Ready to greet.',
      disconnected: 'See you next time.',
    }[state.state] || 'Let’s connect.';
  $('elmo-sticky-session').hidden = !working;
  $('elmo-sticky-state').textContent = state.synthetic
    ? 'Demo · no real device'
    : connected
      ? 'Connected · Love2Learn Elmo'
      : 'Connecting · press Stop to cancel';
  $('elmo-sticky-stop').disabled = !working;
  updateDeviceDetail(
    deviceDetailModel({
      deviceName: state.deviceName || 'Love2Learn Elmo',
      familyName: 'Love2Learn Elmo',
      state: state.state,
      synthetic: !!state.synthetic,
      canConnect: supported,
      nativeUnsupported: !!globalThis.SasoriNativeBluetooth,
      lastAction: report?.helloQueued ? 'greeting-requested' : '',
      failure:
        state.state === 'disconnected' &&
        !!report?.reason &&
        !['user-stop', 'page-hidden'].includes(report.reason),
    }),
  );
  $('elmo-state').textContent =
    state.synthetic && connected
      ? 'Demo · ready'
      : connected
        ? 'Toy reported acceptance'
        : working
          ? 'Connecting'
          : 'Not connected';
  $('elmo-volume').textContent = report?.volume == null ? 'Unknown' : report.volume + ' / 15';
  for (const [i, sensor] of sensors.entries()) {
    const reported = report?.inputs?.[ELMO_INPUTS[i]];
    sensor.classList.toggle('on', reported === true);
    sensor.textContent =
      labels[i] + (reported == null ? ' · unknown' : reported ? ' · active' : ' · inactive');
  }
  $('step-device').classList.toggle(
    'done',
    ['connecting', 'authenticating', 'ready'].includes(state.state),
  );
  $('step-password').classList.toggle(
    'done',
    report?.authenticationOutcome === 'toy-reported-acceptance',
  );
  $('step-ready').classList.toggle('done', connected && !state.busy);
  $('playback-note').hidden = !report?.helloQueued || state.synthetic;
  $('elmo-message').textContent =
    state.state === 'disconnected'
      ? errors[report?.reason] || 'Connection ended. Reconnect for a fresh check.'
      : state.state === 'choosing'
        ? 'Select your own Love2Learn Elmo in the Bluetooth chooser.'
        : state.state === 'connecting'
          ? 'Checking the toy’s Bluetooth connection and channels…'
          : state.state === 'authenticating'
            ? report?.passwordSetupOutcome === 'write-requested'
              ? 'Elmo reported no password. Sending your chosen password and waiting for explicit acceptance…'
              : 'Waiting for Elmo’s challenge and explicit password acceptance…'
            : connected && state.busy
              ? 'Reading the toy’s available state…'
              : connected && report?.helloQueued
                ? state.synthetic
                  ? 'Demo greeting request completed. No real toy was commanded.'
                  : 'Greeting request sent. Listen to your toy; actual playback still needs your observation.'
                : connected
                  ? state.synthetic
                    ? 'The demo handshake is complete. Try the simulated greeting.'
                    : report?.passwordSetupOutcome === 'toy-reported-acceptance'
                      ? 'Elmo reported new-password acceptance. Try the greeting, then reconnect with your password to check that it was retained.'
                      : 'Elmo reported password acceptance. You can now request one greeting.'
                  : 'Enter your toy’s password, then choose Connect Elmo.';
  if (state.state === 'disconnected' && report?.passwordSetupOutcome === 'not-confirmed')
    $('elmo-message').textContent +=
      ' The new password may already be stored. Save this result, then try that password again with setup unchecked.';
  countdown();
  if (connected && !state.busy && !wasReady && matchMedia('(max-width: 720px)').matches)
    $('controls-title').scrollIntoView({ block: 'start', behavior: 'auto' });
}
function countdown() {
  $('remaining').textContent = state.deadlineAt
    ? Math.max(0, Math.ceil((state.deadlineAt - Date.now()) / 1000)) + 's remaining'
    : '';
}
function handle(action) {
  return () => {
    try {
      Promise.resolve(action()).catch((error) => {
        if (error.code !== 'cancelled')
          $('elmo-message').textContent = errors[error.code] || errors['bluetooth-error'];
        if (!runner?.synthetic && runner?.device) lastLiveDevice = runner.device;
        renderButtons();
      });
    } catch {
      $('elmo-message').textContent = errors['bluetooth-error'];
    }
  };
}
function renderButtons() {
  if (!active()) {
    $('elmo-connect').textContent = lastLiveDevice ? 'Reconnect Elmo →' : 'Connect Elmo →';
    $('elmo-choose').hidden = !lastLiveDevice;
  }
}
async function connect(demo, chooseAnother = false) {
  if (active()) return;
  const password = demo ? 'Lab-Only-42' : $('elmo-password').value;
  if (!demo && (password.length < 4 || password.length > 128)) {
    $('elmo-message').textContent = errors['password-required'];
    $('elmo-password').focus();
    return;
  }
  $('elmo-password').value = '';
  runner = new ElmoRemote({
    bluetooth: demo ? createElmoDemo() : navigator.bluetooth,
    synthetic: demo,
    emit: render,
  });
  await runner.connect({
    password,
    device: demo || chooseAnother ? null : lastLiveDevice,
    showAll: $('show-all').checked,
    allowPasswordSetup: $('allow-password-setup').checked,
  });
  if (!demo) lastLiveDevice = runner.device;
  renderButtons();
}
$('elmo-connect').addEventListener(
  'click',
  handle(() => connect(false)),
);
$('elmo-choose').addEventListener(
  'click',
  handle(() => connect(false, true)),
);
$('elmo-demo').addEventListener(
  'click',
  handle(() => connect(true)),
);
$('elmo-greet').addEventListener(
  'click',
  handle(() => runner.greet()),
);
$('elmo-status').addEventListener(
  'click',
  handle(() => runner.readStatus()),
);
$('elmo-disconnect').addEventListener('click', () => runner?.stop());
$('elmo-sticky-stop').addEventListener('click', () => runner?.stop());
$('elmo-password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('elmo-connect').click();
  }
});
$('elmo-save').addEventListener(
  'click',
  handle(() => {
    const result = runner?.result();
    if (!result || active()) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sasori-elmo-' + Date.now() + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }),
);
const hide = () => {
  $('elmo-password').value = '';
  runner?.stop('page-hidden');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
});
window.addEventListener('pagehide', hide);
setInterval(countdown, 1000);
$('browser-title').textContent = supported
  ? 'Your browser offers Bluetooth access.'
  : 'Use Chrome or Bluefy to connect your toy.';
$('browser-help').textContent = supported
  ? 'Choose Connect Elmo when you’re ready. Allow Bluetooth access if your browser asks.'
  : 'This browser cannot make the Bluetooth connection required here. Open this same link in Chrome on your computer, or Bluefy on iPhone / iPad. The demo works here now.';
$('browser-links').hidden = supported;
render();
$('elmo-demo').disabled = false;
