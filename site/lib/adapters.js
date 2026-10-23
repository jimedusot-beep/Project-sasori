import { INSPIRATIONS } from './inspirations.js';
import { analyzeElmoNotification } from '../elmo-packets.mjs';
import { normalizeTraceHex, validateTrace } from './traces.js';

const sig = (value) => '0000' + value + '-0000-1000-8000-00805f9b34fb';
export const MIP_RX = sig('ffe4');
export const MIP_TX = sig('ffe9');
const manifests = [
  {
    id: 'elmo-l2l',
    name: 'Love2Learn Elmo · B6572',
    models: ['Love2Learn Elmo B6572', 'Love2Learn Elmo · B6572'],
    transports: ['ble'],
    liveCapabilities: ['service-inspection', 'notification-capture'],
    decoder: 'elmo-historical-text',
    sources: ['elmo', 'bluefluff', 'homeassistant', 'pybricks'],
    commands: [
      {
        id: 'status',
        label: 'Status query',
        availability: 'unavailable',
        reason:
          'Authentication construction, framing, and correlated response vectors are missing.',
      },
    ],
    recovery:
      'Inspection can be stopped/disconnected. Application-command recovery is not established; no reset or firmware procedure is implemented.',
  },
  {
    id: 'mip-documented',
    name: 'WowWee MiP · documented offline codec',
    models: ['WowWee MiP', 'MiP'],
    transports: ['ble'],
    liveCapabilities: [],
    decoder: 'mip-version',
    sources: ['mip', 'homeassistant', 'pybricks'],
    commands: [
      {
        id: 'software-version',
        label: 'Software version query',
        availability: 'offline-only',
        reason: 'Manufacturer-documented bytes; no live MiP sender or hardware acceptance test.',
      },
    ],
    recovery:
      'No live MiP connection or firmware installer is provided. Physical command recovery remains untested.',
  },
  {
    id: 'generic-trace',
    name: 'Generic protocol trace',
    models: [],
    transports: ['ble', 'serial', 'audio', 'infrared', 'other'],
    liveCapabilities: [],
    decoder: 'generic',
    sources: ['pulseview', 'pixmob', 'hacksby', 'bluefluff'],
    commands: [],
    recovery: 'Offline analysis only. Keep the source capture to reproduce the result.',
  },
];
// Declarative manifests describe known implementation, never imported executable code.
export function validateAdapterManifest(input) {
  if (
    !input ||
    input.schemaVersion !== 1 ||
    !/^[a-z0-9-]{1,40}$/.test(input.id) ||
    typeof input.name !== 'string' ||
    !input.name ||
    input.name.length > 160 ||
    input.hardwareVerified !== false ||
    input.authenticationVerified !== false ||
    !['elmo-historical-text', 'mip-version', 'generic'].includes(input.decoder) ||
    !Array.isArray(input.models) ||
    input.models.length > 10 ||
    input.models.some((m) => typeof m !== 'string' || !m || m.length > 160) ||
    !Array.isArray(input.transports) ||
    !input.transports.length ||
    input.transports.some((t) => !['ble', 'serial', 'audio', 'infrared', 'other'].includes(t)) ||
    !Array.isArray(input.liveCapabilities) ||
    input.liveCapabilities.some(
      (c) => !['service-inspection', 'notification-capture'].includes(c),
    ) ||
    !Array.isArray(input.sources) ||
    !input.sources.length ||
    input.sources.some((id) => !INSPIRATIONS.some((s) => s.id === id)) ||
    !Array.isArray(input.commands) ||
    input.commands.length > 20 ||
    input.commands.some(
      (c) =>
        !c ||
        !/^[a-z0-9-]{1,40}$/.test(c.id) ||
        typeof c.label !== 'string' ||
        c.label.length > 160 ||
        !['offline-only', 'unavailable'].includes(c.availability) ||
        typeof c.reason !== 'string' ||
        c.reason.length > 1000,
    ) ||
    typeof input.recovery !== 'string' ||
    input.recovery.length > 1000
  )
    throw new Error(
      'Invalid analysis adapter manifest. Live actions require a separate reviewed implementation.',
    );
  return structuredClone({
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    models: input.models,
    transports: input.transports,
    decoder: input.decoder,
    sources: input.sources,
    liveCapabilities: input.liveCapabilities,
    commands: input.commands,
    recovery: input.recovery,
    hardwareVerified: false,
    authenticationVerified: false,
  });
}
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
export const ADAPTERS = deepFreeze(
  manifests.map((m) =>
    validateAdapterManifest({
      ...m,
      schemaVersion: 1,
      hardwareVerified: false,
      authenticationVerified: false,
    }),
  ),
);
export function getAdapter(id) {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error('Unknown adapter.');
  return adapter;
}
export function offlineCommand(adapterId, commandId) {
  const adapter = getAdapter(adapterId);
  const command = adapter.commands.find((c) => c.id === commandId);
  if (adapter.id !== 'mip-documented' || command?.availability !== 'offline-only')
    throw new Error(command?.reason || 'No documented offline command is available.');
  return {
    adapterId,
    commandId,
    mode: 'offline-only',
    hex: '14',
    service: sig('ffe5'),
    endpoint: MIP_TX,
    responseEndpoint: MIP_RX,
    responseEncoding: 'ASCII hex',
    source: INSPIRATIONS.find((s) => s.id === 'mip').reference,
    hardwareVerified: false,
  };
}
export function decodeAdapterFrame(adapterId, frame) {
  const adapter = getAdapter(adapterId);
  if (frame.hex === undefined)
    return { kind: 'metadata-only', label: 'Payload omitted', hardwareVerified: false };
  const hex = normalizeTraceHex(frame.hex),
    raw = hex ? hex.split(' ').map((x) => parseInt(x, 16)) : [];
  if (adapter.decoder === 'mip-version') {
    if (frame.direction === 'tx' && frame.endpoint.toLowerCase() === MIP_TX && hex === '14')
      return {
        kind: 'mip-version-request',
        label: 'Documented software version query',
        hardwareVerified: false,
      };
    if (frame.direction === 'rx' && frame.endpoint.toLowerCase() === MIP_RX) {
      const ascii = String.fromCharCode(...raw);
      if (/^14[0-9a-f]{8}$/i.test(ascii)) {
        const bytes = ascii.match(/../g).map((x) => parseInt(x, 16));
        if (bytes[2] >= 1 && bytes[2] <= 12 && bytes[3] >= 1 && bytes[3] <= 31)
          return {
            kind: 'mip-version-reply',
            label: `Documented version fields: year ${bytes[1]}, month ${bytes[2]}, day ${bytes[3]}, revision ${bytes[4]}`,
            fields: { year: bytes[1], month: bytes[2], day: bytes[3], revision: bytes[4] },
            hardwareVerified: false,
          };
      }
    }
  }
  if (adapter.decoder === 'elmo-historical-text' && frame.direction === 'rx') {
    const result = analyzeElmoNotification(hex);
    return {
      kind: 'elmo-text-observation',
      label: JSON.stringify(result),
      hardwareVerified: false,
    };
  }
  return {
    kind: 'unknown',
    label: 'Unclassified bytes · protocol meaning unknown',
    hardwareVerified: false,
  };
}
export function adapterReadiness(adapterId, input) {
  const adapter = getAdapter(adapterId),
    trace = input ? validateTrace(input) : null;
  return {
    adapterId,
    hardwareVerified: false,
    authenticationVerified: false,
    checks: [
      {
        label: 'Declared model matches this adapter',
        done: !!trace && adapter.models.includes(trace.model),
      },
      { label: 'Firmware recorded', done: !!trace && trace.firmware.toLowerCase() !== 'unknown' },
      {
        label: 'TX and RX present in this trace',
        done:
          !!trace &&
          trace.frames.some((f) => f.direction === 'tx') &&
          trace.frames.some((f) => f.direction === 'rx'),
      },
      { label: 'Authentication independently verified on this unit', done: false },
      { label: 'Physical action and recovery tested on this unit', done: false },
    ],
    commands: adapter.commands,
    recovery: adapter.recovery,
  };
}
