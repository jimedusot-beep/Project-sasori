import {
  METHODS,
  parseCapture,
  summarizeCapture,
  createDiscovery,
  compareCaptures,
  discoveryBackup,
  parseDiscoveries,
  inspectWav,
  MAX_WAV_BYTES,
  MAX_DISCOVERY_FILE_BYTES,
} from './lib/discovery.js';

export async function mountDiscovery({ store, download }) {
  const $ = (id) => document.getElementById(id);
  const element = (tag, text, className = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  let records = [],
    current = null,
    audio = null,
    first = null,
    second = null,
    audioGeneration = 0;
  const status = (message) => {
    $('discovery-status').textContent = message;
  };
  const safe = (action) => async (event) => {
    event?.preventDefault();
    try {
      await action(event);
    } catch (error) {
      status(error.message);
    }
  };
  const fields = () => ({
    label: $('d-label').value,
    deviceModel: $('d-device').value,
    sourceNote: $('d-source').value,
    method: $('d-method').value,
    evidence: $('d-evidence').value,
  });
  const describe = (record) =>
    record.kind === 'audio'
      ? record.summary.duration.toFixed(3) +
        ' s · ' +
        record.summary.sampleRate +
        ' Hz · ' +
        record.summary.channels +
        ' channel(s) · first channel analyzed · RMS ' +
        record.summary.rms.toFixed(4) +
        ' · peak ' +
        record.summary.peak.toFixed(4) +
        ' · clipped samples ' +
        record.summary.clipped +
        ' · largest non-DC bin ' +
        record.summary.dominantHz.toFixed(1) +
        ' Hz (bin width ' +
        record.summary.binHz.toFixed(1) +
        ' Hz)'
      : record.kind === 'bytes'
        ? record.summary.count + ' bytes · ' + record.summary.unique + ' distinct values'
        : record.summary.count +
          ' pulses · ' +
          record.summary.totalUs +
          ' µs total · range ' +
          record.summary.minUs +
          '–' +
          record.summary.maxUs +
          ' µs';
  const provenance = (record) =>
    (record.importedAt ? 'IMPORTED CLAIM / ' : '') + record.evidence.toUpperCase();
  function comparisonLabels() {
    $('d-first-label').textContent = first
      ? 'A: ' + first.label + ' · ' + provenance(first)
      : 'A: no capture selected';
    $('d-second-label').textContent = second
      ? 'B: ' + second.label + ' · ' + provenance(second)
      : 'B: no capture selected';
    $('d-compare').disabled = !first || !second;
    $('d-comparison').replaceChildren();
  }
  function select(record, slot) {
    if (!record?.values)
      throw new Error(
        'This capture has metadata only. Analyze its private source again to compare values.',
      );
    if (slot === 'first') first = structuredClone(record);
    else second = structuredClone(record);
    comparisonLabels();
    status('Selected ' + record.label + ' as ' + (slot === 'first' ? 'A' : 'B') + '.');
  }
  function action(text, handler, disabled = false) {
    const button = element('button', text, 'secondary');
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', safe(handler));
    return button;
  }
  async function refresh() {
    records = await store.listDiscoveries();
    $('d-storage').textContent =
      (store.persistent ? 'Saved on this browser' : 'TEMPORARY MEMORY: export before closing') +
      ' · ' +
      records.length +
      ' / 50 captures · separate 2 MB budget';
    $('d-export').disabled = !records.length;
    $('d-list').replaceChildren();
    if (!records.length)
      $('d-list').append(
        element(
          'p',
          'Save a labeled capture or audio summary to start your discovery notebook.',
          'empty',
        ),
      );
    for (const record of records) {
      const card = element('article', '', 'discovery-record');
      card.append(
        element('span', provenance(record), 'badge subtle'),
        element('h3', record.label),
        element('p', record.deviceModel),
        element('p', METHODS.find((m) => m.id === record.method).label + ' · ' + describe(record)),
        element('p', record.sourceNote, 'hint'),
        element(
          'p',
          record.payloadsIncluded
            ? 'Raw values saved locally. Keep private.'
            : 'Metadata only; source bytes, timings, and audio omitted.',
          'hint',
        ),
      );
      const actions = element('div', '', 'actions');
      actions.append(
        action('Use as A', () => select(record, 'first'), !record.values),
        action('Use as B', () => select(record, 'second'), !record.values),
      );
      let armed = false;
      const remove = action('Delete capture', async () => {
        if (!armed) {
          armed = true;
          remove.textContent = 'Confirm capture deletion';
          setTimeout(() => {
            armed = false;
            remove.textContent = 'Delete capture';
          }, 5000);
          return;
        }
        await store.removeDiscovery(record.id);
        if (first?.id === record.id) first = null;
        if (second?.id === record.id) second = null;
        comparisonLabels();
        await refresh();
        status('Capture deleted locally. Sessions and toy profiles were preserved.');
      });
      actions.append(remove);
      card.append(actions);
      $('d-list').append(card);
    }
  }
  for (const method of METHODS) {
    const option = element('option', method.label);
    option.value = method.id;
    $('d-method').append(option);
    const details = element('details', '', 'discovery-method');
    details.append(
      element('summary', method.label),
      element('p', method.question),
      element('p', method.capture),
      element('p', method.limit, 'hint'),
    );
    $('d-methods').append(details);
  }
  $('d-method').value = 'ble';
  function methodHint() {
    const method = METHODS.find((m) => m.id === $('d-method').value);
    $('d-method-hint').textContent = method.capture + ' ' + method.limit;
  }
  methodHint();
  function invalidate() {
    $('d-keep-values').checked = false;
    current = null;
    audio = null;
    audioGeneration++;
    $('d-result').textContent = 'Analyze the current form to prepare a capture.';
    $('d-audio-result').textContent =
      'Choose a PCM16 WAV and inspect it locally. Select Sound as the method first.';
    for (const id of ['d-save', 'd-use-first', 'd-use-second', 'd-save-audio'])
      $(id).disabled = true;
    for (const id of ['d-waveform', 'd-spectrum']) $(id).hidden = true;
  }
  for (const id of [
    'd-label',
    'd-device',
    'd-source',
    'd-method',
    'd-evidence',
    'd-kind',
    'd-values',
  ])
    $(id).addEventListener('input', () => {
      invalidate();
      if (id === 'd-method') methodHint();
    });
  $('d-wav').addEventListener('change', invalidate);
  $('d-form').addEventListener(
    'submit',
    safe(() => {
      const kind = $('d-kind').value,
        values = parseCapture($('d-values').value, kind);
      current = createDiscovery({
        ...fields(),
        kind,
        values,
        payloadsIncluded: true,
        summary: summarizeCapture(values, kind),
      });
      $('d-result').textContent =
        describe(current) + ' · ' + provenance(current) + ' · analysis only';
      for (const id of ['d-save', 'd-use-first', 'd-use-second']) $(id).disabled = false;
      status('Capture analyzed offline. No traffic was sent.');
    }),
  );
  $('d-use-first').addEventListener(
    'click',
    safe(() => select(current, 'first')),
  );
  $('d-use-second').addEventListener(
    'click',
    safe(() => select(current, 'second')),
  );
  $('d-save').addEventListener(
    'click',
    safe(async () => {
      if (!current) throw new Error('Analyze this capture before saving.');
      const keep = $('d-keep-values').checked;
      await store.saveDiscoveries([
        { ...current, payloadsIncluded: keep, values: keep ? current.values : null },
      ]);
      $('d-keep-values').checked = false;
      await refresh();
      status(
        store.persistent
          ? 'Capture saved on this browser. ' +
              (keep
                ? 'Raw values retained locally; metadata exports omit them.'
                : 'Only metadata saved; keep your original source privately.')
          : store.warning,
      );
    }),
  );
  $('d-compare').addEventListener(
    'click',
    safe(() => {
      const result = compareCaptures(first, second, $('d-tolerance').valueAsNumber);
      const container = $('d-comparison');
      container.replaceChildren(
        element(
          'p',
          result.total +
            ' differences · ' +
            result.changed +
            ' changed · ' +
            result.added +
            ' added · ' +
            result.removed +
            ' removed. ' +
            (result.kind === 'pulses' ? 'Tolerance: ' + $('d-tolerance').value + ' µs. ' : '') +
            'Same-index comparison; no realignment, command decoding, or authentication inference.',
        ),
      );
      if (!result.total) return;
      const table = element('table', '', 'diff-table');
      const head = element('thead', ''),
        header = element('tr', '');
      for (const title of ['Offset (0-based)', 'A', 'B', 'Difference']) {
        const th = element('th', title);
        th.scope = 'col';
        header.append(th);
      }
      head.append(header);
      table.append(
        element(
          'caption',
          'First 64 differences. Byte values are hex; pulse values are microseconds.',
        ),
        head,
      );
      const body = element('tbody', '');
      for (const diff of result.differences) {
        const row = element('tr', '');
        for (const value of [
          diff.offset,
          ...[diff.first, diff.second].map((v) =>
            v === null ? '—' : result.kind === 'bytes' ? v.toString(16).padStart(2, '0') : v,
          ),
          diff.status,
        ])
          row.append(element('td', String(value)));
        body.append(row);
      }
      table.append(body);
      container.append(table);
    }),
  );
  $('d-tolerance').addEventListener('input', () => $('d-comparison').replaceChildren());
  $('d-clear-comparison').addEventListener('click', () => {
    first = null;
    second = null;
    comparisonLabels();
  });
  function drawAudio(result) {
    const wave = $('d-waveform'),
      spectrum = $('d-spectrum');
    for (const canvas of [wave, spectrum]) {
      canvas.hidden = false;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#a3cbb7';
      ctx.lineWidth = 2;
    }
    const wc = wave.getContext('2d');
    wc.beginPath();
    result.waveform.forEach((point, i) => {
      const x = (i * wave.width) / result.waveform.length;
      wc.moveTo(x, ((1 - point.max) * wave.height) / 2);
      wc.lineTo(x, ((1 - point.min) * wave.height) / 2);
    });
    wc.stroke();
    const sc = spectrum.getContext('2d');
    sc.beginPath();
    result.spectrum.forEach((db, i) => {
      const x = (i * spectrum.width) / (result.spectrum.length - 1),
        y = (-db * spectrum.height) / 80;
      if (i) sc.lineTo(x, y);
      else sc.moveTo(x, y);
    });
    sc.stroke();
  }
  $('d-inspect-wav').addEventListener(
    'click',
    safe(async () => {
      const file = $('d-wav').files?.[0];
      if (!file) throw new Error('Choose a PCM16 WAV file first.');
      if (file.size > MAX_WAV_BYTES) throw new Error('WAV file limit is 10 MB.');
      if ($('d-method').value !== 'sound')
        throw new Error('Select Sound & acoustic channels as the discovery method.');
      const generation = ++audioGeneration;
      const metadata = fields();
      const result = inspectWav(await file.arrayBuffer());
      if (generation !== audioGeneration) return;
      audio = createDiscovery({
        ...metadata,
        kind: 'audio',
        payloadsIncluded: false,
        values: null,
        summary: result.summary,
      });
      $('d-audio-result').textContent =
        describe(audio) +
        '. Spectrum is relative power, not a calibrated sound level. No playback or transmission.';
      $('d-save-audio').disabled = false;
      drawAudio(result);
      status('WAV inspected offline. The source audio stays in memory only.');
    }),
  );
  $('d-save-audio').addEventListener(
    'click',
    safe(async () => {
      if (!audio) throw new Error('Inspect a WAV before saving its summary.');
      await store.saveDiscoveries([audio]);
      await refresh();
      status(
        store.persistent
          ? 'Audio summary saved locally. The WAV and waveform/spectrum samples were not stored.'
          : store.warning,
      );
    }),
  );
  $('d-export').addEventListener(
    'click',
    safe(async () =>
      download(
        'sasori-discovery-metadata.json',
        JSON.stringify(discoveryBackup(await store.listDiscoveries()), null, 2),
        'application/json',
      ),
    ),
  );
  $('d-import').addEventListener(
    'change',
    safe(async () => {
      const input = $('d-import');
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_DISCOVERY_FILE_BYTES)
          throw new Error('Discovery import limit is 1 MB.');
        await store.saveDiscoveries(parseDiscoveries(await file.text()));
        await refresh();
        status(
          'Discovery captures imported as new copies. Source labels remain unverified imported claims.',
        );
      } finally {
        input.value = '';
      }
    }),
  );
  comparisonLabels();
  await refresh();
}
