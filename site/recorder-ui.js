import {
  parseTrace,
  validateTrace,
  portableTrace,
  markTrace,
  traceSummary,
  compareTraces,
  selectedInterval,
  MAX_TRACE_FILE_BYTES,
} from './lib/traces.js';
import {
  ADAPTERS,
  getAdapter,
  decodeAdapterFrame,
  offlineCommand,
  adapterReadiness,
  MIP_RX,
  MIP_TX,
} from './lib/adapters.js';
import { INSPIRATIONS } from './lib/inspirations.js';
import { createSession, portableRecord } from './lib/records.js';

export async function mountRecorder({ store, download, onSaved, getSession, navigate }) {
  const $ = (id) => document.getElementById(id);
  const node = (tag, text, className = '') => {
    const el = document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  let current = null,
    first = null,
    second = null;
  const status = (text) => {
    $('r-status').textContent = text;
  };
  const safe = (action) => async (event) => {
    event?.preventDefault();
    try {
      await action(event);
    } catch (error) {
      status(error.message);
    }
  };
  const adapterId = () => $('r-adapter').value;
  const fields = () => ({
    label: $('r-label').value,
    model: $('r-model').value,
    firmware: $('r-firmware').value,
    transport: $('r-transport').value,
    evidence: $('r-evidence').value,
    sourceNote: $('r-source').value,
  });
  const link = (text, url) => {
    const a = node('a', text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  for (const adapter of ADAPTERS) {
    const option = node('option', adapter.name);
    option.value = adapter.id;
    $('r-adapter').append(option);
  }
  for (const source of INSPIRATIONS) {
    const card = node('article', '', 'discovery-method');
    card.append(
      node('h3', source.name),
      node('p', source.aspect),
      node('p', 'Implementation: ' + source.implementation, 'hint'),
      node('p', source.license + ' · ' + source.reuse, 'hint'),
      link('Pinned source ↗', source.reference),
      node('span', ' · '),
      link('License / inspected tree ↗', source.licenseReference),
    );
    if (['hacksby', 'pixmob'].includes(source.id)) {
      const button = node(
        'button',
        source.id === 'hacksby' ? 'Open audio analysis' : 'Open infrared timing analysis',
        'secondary',
      );
      button.addEventListener('click', () => {
        navigate('discovery');
        $('d-method').value = source.id === 'hacksby' ? 'sound' : 'infrared';
        $('d-method').dispatchEvent(new Event('change', { bubbles: true }));
        if (source.id === 'pixmob') {
          $('d-kind').value = 'pulses';
          $('d-kind').dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      card.append(button);
    }
    $('r-inspirations').append(card);
  }
  function readiness() {
    const adapter = getAdapter(adapterId()),
      report = adapterReadiness(adapter.id, current);
    $('r-readiness').replaceChildren(node('p', report.recovery));
    const list = node('ul', '');
    for (const check of report.checks)
      list.append(node('li', (check.done ? 'Recorded: ' : 'Needed: ') + check.label));
    $('r-readiness').append(list);
    for (const command of report.commands)
      $('r-readiness').append(
        node('p', command.label + ' · ' + command.availability + ' · ' + command.reason),
      );
    $('r-plan').disabled = adapter.id !== 'mip-documented';
    $('r-plan-output').textContent = '';
  }
  function render() {
    readiness();
    $('r-timeline').replaceChildren();
    $('r-markers').replaceChildren();
    for (const id of ['r-save', 'r-export', 'r-add-marker', 'r-use-a', 'r-use-b'])
      $(id).disabled = !current;
    for (const id of ['r-tx', 'r-rx']) $(id).replaceChildren();
    $('r-interval').disabled = true;
    $('r-interval-output').textContent = '';
    if (!current) {
      $('r-summary').textContent = 'Import a trace or load the synthetic MiP example.';
      return;
    }
    const summary = traceSummary(current);
    $('r-summary').textContent =
      'IMPORTED / ' +
      current.evidence.toUpperCase() +
      ' CLAIM · ' +
      current.model +
      ' · firmware ' +
      current.firmware +
      ' · ' +
      summary.tx +
      ' TX / ' +
      summary.rx +
      ' RX · ' +
      summary.durationMs +
      ' ms · ' +
      summary.retainedBytes +
      ' retained bytes. Decoder selection does not establish device compatibility.';
    const table = node('table', '', 'diff-table');
    table.append(
      node(
        'caption',
        'Capture-relative milliseconds · TX/RX as declared by the importer · each row is a capture frame, not an assumed application message',
      ),
    );
    const head = node('thead', ''),
      hr = node('tr', '');
    for (const title of ['Frame / ms', 'Direction / endpoint', 'Bytes', 'Interpretation']) {
      const th = node('th', title);
      th.scope = 'col';
      hr.append(th);
    }
    head.append(hr);
    table.append(head);
    const body = node('tbody', '');
    current.frames.forEach((frame, index) => {
      const row = node('tr', '');
      row.append(
        node('td', index + ' / ' + frame.tMs),
        node('td', frame.direction.toUpperCase() + ' · ' + frame.endpoint),
        node(
          'td',
          frame.hex === undefined ? frame.length + ' bytes · omitted' : frame.hex || '(empty)',
        ),
        node('td', decodeAdapterFrame(adapterId(), frame).label),
      );
      body.append(row);
      const option = node('option', index + ' · ' + frame.tMs + ' ms · ' + frame.endpoint);
      option.value = index;
      $(frame.direction === 'tx' ? 'r-tx' : 'r-rx').append(option);
    });
    table.append(body);
    $('r-timeline').append(table);
    $('r-interval').disabled = !$('r-tx').options.length || !$('r-rx').options.length;
    for (const marker of current.markers)
      $('r-markers').append(node('li', marker.tMs + ' ms · ' + marker.label));
  }
  function use(trace) {
    current = validateTrace(trace);
    $('r-keep-raw').checked = false;
    $('r-marker-time').value = current.frames.at(-1).tMs;
    $('r-marker-label').value = '';
    render();
  }
  $('r-adapter').addEventListener('change', render);
  $('r-import').addEventListener(
    'click',
    safe(() => {
      use(parseTrace($('r-input').value, fields()));
      status('Trace loaded locally. Nothing is sent to hardware.');
    }),
  );
  $('r-file').addEventListener(
    'change',
    safe(async (event) => {
      const input = event.target;
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_TRACE_FILE_BYTES) throw new Error('Trace import limit is 512 KiB.');
        use(parseTrace(await file.text(), fields()));
        status('Imported ' + file.name + ' as an unverified source claim.');
      } finally {
        input.value = '';
      }
    }),
  );
  $('r-example').addEventListener('click', () => {
    $('r-adapter').value = 'mip-documented';
    use({
      format: 'sasori.trace',
      schemaVersion: 1,
      label: 'Synthetic MiP software version',
      model: 'WowWee MiP',
      firmware: 'unknown',
      transport: 'ble',
      evidence: 'synthetic',
      sourceNote:
        'Synthetic timing with the manufacturer README’s documented version-response example. Not a physical capture.',
      payloadsIncluded: true,
      frames: [
        { tMs: 0, direction: 'tx', endpoint: MIP_TX, hex: '14' },
        { tMs: 85, direction: 'rx', endpoint: MIP_RX, hex: '31 34 30 45 30 32 31 42 30 37' },
      ],
      markers: [{ tMs: 0, label: 'Synthetic status-query example' }],
    });
    status(
      'Synthetic MiP example loaded. Timing is invented; bytes follow the cited manufacturer example.',
    );
  });
  $('r-current-session').addEventListener(
    'click',
    safe(() => {
      const session = getSession();
      if (session?.packets.some((p) => p.truncated))
        throw new Error(
          'This session contains truncated packets. Preserve its original metadata report and use a smaller complete capture for byte-level analysis.',
        );
      if (!session?.packets.length)
        throw new Error(
          'Capture notifications in Protocol explorer first. This handoff contains RX only, not another app’s traffic.',
        );
      const start = Date.parse(session.startedAt);
      use({
        format: 'sasori.trace',
        schemaVersion: 1,
        label: session.title.slice(0, 120),
        model: session.inspection?.model || 'unknown',
        firmware: session.inspection?.firmware || 'unknown',
        transport: 'ble',
        evidence: session.source === 'simulated' ? 'synthetic' : 'owner-observed',
        sourceNote:
          'RX-only handoff from Sasori session ' + session.id + '. No app-to-toy TX was captured.',
        payloadsIncluded: true,
        frames: session.packets.map((p) => ({
          tMs: Date.parse(p.timestamp) - start,
          direction: 'rx',
          endpoint: p.characteristic,
          length: p.hex ? p.hex.split(' ').length : p.length,
          ...(p.hex === undefined ? {} : { hex: p.hex }),
        })),
        markers: [],
      });
      status(
        'Current session copied as RX-only observations. No TX frames or authentication verdict were invented.',
      );
    }),
  );
  $('r-add-marker').addEventListener(
    'click',
    safe(() => {
      current = markTrace(current, Number($('r-marker-time').value), $('r-marker-label').value);
      render();
      status('Observation marker added.');
    }),
  );
  $('r-interval').addEventListener(
    'click',
    safe(() => {
      const result = selectedInterval(current, Number($('r-tx').value), Number($('r-rx').value));
      $('r-interval-output').textContent = result.elapsedMs + ' ms · ' + result.verdict;
    }),
  );
  $('r-plan').addEventListener(
    'click',
    safe(() => {
      $('r-plan-output').textContent = JSON.stringify(
        offlineCommand(adapterId(), 'software-version'),
        null,
        2,
      );
    }),
  );
  $('r-export').addEventListener(
    'click',
    safe(() =>
      download(
        'sasori-protocol-trace.json',
        JSON.stringify(portableTrace(current, $('r-keep-raw').checked), null, 2),
        'application/json',
      ),
    ),
  );
  $('r-save').addEventListener(
    'click',
    safe(async () => {
      const trace = portableTrace(current, $('r-keep-raw').checked);
      const record = createSession(
        trace.evidence === 'synthetic' ? 'simulated' : 'imported',
        'trace-' + adapterId(),
        trace.label,
      );
      record.importedAt = new Date().toISOString();
      record.endedAt = record.startedAt;
      record.outcome = 'offline-trace';
      record.protocolTrace = trace;
      record.payloadsIncluded = trace.payloadsIncluded;
      await store.save(portableRecord(record, trace.payloadsIncluded));
      await refresh();
      await onSaved();
      status(
        store.persistent
          ? 'Trace saved in Research records. ' +
              (trace.payloadsIncluded ? 'Raw bytes included.' : 'Metadata only; raw bytes omitted.')
          : store.warning,
      );
    }),
  );
  for (const [id, slot] of [
    ['r-use-a', 'a'],
    ['r-use-b', 'b'],
  ])
    $(id).addEventListener(
      'click',
      safe(() => {
        if (slot === 'a') first = structuredClone(current);
        else second = structuredClone(current);
        $('r-comparison').textContent =
          'A: ' + (first?.label || 'not selected') + ' · B: ' + (second?.label || 'not selected');
        $('r-compare').disabled = !first || !second;
      }),
    );
  $('r-compare').addEventListener(
    'click',
    safe(() => {
      const rows = compareTraces(first, second);
      $('r-comparison').textContent =
        'Same-index comparison, not sequence alignment or protocol proof.\n' +
        rows
          .map(
            (r) =>
              `Frame ${r.index}: ${r.kind}` +
              (r.timeDeltaMs === undefined
                ? ''
                : ` · Δ ${r.timeDeltaMs} ms · route changed ${r.routeChanged} · changed offsets [${r.changedByteOffsets.join(', ')}]`),
          )
          .join('\n');
    }),
  );
  async function refresh() {
    const records = (await store.list()).filter((r) => r.protocolTrace);
    $('r-saved').replaceChildren();
    if (!records.length)
      $('r-saved').append(
        node(
          'p',
          'Saved traces appear here. They share the Research records storage and backup limits.',
          'hint',
        ),
      );
    for (const record of records) {
      const button = node(
        'button',
        record.title +
          ' · ' +
          record.source.toUpperCase() +
          ' · ' +
          (record.protocolTrace.payloadsIncluded ? 'RAW' : 'METADATA'),
        'hub-history-row',
      );
      button.addEventListener(
        'click',
        safe(() => {
          const id = record.profileId.slice('trace-'.length);
          $('r-adapter').value = ADAPTERS.some((a) => a.id === id) ? id : 'generic-trace';
          use(record.protocolTrace);
          status('Saved trace loaded. Imported/source labels remain claims.');
        }),
      );
      $('r-saved').append(button);
    }
  }
  render();
  await refresh();
  return { refresh };
}
