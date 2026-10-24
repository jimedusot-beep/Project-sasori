import { recordId } from './records.js';
import { sanitizeText } from './diagnostics.js';
import { CONTROL_FAMILIES } from './device-controls.js?v=recognition-20261024';
import { CONTROL_ADAPTER } from './standard-controls.js';

export const MAX_CONTROL_SETUPS = 20;
export const MAX_CONTROL_SETUP_BYTES = 64000;
export function validateControlSetups(input) {
  if (
    !input ||
    input.format !== 'sasori.controls' ||
    input.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.revision ?? 0) ||
    (input.revision ?? 0) < 0 ||
    (input.revision ?? 0) > 1000000000 ||
    !Array.isArray(input.targets) ||
    input.targets.length > MAX_CONTROL_SETUPS
  )
    throw new Error('Choose a Sasori controls backup with up to 20 saved devices.');
  const ids = new Set();
  const targets = input.targets.map((t) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !/^control-[a-zA-Z0-9_-]{1,36}$/.test(t.id) ||
      ids.has(t.id) ||
      typeof t.label !== 'string' ||
      !t.label.trim() ||
      t.label.length > 80 ||
      !CONTROL_FAMILIES.some((family) => family.id === t.adapterId) ||
      typeof t.namePrefix !== 'string' ||
      t.namePrefix.length > 60 ||
      (t.deviceId !== undefined &&
        (typeof t.deviceId !== 'string' || !t.deviceId || t.deviceId.length > 256))
    )
      throw new Error('Invalid saved control setup.');
    ids.add(t.id);
    return {
      id: t.id,
      label: t.label.trim(),
      adapterId: t.adapterId,
      namePrefix: t.namePrefix.trim(),
      ...(t.deviceId ? { deviceId: t.deviceId } : {}),
    };
  });
  return {
    format: 'sasori.controls',
    schemaVersion: 1,
    revision: input.revision ?? 0,
    selectedId:
      input.selectedId === ''
        ? ''
        : ids.has(input.selectedId)
          ? input.selectedId
          : targets[0]?.id || '',
    targets,
  };
}
export const emptyControlSetups = () =>
  validateControlSetups({ format: 'sasori.controls', schemaVersion: 1, targets: [] });
export function rememberControlDevice(
  input,
  device,
  { label = '', namePrefix = '', targetId = '', adapterId = CONTROL_ADAPTER.id } = {},
) {
  const data = validateControlSetups(input);
  if (!device || typeof device.id !== 'string' || !device.id || device.id.length > 256)
    throw new Error('This platform cannot remember the selected device identifier.');
  const existing =
    data.targets.find((t) => t.deviceId === device.id && t.adapterId === adapterId) ||
    data.targets.find((t) => t.id === targetId && !t.deviceId && t.adapterId === adapterId);
  const target = {
    id: existing?.id || 'control-' + recordId(),
    label: (label.trim() || existing?.label || device.name || 'My Bluetooth device').slice(0, 80),
    adapterId,
    namePrefix,
    deviceId: device.id,
  };
  if (existing) data.targets[data.targets.indexOf(existing)] = target;
  else data.targets.push(target);
  data.selectedId = target.id;
  return validateControlSetups(data);
}
export function portableControlSetups(input) {
  const data = validateControlSetups(input);
  return validateControlSetups({
    ...data,
    revision: 0,
    targets: data.targets.map(({ id, label, adapterId, namePrefix }) => ({
      id,
      label: sanitizeText(label).slice(0, 80),
      adapterId,
      namePrefix,
    })),
  });
}
export function parseControlSetups(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_CONTROL_SETUP_BYTES)
    throw new Error('Control setup import limit is 64 KB.');
  const data = portableControlSetups(JSON.parse(text));
  // A backup restores configuration, never grants a device connection or command capability.
  return validateControlSetups({
    ...data,
    selectedId: '',
    targets: data.targets.map((t) => ({ ...t, id: 'control-' + recordId() })),
  });
}
export function mergeControlSetups(current, incoming) {
  const a = validateControlSetups(current),
    b = portableControlSetups(incoming);
  return validateControlSetups({ ...a, targets: [...a.targets, ...b.targets] });
}
