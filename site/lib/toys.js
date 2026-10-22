import { normalizeUUID } from './profiles.js';
import { recordId } from './records.js';
import { sanitizeText } from './diagnostics.js';

export const MAX_TOYS = 20;
export const MAX_TOY_FILE_BYTES = 128000;
const text = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(label + ' is missing or too long.');
  return value.trim();
};
export function validateToy(input) {
  if (!input || input.format !== 'sasori.toy' || input.schemaVersion !== 1)
    throw new Error('Unsupported toy profile format/version.');
  if (typeof input.id !== 'string' || !/^toy-[a-zA-Z0-9_-]{1,36}$/.test(input.id))
    throw new Error('Invalid toy profile identifier.');
  return {
    format: 'sasori.toy',
    schemaVersion: 1,
    id: input.id,
    label: text(input.label, 80, 'Toy name', true),
    namePrefix: text(input.namePrefix, 60, 'Bluetooth name prefix'),
    service: normalizeUUID(text(input.service, 128, 'Service UUID', true)),
    notify:
      input.notify === '' ? '' : normalizeUUID(text(input.notify, 128, 'Notification UUID', true)),
    sourceNote: text(input.sourceNote, 1000, 'UUID source note', true),
  };
}
export function createToy(fields) {
  return validateToy({
    ...fields,
    format: 'sasori.toy',
    schemaVersion: 1,
    id: 'toy-' + recordId(),
  });
}
export function exportToys(toys) {
  if (toys.length > MAX_TOYS) throw new Error('Toy profile limit exceeded.');
  return {
    format: 'sasori.toys',
    schemaVersion: 1,
    profiles: toys.map((toy) => {
      const clean = validateToy(toy);
      return {
        ...clean,
        label: sanitizeText(clean.label).slice(0, 80),
        sourceNote: sanitizeText(clean.sourceNote).slice(0, 1000),
      };
    }),
  };
}
export function parseToys(value) {
  if (new TextEncoder().encode(value).byteLength > MAX_TOY_FILE_BYTES)
    throw new Error('Toy profile import limit is 128 KB.');
  let data;
  try {
    data = JSON.parse(value);
  } catch {
    throw new Error('The toy profile JSON is not valid.');
  }
  if (
    data?.format !== 'sasori.toys' ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length < 1 ||
    data.profiles.length > MAX_TOYS
  )
    throw new Error('Choose a Sasori toy profile backup with 1–20 profiles.');
  return data.profiles.map(validateToy);
}
export function asDeviceProfile(toy) {
  return { ...toy, status: 'User-supplied UUIDs · hardware validation pending', custom: true };
}
