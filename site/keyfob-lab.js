import {
  CONDITIONS,
  frequencyBandEnergy,
  shouldTriggerClick,
  calibrateNoise,
  recordTrial,
  summarizeTrials,
  csvForTrials,
} from './lib/keyfob-audio.js?v=keyfob-audio-3';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_TRIALS = 100;
let stream = null,
  audioContext = null,
  analyser = null,
  buffer = null;
let source = null,
  animation = 0;
let phase = 'off',
  generation = 0,
  calibrated = false,
  background = 0;
let threshold = 45,
  lastEventAt = -Infinity,
  liveClicks = 0;
let microphonePermission = 'not requested';
let calibrationSamples = [],
  capture = null,
  trials = [],
  frameNumber = 0;

function label(condition) {
  return CONDITIONS.find((entry) => entry.id === condition)?.label ?? condition;
}
function status(message) {
  $('mic-status').textContent = message;
}
function microphoneDiagnostics() {
  const track = stream?.getAudioTracks?.()[0] ?? stream?.getTracks?.()[0];
  const engineState = audioContext?.state ?? 'off';
  const trackState = track
    ? (track.readyState ?? 'unknown') +
      (track.muted ? ', muted' : '') +
      (track.enabled === false ? ', disabled' : '')
    : 'off';
  $('mic-diagnostics').textContent =
    'Permission: ' +
    microphonePermission +
    ' · Audio engine: ' +
    engineState +
    ' · Microphone track: ' +
    trackState;
}
function controls() {
  const available = phase === 'ready';
  $('mic-start').disabled = phase !== 'off';
  $('mic-stop').disabled = phase === 'off';
  $('mic-resume').disabled = !audioContext || (phase !== 'ready' && phase !== 'calibrating');
  $('mic-calibrate').disabled = !available;
  $('trial-start').disabled = !available || !calibrated || trials.length >= MAX_TRIALS;
  $('condition').disabled = !available;
  $('sensitivity').disabled =
    phase === 'countdown' || phase === 'capturing' || phase === 'calibrating';
  for (const id of ['export-json', 'export-csv', 'clear-trials']) $(id).disabled = !trials.length;
  microphoneDiagnostics();
}
function thresholdUpdate() {
  threshold = Number($('sensitivity').value);
  $('threshold-value').textContent = String(threshold);
  $('level-label').textContent =
    'Room noise: ' +
    background.toFixed(1) +
    ' / 255 · Detection threshold: ' +
    threshold +
    ' / 255';
  $('threshold-marker').style.left = (threshold / 255) * 100 + '%';
}

function meterLoop() {
  if (!analyser || !buffer) return;
  // Frequency detection reproduces the working ClapSplash signal path:
  // short FFT, no mandatory high-pass filter, and adjustable average band energy.
  analyser.getByteFrequencyData(buffer);
  const value = frequencyBandEnergy(buffer);
  const now = performance.now();
  if (phase === 'calibrating') calibrationSamples.push(value);
  if (phase === 'capturing' && capture) capture.peak = Math.max(capture.peak, value);
  if (
    (phase === 'ready' || phase === 'capturing') &&
    shouldTriggerClick(value, threshold, now, lastEventAt)
  ) {
    lastEventAt = now;
    liveClicks++;
    $('live-events').textContent =
      'Live clicks detected: ' + liveClicks + ' · Last sound heard now';
    if (phase === 'capturing' && capture) {
      capture.events.push(Math.min(2000, Math.max(0, Math.round(now - capture.started))));
    }
  }
  frameNumber++;
  if (frameNumber % 15 === 0) microphoneDiagnostics();
  if (frameNumber % 3 === 0) {
    $('level-bar').style.width = (value / 255) * 100 + '%';
    $('live-energy').textContent = 'Live sound energy: ' + Math.round(value) + ' / 255';
    if (value === 0 && frameNumber > 180) {
      $('live-energy').textContent +=
        ' · No signal from analyzer. Clap to test; try Safari if it stays zero.';
    }
  }
  animation = requestAnimationFrame(meterLoop);
}

async function stop() {
  generation++;
  phase = 'off';
  calibrated = false;
  capture = null;
  if (animation) cancelAnimationFrame(animation);
  animation = 0;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  analyser = null;
  source = null;
  buffer = null;
  const closing = audioContext;
  audioContext = null;
  if (closing && closing.state !== 'closed') await closing.close().catch(() => {});
  $('level-bar').style.width = '0%';
  $('live-energy').textContent = 'Microphone off · no sound readings';
  microphoneDiagnostics();
  $('trial-status').textContent = 'Microphone stopped';
  controls();
}
async function calibrate() {
  if (!analyser || phase === 'off') return;
  const token = ++generation;
  calibrated = false;
  calibrationSamples = [];
  phase = 'calibrating';
  controls();
  status('Measuring room noise for 1.2 seconds. Keep quiet.');
  $('trial-status').textContent = 'Quiet please… calibrating';
  await sleep(1200);
  if (token !== generation || !analyser) return;
  try {
    background = calibrateNoise(calibrationSamples);
    calibrated = true;
    thresholdUpdate();
    phase = 'ready';
    status(
      'Microphone on. Room noise measured using ' +
        calibrationSamples.length +
        ' sound readings. Audio stays on this phone; nothing is recorded or uploaded.',
    );
    $('trial-status').textContent = 'Choose a condition, then Run 1 trial';
  } catch (error) {
    phase = 'ready';
    status(error.message + ' Try recalibrating without leaving this page.');
  }
  controls();
}
async function start() {
  if (phase !== 'off') return;
  const token = ++generation;
  phase = 'starting';
  controls();
  microphonePermission = 'requesting';
  status('Requesting microphone permission…');
  microphoneDiagnostics();
  let granted = null,
    context = null;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone requires HTTPS (or localhost) and a supported browser.');
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) throw new Error('Web Audio is unavailable in this browser.');
    // iPhone Safari can lose the user activation while awaiting microphone permission.
    // Construct and request audio-engine resume during the actual Start button gesture.
    context = new AudioEngine();
    audioContext = context;
    context.onstatechange = microphoneDiagnostics;
    if (context.state !== 'running') void context.resume().catch(() => microphoneDiagnostics());
    // Match the original successful acoustic demo: use normal browser microphone processing.
    granted = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (token !== generation) {
      granted.getTracks().forEach((track) => track.stop());
      if (context.state !== 'closed') await context.close().catch(() => {});
      return;
    }
    microphonePermission = 'granted';
    stream = granted;
    const track = granted.getAudioTracks?.()[0] ?? granted.getTracks()[0];
    if (track?.addEventListener) {
      for (const name of ['mute', 'unmute', 'ended'])
        track.addEventListener(name, microphoneDiagnostics);
    }
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;
    buffer = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    // No speaker output, recording, upload, RF receive, or car control.
    thresholdUpdate();
    liveClicks = 0;
    lastEventAt = -Infinity;
    $('live-events').textContent = 'Live clicks detected: 0';
    calibrated = true; // Live listening is available immediately; noise measurement is optional.
    phase = 'ready';
    meterLoop();
    status(
      context.state === 'running'
        ? 'Audio engine running. Try a clap, then the fob. Watch the sound meter.'
        : 'Microphone permission granted, but audio engine is ' +
            context.state +
            '. Tap Wake up audio engine.',
    );
    $('trial-status').textContent = 'Live test first, then choose a condition';
    controls();
  } catch (error) {
    const reason = error?.name || error?.message || 'Unknown error';
    microphonePermission =
      error?.name === 'NotAllowedError' ? 'denied' : 'unavailable (' + reason + ')';
    if (granted && granted !== stream) granted.getTracks().forEach((track) => track.stop());
    if (context && context !== audioContext && context.state !== 'closed')
      await context.close().catch(() => {});
    await stop();
    status(
      'Microphone unavailable: ' +
        reason +
        '. Use Safari directly, check the site microphone permission, and retry.',
    );
    microphoneDiagnostics();
  }
}
async function runTrial() {
  if (phase !== 'ready' || !calibrated || trials.length >= MAX_TRIALS) return;
  const condition = $('condition').value;
  const token = ++generation;
  phase = 'countdown';
  controls();
  status('Microphone on. Trial starting; hold the phone still.');
  for (let count = 3; count >= 1; count--) {
    $('trial-status').textContent = String(count) + '…';
    await sleep(1000);
    if (token !== generation) return;
  }
  capture = { events: [], peak: 0, threshold, started: performance.now() };
  lastEventAt = -Infinity;
  phase = 'capturing';
  $('trial-status').textContent =
    condition === 'quiet'
      ? 'GO — stay silent'
      : condition === 'tap'
        ? 'GO — tap the table once'
        : 'GO — press once';
  controls();
  await sleep(2000);
  if (token !== generation || !capture) return;
  const result = recordTrial({
    condition,
    events: capture.events,
    peak: capture.peak,
    threshold: capture.threshold,
    noise: background,
    at: new Date().toISOString(),
  });
  trials.push(result);
  capture = null;
  phase = 'ready';
  $('trial-status').textContent = result.detected ? 'Sound detected' : 'No sound detected';
  $('trial-result').textContent =
    label(condition) +
    ' · ' +
    result.eventCount +
    ' trigger(s) · peak ' +
    result.peak +
    ' / threshold ' +
    result.threshold +
    '. Only acoustic detection was measured.';
  status('Microphone on. Run the next trial or export your measurements.');
  controls();
  renderResults();
}
function renderResults() {
  const summary = summarizeTrials(trials);
  $('trial-summary').replaceChildren();
  for (const condition of CONDITIONS) {
    const group = summary.groups[condition.id];
    const card = document.createElement('article');
    const title = document.createElement('small');
    title.textContent = group.label;
    const count = document.createElement('strong');
    count.textContent = group.detected + '/' + group.total;
    const rate = document.createElement('small');
    rate.textContent =
      group.rate === null ? 'No trials' : Math.round(group.rate * 100) + '% detected';
    card.append(title, count, rate);
    $('trial-summary').append(card);
  }
  $('verdict').textContent = summary.verdict;
  $('trial-history').replaceChildren();
  if (!trials.length) {
    const row = document.createElement('tr'),
      cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No trials yet.';
    row.append(cell);
    $('trial-history').append(row);
  }
  for (const trial of [...trials].reverse()) {
    const row = document.createElement('tr');
    for (const value of [
      label(trial.condition),
      trial.detected ? 'Yes' : 'No',
      String(trial.eventCount),
      trial.peak + ' / ' + trial.threshold,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    $('trial-history').append(row);
  }
  controls();
}
function download(name, type, contents) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('mic-start').addEventListener('click', start);
$('mic-resume').addEventListener('click', () => {
  if (!audioContext || phase === 'off') return;
  const engine = audioContext;
  status('Trying to wake the audio engine…');
  // Direct user tap provides a fresh activation for WebKit audio.
  void engine.resume().then(
    () => {
      microphoneDiagnostics();
      status(
        engine.state === 'running'
          ? 'Audio engine running. Clap once and watch the live meter.'
          : 'Audio engine is still ' + engine.state + '. Try Stop then Start in Safari.',
      );
    },
    (error) => status('Could not wake audio engine: ' + (error?.message || 'unknown error')),
  );
});
$('mic-stop').addEventListener('click', () => {
  void stop().then(() =>
    status('Microphone stopped. Past trial results remain until cleared or page closed.'),
  );
});
$('mic-calibrate').addEventListener('click', () => {
  void calibrate();
});
$('sensitivity').addEventListener('change', thresholdUpdate);
$('trial-start').addEventListener('click', () => {
  void runTrial();
});
$('export-json').addEventListener('click', () =>
  download(
    'sasori-keyfob-acoustic-trials.json',
    'application/json',
    JSON.stringify(
      {
        schema: 'sasori/keyfob-acoustic-trials/v1',
        collectedAt: new Date().toISOString(),
        source: 'phone-microphone-not-RF',
        windowMs: 2000,
        trialCount: trials.length,
        summary: summarizeTrials(trials),
        trials,
      },
      null,
      2,
    ) + '\n',
  ),
);
$('export-csv').addEventListener('click', () =>
  download('sasori-keyfob-acoustic-trials.csv', 'text/csv', csvForTrials(trials)),
);
$('clear-trials').addEventListener('click', () => {
  if (!window.confirm('Erase all unsaved key-fob trial results in this tab?')) return;
  trials = [];
  $('trial-result').textContent = 'Results cleared.';
  renderResults();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase !== 'off') {
    void stop().then(() =>
      status(
        'Microphone stopped when the page went into the background. Start again and recalibrate.',
      ),
    );
  }
});
window.addEventListener('pagehide', () => {
  void stop();
});
thresholdUpdate();
renderResults();
