// Original Sasori parser/encoder. Public format facts and exact source pins:
// docs/flipper-ir-import.md. No Flipper firmware runtime code is incorporated.
import { validatePocketConfig } from './pocket-ir.js';
import { validatePocketProfile } from './pocket-ir-setups.js';
export const MAX_IR_BYTES = 128 * 1024;
export const MAX_IR_SIGNALS = 128;
const PROTOCOLS = Object.freeze({
  NEC: [8, 8],
  NECext: [16, 16],
  Samsung32: [8, 8],
  SIRC: [5, 7],
  SIRC15: [8, 7],
  SIRC20: [13, 7],
});
const fail = (message) => {
  throw new Error(message);
};
function reverse(value, bits) {
  let result = 0;
  for (let bit = 0; bit < bits; bit++) {
    result = result * 2 + (value % 2);
    value = Math.floor(value / 2);
  }
  return result;
}
export function encodeFlipperSignal(protocol, address, command) {
  const widths = Object.hasOwn(PROTOCOLS, protocol) && PROTOCOLS[protocol];
  if (!widths) fail('This IR protocol is not supported by the current bridge.');
  if (![address, command].every((v, i) => Number.isInteger(v) && v >= 0 && v < 2 ** widths[i]))
    fail('Address or command exceeds the protocol width.');
  let code,
    bits = 32,
    proto = 'NEC';
  if (protocol === 'NECext') code = reverse(address, 16) * 65536 + reverse(command, 16);
  else if (protocol === 'NEC' || protocol === 'Samsung32') {
    const a = reverse(address, 8),
      c = reverse(command, 8);
    code = a * 16777216 + (protocol === 'NEC' ? a ^ 255 : a) * 65536 + c * 256 + (c ^ 255);
    if (protocol === 'Samsung32') proto = 'SAMSUNG';
  } else {
    bits = protocol === 'SIRC' ? 12 : protocol === 'SIRC15' ? 15 : 20;
    proto = 'SONY';
    code = reverse(address * 128 + command, bits);
  }
  const result = validatePocketConfig({ slot: 1, proto, bits, code: '0x' + code.toString(16) });
  return { proto: result.proto, code: result.code, bits: result.bits };
}
function littleEndian(value) {
  if (typeof value !== 'string' || !/^[\da-f]{2}(?:[ \t]+[\da-f]{2}){3}$/i.test(value))
    fail('Address and command must each contain four hexadecimal bytes.');
  return value
    .split(/[ \t]+/)
    .reduce((sum, byte, i) => sum + Number.parseInt(byte, 16) * 256 ** i, 0);
}
function fieldsExactly(fields, names) {
  if (
    Object.keys(fields).some((key) => !names.includes(key)) ||
    names.some((key) => !Object.hasOwn(fields, key))
  )
    fail('A signal has missing, conflicting, or unknown fields.');
}
function signal(fields, index) {
  if (!/^[\x20-\x7e]{1,80}$/.test(fields.name) || !fields.name.trim())
    fail('Button names must be printable ASCII, at most 80 characters.');
  const name = fields.name.trim();
  if (fields.type === 'raw') {
    fieldsExactly(fields, ['name', 'type', 'frequency', 'duty_cycle', 'data']);
    if (
      !/^\d{1,7}$/.test(fields.frequency) ||
      Number(fields.frequency) < 1 ||
      !/^(?:0?\.\d+|1(?:\.0+)?)$/.test(fields.duty_cycle) ||
      Number(fields.duty_cycle) <= 0 ||
      Number(fields.duty_cycle) > 1 ||
      !/^\d+(?:[ \t]+\d+)*$/.test(fields.data)
    )
      fail('Malformed RAW signal fields.');
    const durations = fields.data.split(/[ \t]+/);
    if (
      durations.length > 1024 ||
      durations.some(
        (v) => !Number.isSafeInteger(Number(v)) || Number(v) < 1 || Number(v) > 4294967295,
      )
    )
      fail('RAW signal timings exceed the file format limits.');
    return {
      index,
      name,
      supported: false,
      protocol: 'RAW',
      reason: 'RAW timings need a different transmitter; they are not converted or sent.',
    };
  }
  if (fields.type !== 'parsed') fail('Signal type must be parsed or raw.');
  fieldsExactly(fields, ['name', 'type', 'protocol', 'address', 'command']);
  if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(fields.protocol)) fail('Invalid protocol name.');
  const address = littleEndian(fields.address),
    command = littleEndian(fields.command);
  if (!Object.hasOwn(PROTOCOLS, fields.protocol))
    return {
      index,
      name,
      supported: false,
      protocol: fields.protocol,
      reason: 'This protocol is not implemented by the current bridge.',
    };
  return {
    index,
    name,
    supported: true,
    protocol: fields.protocol,
    ...encodeFlipperSignal(fields.protocol, address, command),
  };
}
export function parseFlipperIR(raw) {
  if (
    typeof raw !== 'string' ||
    !raw ||
    raw.length > MAX_IR_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_IR_BYTES
  )
    fail('Choose a nonempty .ir file no larger than 128 KB.');
  const header = Object.create(null),
    records = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    if (records.length >= MAX_IR_SIGNALS) fail('Use a remote file with at most 128 signals.');
    records.push(signal(current, records.length));
  };
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (line.length > 16000) fail('A signal line exceeds the import limit.');
    const match = /^([A-Za-z_]+):[ \t]*(.*)$/.exec(trimmed);
    if (!match) fail('Invalid .ir syntax. Each field needs a name and colon.');
    const [, key, value] = match;
    if (key === 'name') {
      if (header.Filetype !== 'IR signals file' || header.Version !== '1')
        fail('Use a Flipper IR signals file, Version 1, for one remote.');
      finish();
      current = Object.create(null);
    }
    const target = current || header;
    if (Object.hasOwn(target, key))
      fail('Duplicate .ir fields are ambiguous; no setup was changed.');
    if (!current && !['Filetype', 'Version'].includes(key))
      fail('Missing remote file header or button name.');
    target[key] = value;
  }
  finish();
  if (header.Filetype !== 'IR signals file' || header.Version !== '1' || records.length < 1)
    fail('Use a Flipper IR signals file, Version 1, with at least one button.');
  return { format: 'sasori.flipper-ir-preview', schema: 1, signals: records };
}
export function profileFromFlipperIR(preview, selected, { id, name } = {}) {
  if (
    preview?.format !== 'sasori.flipper-ir-preview' ||
    preview.schema !== 1 ||
    !Array.isArray(preview.signals) ||
    !Array.isArray(selected) ||
    selected.length < 1 ||
    selected.length > 5 ||
    new Set(selected).size !== selected.length
  )
    fail('Select one to five supported buttons.');
  const buttons = selected.map((index, slot) => {
    const item = Number.isInteger(index) && index >= 0 && preview.signals[index];
    if (!item?.supported || item.index !== index) fail('Only supported buttons can be saved.');
    const label =
      item.name.replace(/[<>]/g, '').replace(/_/g, ' ').trim().slice(0, 32) ||
      'Button ' + (index + 1);
    return {
      id: 'ir-' + index,
      label,
      ...validatePocketConfig({
        slot: slot + 1,
        proto: item.proto,
        code: item.code,
        bits: item.bits,
      }),
    };
  });
  return validatePocketProfile({
    schema: 1,
    id,
    name,
    source: 'Imported Flipper IR v1; model compatibility and physical behavior unverified.',
    buttons,
  });
}
