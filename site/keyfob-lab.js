import {
  CONDITIONS,
  sampleLevel,
  calibrateNoise,
  detectionThreshold,
  recordTrial,
  summarizeTrials,
  csvForTrials,
} from './lib/keyfob-audio.js?v=keyfob-audio-1';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_TRIALS = 100;
let stream = null,
  audioContext = null,
  analyser = null,
  buffer = null;
let source = null,
  highpass = null,
  animation = 0;
let phase = 'off',
  generation = 0,
  calibrated = false,
  background = 0;
let threshold = 0.022,
  wasAbove = false,
  lastEventAt = -Infinity;
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
function controls() {
  const available = phase === 'ready';
  $('mic-start').disabled = phase !== 'off';
  $('mic-stop').disabled = phase === 'off';
  $('mic-calibrate').disabled = !available;
  $('trial-start').disabled = !available || !calibrated || trials.length >= MAX_TRIALS;
  $('condition').disabled = !available;
  $('sensitivity').disabled =
    phase === 'countdown' || phase === 'capturing' || phase === 'calibrating';
  for (const id of ['export-json', 'export-csv', 'clear-trials']) $(id).disabled = !trials.length;
}
function thresholdUpdate() {
  threshold = detectionThreshold(background, $('sensitivity').value);
  $('level-label').textContent =
    'Background: ' +
    background.toFixed(3) +
    ' · Threshold: ' +
    threshold.toFixed(3) +
    ' · Orange line is the trigger level';
  $('threshold-marker').style.left = Math.min(100, threshold * 500) + '%';
}
function meterLoop() {
  if (!analyser || !buffer) return;
  analyser.getByteTimeDomainData(buffer);
  const value = sampleLevel(buffer);
  if (phase === 'calibrating') calibrationSamples.push(value);
  if (phase === 'capturing' && capture) {
    capture.peak = Math.max(capture.peak, value);
    const now = performance.now();
    if (value > capture.threshold && !wasAbove && now - lastEventAt >= 260) {
      capture.events.push(Math.min(2000, Math.max(0, Math.round(now - capture.started))));
      lastEventAt = now;
    }
  }
  wasAbove = value > threshold;
  frameNumber++;
  if (frameNumber % 3 === 0) $('level-bar').style.width = Math.min(100, value * 500) + '%';
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
  highpass = null;
  buffer = null;
  const closing = audioContext;
  audioContext = null;
  if (closing && closing.state !== 'closed') await closing.close().catch(() => {});
  $('level-bar').style.width = '0%';
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
  status('Calibrating for 2.4 seconds. Do not press or tap anything.');
  $('trial-status').textContent = 'Quiet please… calibrating';
  await sleep(2400);
  if (token !== generation || !analyser) return;
  try {
    background = calibrateNoise(calibrationSamples);
    calibrated = true;
    thresholdUpdate();
    phase = 'ready';
    status(
      'Microphone on. Calibrated using ' +
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
  status('Requesting microphone permission…');
  let granted = null,
    context = null;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone requires HTTPS (or localhost) and a supported browser.');
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) throw new Error('Web Audio is unavailable in this browser.');
    granted = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    if (token !== generation) {
      granted.getTracks().forEach((track) => track.stop());
      return;
    }
    context = new AudioEngine();
    await context.resume();
    if (token !== generation) {
      granted.getTracks().forEach((track) => track.stop());
      await context.close();
      return;
    }
    stream = granted;
    audioContext = context;
    source = context.createMediaStreamSource(stream);
    highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 900;
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    buffer = new Uint8Array(analyser.fftSize);
    source.connect(highpass);
    highpass.connect(analyser);
    // No connection to speakers: avoids feedback and never transmits radio commands.
    phase = 'ready';
    meterLoop();
    await calibrate();
  } catch (error) {
    if (granted && granted !== stream) granted.getTracks().forEach((track) => track.stop());
    if (context && context !== audioContext) await context.close().catch(() => {});
    await stop();
    status(
      'Microphone unavailable: ' +
        error.message +
        ' Check permissions, use HTTPS, and keep the page in the foreground.',
    );
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
  wasAbove = true; // Require a new rising edge after the GO signal.
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
