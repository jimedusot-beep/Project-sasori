// Bluetooth SIG Device Information Service. Only these five non-unique strings
// are read. Serial Number, System ID, addresses, and firmware services are excluded.
export const DEVICE_INFORMATION_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
export const DEVICE_INFORMATION_SOURCE =
  'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/DIS_v1.2/out/en/index-en.html';
export const DEVICE_INFORMATION_FIELDS = Object.freeze([
  { key: 'manufacturer', label: 'Manufacturer', uuid: '00002a29-0000-1000-8000-00805f9b34fb' },
  { key: 'model', label: 'Model', uuid: '00002a24-0000-1000-8000-00805f9b34fb' },
  { key: 'hardware', label: 'Hardware revision', uuid: '00002a27-0000-1000-8000-00805f9b34fb' },
  { key: 'firmware', label: 'Firmware', uuid: '00002a26-0000-1000-8000-00805f9b34fb' },
  { key: 'software', label: 'Software', uuid: '00002a28-0000-1000-8000-00805f9b34fb' },
]);
/** @param {DataView} value */
export function decodeInformationString(value) {
  if (!(value instanceof DataView) || value.byteLength > 512)
    throw new Error('Device information must fit in 512 bytes.');
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // Remove control characters and bidirectional overrides before display/storage.
  // eslint-disable-next-line no-control-regex -- Strip device-supplied control bytes.
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (clean.length > 160) throw new Error('Device information exceeds 160 characters.');
  return clean;
}
/** @param {Record<string, unknown>} input */
export function validateDeviceInformation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid device information.');
  /** @type {Record<string, string>} */
  const result = {};
  for (const { key } of DEVICE_INFORMATION_FIELDS) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 160)
      throw new Error('Invalid device information field.');
    result[key] = input[key];
  }
  return result;
}
