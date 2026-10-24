import { identityOf, inspectionEvidence, packetTimeline } from './lib/devices.js';
import { connectionResult } from './lib/connection-result.js';
import { DEVICE_INFORMATION_FIELDS } from './lib/device-information.js';
import { GATT_REGISTRY } from './lib/profiles.js';

export function mountDeviceHub({
  getState,
  notice,
  navigate,
  selectRecord,
  prepareEndpoint,
  saveDevice,
  exportReport,
}) {
  const $ = (id) => document.getElementById(id);
  const node = (tag, text, className = '') => {
    const el = document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  let available = null;
  const lastRecord = () => {
    const { session, records, profile } = getState();
    return session?.profileId === profile.id
      ? session
      : records.find((r) => r.profileId === profile.id);
  };
  $('result-save-device').addEventListener('click', () => saveDevice(lastRecord()));
  $('result-export').addEventListener('click', () => exportReport(lastRecord()));
  $('hub-url').value = 'https://jimedusot-beep.github.io/Project-sasori/#overview';
  $('hub-copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('hub-url').value);
      notice('Sasori link copied. Paste it into your Bluetooth-capable browser.');
    } catch {
      $('hub-url').focus();
      $('hub-url').select();
      notice(
        'The Sasori address is selected. Copy and paste it into your Bluetooth-capable browser.',
      );
    }
  });
  $('hub-analyze-last').addEventListener('click', () => {
    const { session, profile } = getState();
    if (session?.profileId !== profile.id) return;
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
    const record = lastRecord();
    const result = connectionResult(record, { running, state });
    $('connection-result-title').textContent = result.title;
    $('connection-result-detail').textContent = result.detail;
    $('connection-result-next').textContent = result.next;
    $('result-save-device').disabled =
      running ||
      !record?.endedAt ||
      record.source !== 'live' ||
      !!record.importedAt ||
      !record.services.length;
    $('result-export').disabled = running || !record?.endedAt;
    $('device-information').replaceChildren();
    for (const field of DEVICE_INFORMATION_FIELDS) {
      const value = record?.deviceInformation?.[field.key];
      if (value)
        $('device-information').append(
          node('dt', 'Reported ' + field.label.toLowerCase()),
          node('dd', value),
        );
    }
    $('connection-result-channels').replaceChildren();
    for (const channel of result.channels) {
      const label =
        GATT_REGISTRY.find((entry) => entry.uuid === channel.uuid)?.label || channel.uuid;
      const button = node('button', 'Capture from ' + label, 'secondary');
      button.addEventListener('click', () => prepareEndpoint(channel.service, channel.uuid));
      $('connection-result-channels').append(button);
    }
    $('devices-active-summary').textContent = running
      ? (session?.source === 'simulated' ? 'SIMULATED · ' : 'LIVE · ') +
        (deviceLabel || profile.label) +
        ' · ' +
        state
      : 'No active connection. Saved profiles keep configuration; each inspection requires a fresh connection.';
    $('hub-analyze-last').disabled =
      session?.profileId !== profile.id || !session?.packets.some((p) => p.hex);
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
    $('hub-current-result').textContent =
      session?.profileId === profile.id && session?.endedAt
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
