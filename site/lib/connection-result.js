import { DEVICE_INFORMATION_SERVICE } from './device-information.js';

// A useful connection result is independent of authentication or physical control.
export function connectionResult(record, { running = false, state = 'idle' } = {}) {
  if (!record)
    return {
      title: 'Ready to connect',
      detail: 'Power on your toy, keep it nearby, and close other apps connected to it.',
      next: 'Choose a quick setup, confirm ownership, then tap Connect & inspect.',
      channels: [],
    };
  const prefix =
    record.importedAt || record.source === 'imported'
      ? 'IMPORTED · '
      : record.source === 'simulated'
        ? 'SIMULATION · '
        : '';
  if (record.source === 'simulated')
    return {
      title: prefix + (running ? 'Inspection running' : 'Inspection finished'),
      detail: 'Synthetic data · no physical device was connected.',
      next: 'Choose your toy’s live setup to inspect its actual connection.',
      channels: [],
    };
  const observed = record.services.filter((s) => s.evidence === 'observed-this-session');
  const count = observed.reduce((n, s) => n + s.characteristics.length, 0);
  const channels =
    record.source === 'live' && !record.importedAt
      ? observed.flatMap((s) =>
          s.characteristics
            .filter(
              (c) =>
                c.evidence === 'observed-this-session' &&
                c.properties.some((p) => ['notify', 'indicate'].includes(p)),
            )
            .map((c) => ({ service: s.uuid, uuid: c.uuid })),
        )
      : [];
  if (running)
    return {
      title: prefix + (count ? 'Connected to your device' : 'Connecting · ' + state),
      detail: count
        ? count + ' characteristics found. Keep Sasori visible until the capture ends.'
        : 'Choose your toy in the Bluetooth chooser. Stop cancels this attempt.',
      next: 'Results and the next available step appear here. Stop disconnects the toy.',
      channels: [],
    };
  if (record.outcome === 'selection-cancelled')
    return {
      title: prefix + 'No device selected',
      detail: 'The device chooser was cancelled or found no match.',
      next: 'Check the Bluetooth name, or enable Show all Bluetooth devices and try again.',
      channels: [],
    };
  if (['operation-error', 'setup-error'].includes(record.outcome) || !observed.length)
    return {
      title: prefix + 'Connection incomplete',
      detail:
        record.events.findLast((e) => e.level === 'error')?.message ||
        'No service metadata was captured. Result: ' + record.outcome + '.',
      next: 'Check power, range, and the selected setup. If the toy is busy, close its other app before retrying.',
      channels: [],
    };
  const identifying = record.inspection?.service === DEVICE_INFORMATION_SERVICE;
  const fields = Object.keys(record.deviceInformation || {}).length;
  const expected = [
    'inspection-complete',
    'identification-complete',
    'inconclusive-no-notifications',
    'user',
  ].includes(record.outcome);
  return {
    title:
      prefix +
      (!expected
        ? 'Connection ended early'
        : identifying
          ? fields
            ? 'Device information read'
            : 'Connected · model information unavailable'
          : 'Connection details captured'),
    detail:
      count +
      ' characteristics · ' +
      record.stats.packets +
      ' notifications · ' +
      (identifying ? fields + ' model / revision fields · ' : '') +
      'result: ' +
      record.outcome +
      '.',
    next: identifying
      ? 'Save this device setup. For device-specific control, match the model and firmware to a documented adapter; reported values alone do not establish compatibility.'
      : !record.inspection?.notify
        ? channels.length
          ? 'Choose an observed channel below to prepare a notification capture, then reconnect.'
          : 'No notification channel was found in this service. Save or export the connection report to identify the next interface.'
        : record.stats.packets
          ? 'Analyze the notifications in Discovery and compare a repeated capture. Save the setup to reuse this channel.'
          : 'The channel was found but stayed silent. Try another observed channel, or capture while using the toy’s normal buttons.',
    channels,
  };
}
