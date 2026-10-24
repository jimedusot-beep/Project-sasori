// Protocol facts from Bluefluff, pinned and attributed in docs/furby-connect.md.
// This adapter targets Furby Connect (2016), not the acoustic 2012 Furby.
export const FURBY_SERVICE = 'dab91435-b5a1-e29c-b041-bcd562613bde';
export const FURBY_RX = 'dab91382-b5a1-e29c-b041-bcd562613bde';
export const FURBY_TX = 'dab91383-b5a1-e29c-b041-bcd562613bde';
const root = 'https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/';
export const FURBY_ADAPTER = Object.freeze({
  id: 'furby-connect/v1',
  name: 'Furby Connect · 2016 BLE protocol',
  models: Object.freeze(['Furby Connect (2016)']),
  intents: Object.freeze(['identify', 'status', 'alert', 'stop']),
  services: Object.freeze([FURBY_SERVICE]),
  sources: Object.freeze([root + 'doc/bluetooth.md', root + 'doc/generalplus.md']),
  nativeSupported: false,
  hardwareVerified: false,
});
const commands = Object.freeze({
  identify: Object.freeze([0xfe]),
  status: Object.freeze([0x20, 0x06]),
  alert: Object.freeze([0x14, 0, 0, 32]),
  clear: Object.freeze([0x14, 0, 0, 0]),
});
export function furbyCommand(intent) {
  if (!Object.hasOwn(commands, intent)) throw new Error('Unsupported Furby Connect action.');
  return Uint8Array.from(commands[intent]);
}
export function decodeFurbyReply(value) {
  if (!(value instanceof DataView)) return null;
  if (value.byteLength === 2 && value.getUint8(0) === 0xfe)
    return {
      opcode: 0xfe,
      information: {
        model: FURBY_ADAPTER.models[0],
        firmware: 'GeneralPlus version byte 0x' + value.getUint8(1).toString(16).padStart(2, '0'),
      },
    };
  if (value.byteLength === 19 && value.getUint8(0) === 0x22)
    return {
      opcode: 0x22,
      statusText: 'Furby presence reply received · 18 data bytes; fields remain undecoded.',
    };
  return null;
}
