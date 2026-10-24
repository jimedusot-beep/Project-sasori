import { ELMO_INPUTS, ELMO_SOUNDS } from './elmo-codec.js';

export const HUB_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'elmo-l2l/v1',
    name: 'Love2Learn Elmo',
    kind: 'bluetooth',
    hint: 'B6572 family · sounds, volume and touch inputs',
  }),
  Object.freeze({
    id: 'ble-standard/v1',
    name: 'Bluetooth gadget',
    kind: 'bluetooth',
    hint: 'Available standard identity, battery and mild-alert services',
  }),
  Object.freeze({
    id: 'wowwee-mip/v1',
    name: 'Original WowWee MiP',
    kind: 'bluetooth',
    hint: '2014 protocol · version, status and blue chest light',
  }),
  Object.freeze({
    id: 'furby-connect/v1',
    name: 'Furby Connect',
    kind: 'bluetooth',
    hint: '2016 BLE model · firmware, presence reply and blue antenna light',
  }),
  Object.freeze({
    id: 'tv-local/v1',
    name: 'TV & universal remote',
    kind: 'local-helper',
    hint: 'Local companion · Roku or configured Home Assistant / IR hub',
  }),
]);
export const TV_KEYS = Object.freeze({
  home: 'Home',
  back: 'Back',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  select: 'OK',
  'volume-up': 'Volume up',
  'volume-down': 'Volume down',
  mute: 'Mute',
  play: 'Play / pause',
  previous: 'Previous / rewind',
  next: 'Next / forward',
  'power-on': 'Power on',
  'power-off': 'Power off',
});
export function hubFamily(id) {
  const family = HUB_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error('Choose a supported device family.');
  return family;
}
export function hubAction(familyId, intent, args = {}) {
  hubFamily(familyId);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Invalid action settings.');
  if (familyId === 'elmo-l2l/v1') {
    if (intent === 'status') return { intent, args: {} };
    if (
      intent === 'sound' &&
      Number.isSafeInteger(args.id) &&
      ELMO_SOUNDS.some((s) => s.id === args.id)
    )
      return { intent, args: { id: args.id } };
    if (
      intent === 'volume' &&
      Number.isSafeInteger(args.level) &&
      args.level >= 1 &&
      args.level <= 15
    )
      return { intent, args: { level: args.level } };
  } else if (familyId === 'tv-local/v1') {
    if (intent === 'status') return { intent, args: {} };
    if (intent === 'key' && Object.hasOwn(TV_KEYS, args.key))
      return { intent, args: { key: args.key } };
  } else if (['identify', 'status', 'alert'].includes(intent)) return { intent, args: {} };
  throw new Error('This action is not supported by the selected device family.');
}
export function actionLabel(familyId, intent, args = {}) {
  const clean = hubAction(familyId, intent, args);
  if (intent === 'sound')
    return 'Play ' + ELMO_SOUNDS.find((s) => s.id === clean.args.id).label.toLowerCase();
  if (intent === 'volume') return 'Request volume ' + clean.args.level + ' / 15';
  if (intent === 'key') return TV_KEYS[clean.args.key];
  if (intent === 'alert')
    return familyId === 'furby-connect/v1'
      ? 'Blue antenna light'
      : familyId === 'wowwee-mip/v1'
        ? 'Blue chest light'
        : 'Mild alert';
  return intent === 'identify' ? 'Read device information' : 'Read status';
}
export { ELMO_INPUTS, ELMO_SOUNDS };
