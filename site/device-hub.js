import { identityOf, inspectionEvidence, packetTimeline } from './lib/devices.js';

export function mountDeviceHub({ getState, notice, navigate, selectRecord }) {
  const $ = (id) => document.getElementById(id);
  const node = (tag, text, className = '') => {
    const el = document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  let available = null;
  $('hub-url').value = 'https://jimedusot-beep.github.io/Project-sasori/#overview';
  $('hub-copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('hub-url').value);
      notice('Sasori link copied. Open Bluefy and paste it into the address bar.');
    } catch {
      $('hub-url').focus();
      $('hub-url').select();
      notice('The Sasori address is selected. Use Copy, then paste it into Bluefy.');
    }
  });
  $('hub-analyze-last').addEventListener('click', () => {
    const { session, profile } = getState();
    const packet = session?.packets.findLast((p) => p.hex);
    if (!packet) return;
    const identity = session.inspection || identityOf(profile);
    const model = identity.model + ' · ' + identity.revision + ' · ' + identity.firmware;
    if (model.length > 160) {
      notice('Open Discovery and enter a shorter exact model/revision label for this capture.');
      navigate('discovery');
      return;
    }
    navigate('discovery');
    for (const [id, value] of Object.entries({
      'd-device': model,
      'd-label': 'Notification · ' + packet.timestamp,
      'd-method': 'ble',
      'd-kind': 'bytes',
      'd-values': packet.hex,
      'd-evidence': session.source === 'simulated' ? 'synthetic' : 'owner-observed',
      'd-source':
        'Local Sasori session ' +
        session.id +
        ' · ' +
        packet.timestamp +
        ' · endpoint ' +
        packet.characteristic +
        (packet.truncated ? ' · TRUNCATED: partial bytes only.' : '') +
        ' · Protocol meaning remains unverified.',
    })) {
      $(id).value = value;
      $(id).dispatchEvent(new Event('input', { bubbles: true }));
    }
    $('d-analyze').click();
  });
  function render() {
    const { profile, session, records, running, state, support, deviceLabel } = getState();
    if (available !== support.available) {
      $('hub-browser-help').open = !support.available;
      available = support.available;
    }
    $('hub-browser-title').textContent = support.title;
    $('devices-active-summary').textContent = running
      ? (session?.source === 'simulated' ? 'SIMULATED · ' : 'LIVE · ') +
        (deviceLabel || profile.label) +
        ' · ' +
        state
      : 'No active connection. Saved profiles keep configuration; each inspection requires a fresh connection.';
    $('hub-analyze-last').disabled = !session?.packets.some((p) => p.hex);
    const identity = session?.inspection && running ? session.inspection : identityOf(profile);
    $('hub-current-title').textContent = running
      ? deviceLabel || profile.label
      : 'No active connection';
    $('hub-current-state').textContent = running ? state : 'Disconnected';
    $('hub-current-model').textContent =
      identity.model + ' · board ' + identity.revision + ' · firmware ' + identity.firmware;
    $('hub-current-source').textContent = running
      ? session?.source === 'simulated'
        ? 'SIMULATION · NO HARDWARE'
        : 'LIVE · INSPECTION ONLY'
      : 'Select a profile and tap Connect & inspect. Saved profiles are not active connections.';
    $('hub-current-result').textContent = session?.endedAt
      ? 'Last result: ' + session.outcome + ' · ' + session.stats.packets + ' notifications'
      : running
        ? 'Keep this app visible during the inspection. Use Stop to disconnect.'
        : 'Manual connection · one device at a time';
    const evidence = inspectionEvidence(records, profile);
    $('hub-evidence-count').textContent = evidence.complete + ' / 5 full-length capture candidates';
    $('hub-evidence').replaceChildren();
    for (const [label, done] of [
      ['Five foreground inspections of at least 15 seconds', evidence.complete >= 5],
      ['Manual stop captured after service discovery', evidence.manualStop],
      ['Page-background stop captured after service discovery', evidence.backgroundStop],
      ['Notify / Indicate property observed', evidence.notificationProperties],
    ])
      $('hub-evidence').append(node('li', (done ? 'Recorded: ' : 'Needed: ') + label));
    $('hub-history').replaceChildren();
    const recent = records.filter((r) => r.profileId === profile.id).slice(0, 5);
    if (!recent.length)
      $('hub-history').append(node('p', 'No saved sessions for this profile yet.', 'hint'));
    for (const record of recent) {
      const button = node(
        'button',
        record.title +
          ' · ' +
          (record.importedAt ? 'IMPORTED / ' : '') +
          record.source.toUpperCase() +
          ' · ' +
          record.outcome,
        'hub-history-row',
      );
      button.addEventListener('click', () => {
        navigate('sessions');
        selectRecord(record.id);
      });
      $('hub-history').append(button);
    }
    $('hub-timeline').replaceChildren();
    if (!session?.packets.length) {
      $('hub-timeline').append(
        node(
          'p',
          'Notification timing appears here during a capture. Payload bytes are omitted from this view.',
          'hint',
        ),
      );
      return;
    }
    const table = node('table', '', 'diff-table'),
      head = node('thead', ''),
      row = node('tr', '');
    table.append(
      node(
        'caption',
        'Last 100 notifications · milliseconds from session start · timing does not establish message meaning',
      ),
    );
    for (const title of ['Time (ms)', 'Gap (ms)', 'Bytes', 'Pattern']) {
      const cell = node('th', title);
      cell.scope = 'col';
      row.append(cell);
    }
    head.append(row);
    table.append(head);
    const body = node('tbody', '');
    for (const item of packetTimeline(session)) {
      const tr = node('tr', '');
      for (const value of [item.offsetMs, item.gapMs ?? '—', item.bytes, item.kind])
        tr.append(node('td', String(value)));
      body.append(tr);
    }
    table.append(body);
    $('hub-timeline').append(table);
  }
  render();
  return { render };
}
