import { normalizeUUID } from './profiles.js';

export const INSPECTION_ADAPTER = Object.freeze({
  id: 'ble-inspection/v1',
  capabilities: ['service-inspection', 'notification-capture'],
  authenticationVerified: false,
  physicalActionsVerified: false,
});
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('Invalid ' + label + '.');
  return value.trim();
};
export function identityOf(profile) {
  return {
    model: text(profile.model || profile.label, 160, 'device model'),
    revision: text(profile.revision || 'unknown', 60, 'board revision'),
    firmware: text(profile.firmware || 'unknown', 60, 'firmware'),
  };
}
export function validateInspection(input) {
  if (
    !input ||
    input.adapterId !== INSPECTION_ADAPTER.id ||
    !['web-bluetooth', 'core-bluetooth', 'bleak', 'simulation'].includes(input.transport) ||
    !Number.isSafeInteger(input.requestedDurationMs) ||
    input.requestedDurationMs < 100 ||
    input.requestedDurationMs > 30000 ||
    !Number.isSafeInteger(input.gattDurationMs) ||
    input.gattDurationMs < 0 ||
    input.gattDurationMs > 86400000
  )
    throw new Error('Invalid inspection context.');
  return {
    adapterId: INSPECTION_ADAPTER.id,
    transport: input.transport,
    model: text(input.model, 160, 'device model'),
    revision: text(input.revision, 60, 'board revision'),
    firmware: text(input.firmware, 60, 'firmware'),
    service: normalizeUUID(input.service),
    notify: input.notify === '' ? '' : normalizeUUID(input.notify),
    requestedDurationMs: input.requestedDurationMs,
    gattDurationMs: input.gattDurationMs,
  };
}
export function makeInspection(
  profile,
  service,
  notify,
  transport = 'web-bluetooth',
  duration = 15000,
) {
  return validateInspection({
    adapterId: INSPECTION_ADAPTER.id,
    ...identityOf(profile),
    service,
    notify,
    transport,
    requestedDurationMs: duration,
    gattDurationMs: 0,
  });
}
export function bluetoothSupport({ secure = true, bluetooth, native = false } = {}) {
  if (!secure)
    return {
      available: false,
      title: 'Open the secure Sasori page',
      detail: 'Bluetooth requires HTTPS. Your saved profiles and offline tools remain available.',
    };
  if (typeof bluetooth?.requestDevice === 'function')
    return {
      available: true,
      title: native ? 'Native iPhone Bluetooth ready' : 'Browser Bluetooth API detected',
      detail:
        'Choose a device profile, confirm ownership, then tap Connect & inspect. Device compatibility is established by inspection.',
    };
  return {
    available: false,
    title: 'This browser cannot connect over Bluetooth',
    detail:
      'On iPhone or iPad, open this same Sasori page inside Bluefy. The connection controls and records stay in Sasori. Offline tools and simulation work here.',
  };
}
export function inspectionEvidence(records, profile) {
  const identity = identityOf(profile);
  const candidates = [...new Map(records.map((r) => [r.id, r])).values()].filter((r) => {
    const i = r.inspection;
    return (
      r.profileId === profile.id &&
      r.source === 'live' &&
      !r.importedAt &&
      r.endedAt &&
      i &&
      i.transport !== 'simulation' &&
      ['model', 'revision', 'firmware'].every((key) => i[key] === identity[key]) &&
      r.services.some((s) => s.uuid === i.service && s.evidence === 'observed-this-session')
    );
  });
  return {
    complete: candidates.filter(
      (r) =>
        ['inspection-complete', 'inconclusive-no-notifications'].includes(r.outcome) &&
        r.inspection.requestedDurationMs >= 15000 &&
        r.inspection.gattDurationMs >= 14800,
    ).length,
    manualStop: candidates.some((r) => r.outcome === 'user'),
    backgroundStop: candidates.some((r) => r.outcome === 'page-hidden'),
    notificationProperties: candidates.some((r) =>
      r.services.some((s) =>
        s.characteristics.some(
          (c) =>
            c.evidence === 'observed-this-session' &&
            c.properties.some((p) => ['notify', 'indicate'].includes(p)),
        ),
      ),
    ),
    hardwareVerified: false,
  };
}
export function packetTimeline(record) {
  const start = Date.parse(record.startedAt);
  return record.packets.slice(-100).map((p, index, rows) => ({
    timestamp: p.timestamp,
    offsetMs: Date.parse(p.timestamp) - start,
    gapMs: index ? Date.parse(p.timestamp) - Date.parse(rows[index - 1].timestamp) : null,
    bytes: p.length,
    kind: p.kind,
    endpoint: p.characteristic,
  }));
}
