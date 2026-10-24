import {
  createDiscovery,
  parseCapture,
  parseDiscoveries,
  summarizeCapture,
  MAX_DISCOVERY_FILE_BYTES,
} from './lib/discovery.js';
import { ResearchStore } from './lib/storage.js';
import { buildSignalAtlas, compareAtlasPair, atlasMetadataExport } from './lib/signal-atlas.js';

const $ = (id) => document.getElementById(id);
const node = (tag, text, className = '') => {
  const el = document.createElement(tag);
  el.textContent = String(text);
  if (className) el.className = className;
  return el;
};
const option = (value, label) => {
  const el = node('option', label);
  el.value = value;
  return el;
};
const store = new ResearchStore();
let activeRecords = [];
let groups = [];
let busy = true;

function message(value) {
  $('status').textContent = value;
}
function problem(error) {
  message(error instanceof Error ? error.message : 'An unexpected offline error occurred.');
}
function tolerance() {
  const value = $('tolerance').value;
  if (!/^\d{1,7}$/.test(value) || Number(value) > 1000000)
    throw new Error('Enter a whole-number tolerance from 0 to 1,000,000 µs.');
  return Number(value);
}
function currentGroup() {
  return groups.find((g) => g.key === $('group').value) || null;
}
function labeledCapture(record) {
  return (
    record.label +
    ' · ' +
    record.evidence +
    (record.importedAt ? ' · imported claim' : '') +
    (record.payloadsIncluded ? ' · raw retained' : ' · metadata only')
  );
}
function setOptions(select, items, previous, placeholder) {
  select.replaceChildren(option('', placeholder));
  for (const item of items) select.append(option(item.id, labeledCapture(item)));
  if (items.some((x) => x.id === previous)) select.value = previous;
}

function renderGroup() {
  const group = currentGroup();
  const stats = $('stats');
  const heatmap = $('heatmap');
  stats.replaceChildren();
  heatmap.replaceChildren();
  $('pair-results').replaceChildren(node('p', 'Choose two retained captures from one family.'));
  $('heatmap-description').textContent =
    'Compare at least two raw-retained observations for an index map.';
  if (!group) {
    stats.append(node('p', 'Choose a group or try the synthetic demo.'));
    setOptions($('first'), [], '', 'Choose capture A');
    setOptions($('second'), [], '', 'Choose capture B');
    $('compare').disabled = true;
    return;
  }
  const fields = [
    [group.counts.total, 'Captures in family'],
    [group.counts.retained, 'Raw-retained captures'],
    [group.counts.metadataOnly, 'Metadata only'],
    [
      group.counts.imported + group.counts.synthetic + group.counts.community,
      'Imported / synthetic / community claims',
    ],
  ];
  for (const [value, label] of fields) {
    const cell = node('div', '', 'stat');
    cell.append(node('strong', value), node('span', label));
    stats.append(cell);
  }
  stats.append(node('p', group.evidenceLabel, 'hint'));
  const retained = group.captures.filter((r) => !!r.values && r.kind !== 'audio');
  const oldA = $('first').value;
  const oldB = $('second').value;
  setOptions($('first'), retained, oldA, 'Baseline A');
  setOptions($('second'), retained, oldB, 'Experiment B');
  if (!$('first').value && retained.length) $('first').value = retained[0].id;
  if (!$('second').value && retained.length > 1) $('second').value = retained[1].id;
  $('compare').disabled = retained.length < 2;
  if (!group.comparable) {
    $('heatmap-description').textContent =
      'Only metadata or fewer than two retained captures are available. Importing a metadata backup cannot restore signal values.';
    return;
  }
  for (const position of group.positions) {
    const cell = node('span', position.offset, 'cell ' + position.status);
    cell.title =
      'Index ' +
      position.offset +
      ' · ' +
      position.status +
      ' · ' +
      position.coverage +
      '/' +
      retained.length +
      ' captures';
    cell.setAttribute('aria-label', cell.title);
    heatmap.append(cell);
  }
  const totals = Object.fromEntries(
    ['stable', 'variable', 'partial'].map((status) => [
      status,
      group.positions.filter((p) => p.status === status).length,
    ]),
  );
  $('heatmap-description').textContent =
    group.positions.length +
    ' aligned positions shown · ' +
    totals.stable +
    ' stable · ' +
    totals.variable +
    ' variable · ' +
    totals.partial +
    ' partial.' +
    (group.truncated
      ? ' View capped to first 64 positions; longer captures remain preserved locally.'
      : '');
}
function renderAtlas() {
  let selected = $('group').value;
  groups = buildSignalAtlas(activeRecords, { toleranceUs: tolerance() });
  $('group').replaceChildren(option('', 'Choose a signal family'));
  groups.forEach((g) =>
    $('group').append(
      option(g.key, g.deviceModel + ' · ' + g.method + '/' + g.kind + ' · ' + g.counts.total),
    ),
  );
  if (!groups.some((g) => g.key === selected)) selected = groups[0]?.key || '';
  $('group').value = selected;
  $('export').disabled = !groups.length;
  renderGroup();
}
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = node('a', 'Download');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refresh() {
  const records = await store.listDiscoveries();
  activeRecords = records;
  renderAtlas();
  message(
    records.length +
      ' Discovery captures available in this browser. ' +
      (store.persistent ? 'IndexedDB storage enabled.' : store.warning) +
      ' No wireless connection was requested.',
  );
}
function demoRecords() {
  const base = {
    label: 'Synthetic baseline',
    deviceModel: 'DEMO ONLY · virtual board v1',
    sourceNote: 'Generated in the browser; no real radio or appliance.',
    method: 'ble',
    kind: 'bytes',
    evidence: 'synthetic',
    payloadsIncluded: true,
  };
  return ['10 20 30 40 50 60', '10 20 35 40 50 70', '10 20 32 40 50'].map((text, i) => {
    const values = parseCapture(text, 'bytes');
    return createDiscovery({
      ...base,
      label: 'Simulated recording ' + (i + 1),
      values,
      summary: summarizeCapture(values, 'bytes'),
    });
  });
}
async function perform(action) {
  if (busy) return;
  busy = true;
  $('save').disabled = true;
  $('import').disabled = true;
  try {
    await action();
  } catch (error) {
    problem(error);
  } finally {
    busy = false;
    $('save').disabled = false;
    $('import').disabled = !$('backup').files?.length;
  }
}
$('demo').addEventListener('click', () =>
  perform(async () => {
    activeRecords = demoRecords();
    renderAtlas();
    message('Synthetic demonstration only. Demo captures are in memory and have not been saved.');
  }),
);
$('refresh').addEventListener('click', () => perform(refresh));
$('group').addEventListener('change', renderGroup);
$('kind').addEventListener('change', () => {
  if ($('kind').value === 'pulses') $('method').value = 'infrared';
  else if ($('method').value === 'infrared') $('method').value = 'ble';
});
$('tolerance').addEventListener('change', () => {
  try {
    renderAtlas();
  } catch (error) {
    problem(error);
  }
});
$('export').addEventListener('click', () =>
  perform(async () => {
    download(atlasMetadataExport(groups), 'sasori-signal-atlas-aggregate.json');
    message('Aggregate exported without device IDs, names, notes, raw signals or capture IDs.');
  }),
);
$('compare').addEventListener('click', () =>
  perform(async () => {
    const group = currentGroup();
    const first = group?.captures.find((r) => r.id === $('first').value);
    const second = group?.captures.find((r) => r.id === $('second').value);
    if (!first || !second || first.id === second.id)
      throw new Error('Choose two different retained captures.');
    const result = compareAtlasPair(first, second, tolerance());
    const root = $('pair-results');
    root.replaceChildren(
      node(
        'p',
        result.total +
          ' differences: ' +
          result.changed +
          ' changed, ' +
          result.added +
          ' added, ' +
          result.removed +
          ' removed. Up to 64 positions listed.',
      ),
    );
    const list = node('ol', '', 'result-list');
    for (const d of result.differences)
      list.append(node('li', 'Index ' + d.offset + ': ' + d.status));
    if (!result.differences.length) list.append(node('li', 'All aligned positions match.'));
    root.append(list, node('p', result.caveat, 'hint'));
  }),
);
$('capture-form').addEventListener('submit', (event) => {
  event.preventDefault();
  perform(async () => {
    const kind = $('kind').value;
    const values = parseCapture($('values').value, kind);
    const keep = $('retain').checked;
    const record = createDiscovery({
      label: $('label').value,
      deviceModel: $('model').value,
      sourceNote: $('source').value,
      method: $('method').value,
      kind,
      evidence: $('evidence').value,
      payloadsIncluded: keep,
      values: keep ? values : null,
      summary: summarizeCapture(values, kind),
    });
    await store.saveDiscoveries([record]);
    $('retain').checked = false;
    await refresh();
    message(
      'Saved ' +
        record.label +
        ' to the shared Discovery notebook. ' +
        (keep
          ? 'Raw values are retained locally.'
          : 'Only metadata and numeric summary were saved.') +
        ' No hardware action was attempted.',
    );
  });
});
$('backup').addEventListener('change', () => {
  $('import').disabled = busy || !$('backup').files?.length;
});
$('import').addEventListener('click', () =>
  perform(async () => {
    const file = $('backup').files?.[0];
    if (!file) throw new Error('Choose a Discovery backup.');
    if (file.size > MAX_DISCOVERY_FILE_BYTES) throw new Error('Discovery backup exceeds 1 MB.');
    const parsed = parseDiscoveries(await file.text());
    await store.saveDiscoveries(parsed);
    $('backup').value = '';
    await refresh();
    message(
      'Imported ' +
        parsed.length +
        ' metadata-only Discovery claim(s). No imported record is hardware-verified.',
    );
  }),
);

// Open the existing storage schema; never auto-import, upgrade evidence, or request hardware.
try {
  await store.open();
  busy = false;
  $('save').disabled = false;
  await perform(refresh);
} catch (error) {
  busy = false;
  $('save').disabled = true;
  $('import').disabled = true;
  problem(error);
}
