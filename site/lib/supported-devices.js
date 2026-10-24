import { ELMO_SERVICE, ELMO_NOTIFY } from './profiles.js';
import { MIP_SERVICES, MIP_RX, MIP_TX } from './mip-controls.js';
import { FURBY_SERVICE, FURBY_RX, FURBY_TX } from './furby-codec.js';
import {
  STANDARD_SERVICES,
  BATTERY_SERVICE,
  BATTERY_LEVEL,
  ALERT_SERVICE,
  ALERT_LEVEL,
} from './standard-controls.js';
import { DEVICE_INFORMATION_SERVICE, DEVICE_INFORMATION_FIELDS } from './device-information.js';

export const SUPPORTED_BLE_SERVICES = Object.freeze([
  ELMO_SERVICE,
  FURBY_SERVICE,
  ...MIP_SERVICES,
  ...STANDARD_SERVICES,
]);
// Names and imported claims cannot choose a protocol. Only exact service/channel facts match.
// Even an exact match is a candidate, not an authenticated device identity.
export function matchSupportedDevices(services) {
  if (!Array.isArray(services) || services.length > 16) return [];
  const has = (service, characteristic, properties) =>
    services.some(
      (s) =>
        typeof s?.uuid === 'string' &&
        s.uuid.toLowerCase() === service &&
        Array.isArray(s.characteristics) &&
        s.characteristics.length <= 128 &&
        s.characteristics.some(
          (c) =>
            typeof c?.uuid === 'string' &&
            c.uuid.toLowerCase() === characteristic &&
            Array.isArray(c.properties) &&
            properties.some((p) => c.properties.includes(p)),
        ),
    );
  const matches = [];
  const add = (familyId, detail) => matches.push({ familyId, detail, hardwareVerified: false });
  if (
    has(ELMO_SERVICE, ELMO_NOTIFY, ['notify']) &&
    has(ELMO_SERVICE, 'dab91383-b5a1-e29c-b041-bcd562613bdf', ['writeWithoutResponse'])
  )
    add(
      'elmo-l2l/v1',
      'Elmo data notification and write channels match. The existing password is still required.',
    );
  if (
    has(FURBY_SERVICE, FURBY_RX, ['notify']) &&
    has(FURBY_SERVICE, FURBY_TX, ['write', 'writeWithoutResponse'])
  )
    add('furby-connect/v1', 'Furby Connect GeneralPlus notification and write channels match.');
  if (
    has(MIP_SERVICES[0], MIP_RX, ['notify']) &&
    has(MIP_SERVICES[1], MIP_TX, ['writeWithoutResponse'])
  )
    add(
      'wowwee-mip/v1',
      'Original MiP notification and write channels match; other devices can share these UUIDs.',
    );
  if (
    DEVICE_INFORMATION_FIELDS.some((f) => has(DEVICE_INFORMATION_SERVICE, f.uuid, ['read'])) ||
    has(BATTERY_SERVICE, BATTERY_LEVEL, ['read']) ||
    has(ALERT_SERVICE, ALERT_LEVEL, ['writeWithoutResponse'])
  )
    add(
      'ble-standard/v1',
      'At least one standard identity, battery or mild-alert channel is exposed.',
    );
  return matches;
}
