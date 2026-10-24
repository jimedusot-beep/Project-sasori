import { compareFrames } from './lib/privacy-optics.js';
import { PrivacyCamera } from './lib/privacy-camera.js';
import { PrivacyNotebook, portableObservation } from './lib/privacy-notebook.js';
import { PrivacySurvey } from './lib/privacy-survey.js';

const $ = (id) => document.getElementById(id);
const image = $('inspection-image'),
  video = $('inspection-video'),
  map = $('comparison-map');
const book = new PrivacyNotebook();
let baseline = null,
  comparison = null,
  photo = '',
  source = 'live',
  records = [],
  track = null,
  torch = false,
  cameraRun = 0;
let surveySource = 'live',
  surveyResult = null,
  deleting = '';
const safe = (action, target) => async () => {
  try {
    await action();
  } catch {
    $(target).textContent =
      target === 'camera-status'
        ? 'Camera unavailable. Check camera permission, close other camera apps and open the HTTPS site directly.'
        : 'Operation unavailable. Check support and storage; earlier saved records are preserved.';
  }
};
const camera = new PrivacyCamera({
  emit: (state) => {
    const active = ['starting', 'live'].includes(state);
    $('camera-start').disabled = active;
    $('camera-stop').disabled = !active;
    $('capture-a').disabled = state !== 'live';
    $('capture-b').disabled = state !== 'live' || !baseline;
    $('camera-status').textContent =
      state === 'live'
        ? 'LIVE · camera active, maximum two minutes.'
        : state === 'starting'
          ? 'Waiting for camera permission…'
          : 'Camera stopped. Captured comparisons remain in memory until replaced or the page closes.';
    if (!active) {
      ++cameraRun;
      video.srcObject = null;
      video.hidden = true;
      image.hidden = false;
      track = null;
      torch = false;
      $('torch').disabled = true;
      $('torch').textContent = 'Turn light on';
      $('exposure').disabled = true;
    }
  },
});
const survey = new PrivacySurvey({
  emit: (state, result, reason) => {
    // An inactive native runner must not replace the displayed synthetic observation.
    if (surveySource === 'synthetic' && state === 'stopped') return;
    surveyResult = result;
    $('ble-start').disabled =
      !globalThis.SasoriNativeSurvey || ['starting', 'scanning'].includes(state);
    $('ble-stop').disabled = !['starting', 'scanning'].includes(state);
    $('ble-demo').disabled = ['starting', 'scanning'].includes(state);
    $('ble-status').textContent =
      state === 'scanning'
        ? 'LIVE · advertisement survey active (30 seconds maximum).'
        : state === 'starting'
          ? 'Starting native Bluetooth survey…'
          : 'Survey stopped · ' +
            (reason || 'finished') +
            '. Results are observations, not camera identification.';
    renderSurvey();
  },
});
function renderSurvey() {
  $('ble-results').replaceChildren();
  for (const d of surveyResult?.devices || []) {
    const item = document.createElement('li');
    item.textContent = `${d.alias}: ${d.rssi} dBm · range ${d.minRssi} to ${d.maxRssi} · ${d.samples} observations`;
    if (d.name) item.append(document.createTextNode(' · Advertised name: ' + d.name));
    if (d.services?.length)
      item.append(document.createTextNode(' · Advertised services: ' + d.services.join(', ')));
    $('ble-results').append(item);
  }
  $('save-survey').disabled = !surveyResult || !['idle', 'stopped'].includes(survey.state);
}
function resetFrames() {
  baseline = null;
  comparison = null;
  photo = '';
  map.hidden = true;
  $('optics-result').textContent = 'No comparison yet. Capture a fresh A for this camera session.';
  $('capture-b').disabled = true;
}
function frame() {
  if (camera.state !== 'live' || video.readyState < 2 || !video.videoWidth)
    throw new Error('camera-not-ready');
  const scale = Math.min(320 / video.videoWidth, 240 / video.videoHeight, 1);
  image.width = Math.max(16, Math.round(video.videoWidth * scale));
  image.height = Math.max(12, Math.round(video.videoHeight * scale));
  const ctx = image.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, image.width, image.height);
  photo = image.toDataURL('image/jpeg', 0.8);
  return ctx.getImageData(0, 0, image.width, image.height);
}
function showComparison() {
  const ctx = map.getContext('2d');
  ctx.fillStyle = '#0a151a';
  ctx.fillRect(0, 0, 320, 240);
  for (const cell of comparison.cells) {
    ctx.fillStyle = cell.bright ? '#efbf6c' : Math.abs(cell.delta) >= 20 ? '#75bbdf' : '#233942';
    ctx.fillRect(cell.x * 20, cell.y * 20, 19, 19);
  }
  map.hidden = false;
  $('optics-result').textContent =
    `${source === 'synthetic' ? 'SYNTHETIC EXAMPLE' : 'LIVE FRAME COMPARISON'} · ${comparison.changedCells}/192 cells changed; ${comparison.brightIncreases} increased to high brightness; mean absolute change ${comparison.meanAbsoluteChange}/255. This does not classify a lens.`;
}
$('camera-start').addEventListener(
  'click',
  safe(async () => {
    resetFrames();
    source = 'live';
    const run = ++cameraRun;
    const stream = await camera.start();
    if (!stream || run !== cameraRun) return;
    video.srcObject = stream;
    video.hidden = false;
    image.hidden = true;
    try {
      await video.play();
    } catch {
      if (run !== cameraRun || camera.state !== 'live') return;
      camera.stop();
      throw new Error('preview-unavailable');
    }
    if (run !== cameraRun || camera.state !== 'live') return;
    track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.() || {};
    $('torch').disabled = capabilities.torch !== true;
    $('torch-status').textContent =
      capabilities.torch === true
        ? 'Torch available. Change light manually; keep the phone steady.'
        : 'This camera/browser does not expose torch control. Use existing room light for comparisons.';
    const exposure = capabilities.exposureCompensation;
    if (
      exposure &&
      Number.isFinite(exposure.min) &&
      Number.isFinite(exposure.max) &&
      exposure.min < exposure.max
    ) {
      $('exposure').min = exposure.min;
      $('exposure').max = exposure.max;
      $('exposure').step = exposure.step || 0.1;
      $('exposure').value = track.getSettings?.().exposureCompensation ?? exposure.min;
      $('exposure').disabled = false;
      $('exposure-status').textContent =
        'Exposure adjustment available. Changes can affect comparisons; this does not lock automatic exposure.';
    } else
      $('exposure-status').textContent =
        'Exposure adjustment is not exposed by this camera/browser.';
  }, 'camera-status'),
);
$('camera-stop').addEventListener('click', () => camera.stop());
$('capture-a').addEventListener(
  'click',
  safe(() => {
    baseline = frame();
    comparison = null;
    map.hidden = true;
    $('capture-b').disabled = false;
    $('optics-result').textContent =
      'A captured. Keep the frame aligned, change the light deliberately, then capture B.';
  }, 'camera-status'),
);
$('capture-b').addEventListener(
  'click',
  safe(() => {
    comparison = compareFrames(baseline, frame());
    showComparison();
  }, 'camera-status'),
);
$('view-zoom').addEventListener('input', () => {
  const value = Number($('view-zoom').value);
  video.style.transform = image.style.transform = `scale(${value})`;
  $('zoom-value').value = value + '×';
});
$('torch').addEventListener(
  'click',
  safe(async () => {
    const selected = track,
      next = !torch;
    if (!selected || camera.state !== 'live') return;
    await selected.applyConstraints({ advanced: [{ torch: next }] });
    if (selected !== track || camera.state !== 'live') return;
    torch = next;
    $('torch').textContent = torch ? 'Turn light off' : 'Turn light on';
  }, 'camera-status'),
);
$('exposure').addEventListener(
  'change',
  safe(async () => {
    if (track && camera.state === 'live')
      await track.applyConstraints({
        advanced: [{ exposureCompensation: Number($('exposure').value) }],
      });
  }, 'camera-status'),
);
$('optics-demo').addEventListener('click', () => {
  camera.stop();
  resetFrames();
  source = 'synthetic';
  image.width = 320;
  image.height = 240;
  const ctx = image.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 320, 240);
  baseline = ctx.getImageData(0, 0, 320, 240);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(140, 100, 20, 20);
  comparison = compareFrames(baseline, ctx.getImageData(0, 0, 320, 240));
  photo = image.toDataURL('image/jpeg', 0.8);
  showComparison();
  $('camera-status').textContent =
    'SYNTHETIC · generated white square. No camera or Bluetooth device is used.';
});
$('ble-start').addEventListener(
  'click',
  safe(async () => {
    surveySource = 'live';
    await survey.start();
  }, 'ble-status'),
);
$('ble-stop').addEventListener('click', () => survey.stop());
$('ble-demo').addEventListener('click', () => {
  survey.stop();
  surveySource = 'synthetic';
  surveyResult = {
    durationMs: 1000,
    devices: [
      {
        alias: 'signal-1',
        samples: 3,
        rssi: -55,
        minRssi: -65,
        maxRssi: -55,
        history: [
          { elapsedMs: 0, rssi: -65 },
          { elapsedMs: 500, rssi: -60 },
          { elapsedMs: 1000, rssi: -55 },
        ],
      },
    ],
  };
  $('ble-status').textContent = 'SYNTHETIC · example measurements. No radio was used.';
  renderSurvey();
});
function input(kind, measurements, observationSource) {
  return {
    label: $('observation-label').value,
    note: $('observation-note').value,
    source: observationSource,
    kind,
    measurements,
    photo,
  };
}
async function refresh() {
  records = await book.list();
  $('notebook-list').replaceChildren();
  for (const record of [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const item = document.createElement('li'),
      title = document.createElement('strong'),
      note = document.createElement('p'),
      detail = document.createElement('p'),
      remove = document.createElement('button');
    title.textContent = record.label;
    note.textContent = record.note;
    detail.textContent = `${record.source.toUpperCase()} · ${record.kind} · ${record.createdAt}${record.photo ? ' · photo retained' : ''}`;
    remove.textContent = deleting === record.id ? 'Confirm delete' : 'Delete observation';
    remove.addEventListener(
      'click',
      safe(async () => {
        if (deleting !== record.id) {
          deleting = record.id;
          await refresh();
          return;
        }
        await book.remove(record.id);
        deleting = '';
        await refresh();
      }, 'notebook-status'),
    );
    item.append(title, note, detail, remove);
    $('notebook-list').append(item);
  }
  $('export-notes').disabled = $('export-photos').disabled = records.length === 0;
  $('notebook-status').textContent =
    `${records.length}/30 local observations. Hardware verification remains pending.`;
}
$('save-observation').addEventListener(
  'click',
  safe(async () => {
    await book.save(input(comparison ? 'optics' : 'note', comparison, source), {
      keepPhoto: $('keep-photo').checked,
    });
    $('keep-photo').checked = false;
    await refresh();
  }, 'notebook-status'),
);
$('save-survey').addEventListener(
  'click',
  safe(async () => {
    if (!surveyResult || ['starting', 'scanning'].includes(survey.state)) return;
    await book.save(input('survey', surveyResult, surveySource));
    await refresh();
  }, 'notebook-status'),
);
async function exportNotes(includePhoto) {
  const current = await book.list();
  const result = {
    format: 'sasori.privacy-observations',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    observations: current.map((record) => portableObservation(record, { includePhoto })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `sasori-privacy-${includePhoto ? 'with-photos' : 'metadata'}-${Date.now()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-notes').addEventListener(
  'click',
  safe(() => exportNotes(false), 'notebook-status'),
);
$('export-photos').addEventListener(
  'click',
  safe(() => exportNotes(true), 'notebook-status'),
);
const stop = () => {
  camera.stop();
  survey.stop('page-hidden');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', stop);
$('ble-start').disabled = !globalThis.SasoriNativeSurvey;
$('ble-status').textContent = globalThis.SasoriNativeSurvey
  ? 'Native advertisement survey available. Press Start to request Bluetooth access.'
  : 'Native iPhone app required for advertisement surveys. This website does not substitute a Bluetooth chooser for a room scan. The synthetic example works here.';
safe(refresh, 'notebook-status')();
