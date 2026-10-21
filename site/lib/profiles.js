// UUID facts transcribed from the cited researcher's GATT table. These are NOT recovered V4 source.
export const ELMO_SOURCE = 'https://github.com/NonaSuomy/Love2LearnElmo';
export const ELMO_SERVICE = 'dab91435-b5a1-e29c-b041-bcd562613bdf';
export const ELMO_NOTIFY = 'dab91382-b5a1-e29c-b041-bcd562613bdf';
/** @type {ReadonlyArray<import('./types.js').DeviceProfile>} */
export const PROFILES = Object.freeze([
  {
    id: '001',
    label: 'Love2Learn Elmo · B6572',
    deviceName: 'Elmo L2L',
    status: 'Inspection / hardware validation pending',
    service: ELMO_SERVICE,
    notify: ELMO_NOTIFY,
    source: ELMO_SOURCE,
  },
  {
    id: '002',
    label: 'Future animatronic toy',
    deviceName: null,
    status: 'Research scaffold',
    service: null,
    notify: null,
    source: null,
  },
  {
    id: '003',
    label: 'Salvaged actuator assembly',
    deviceName: null,
    status: 'Simulation only',
    service: null,
    notify: null,
    source: null,
  },
  {
    id: '004',
    label: 'Custom robotic puppet',
    deviceName: null,
    status: 'Simulation only',
    service: null,
    notify: null,
    source: null,
  },
  {
    id: '005',
    label: 'H.E.R.B.I.E. interoperability',
    deviceName: null,
    status: 'Interface specification',
    service: null,
    notify: null,
    source: null,
  },
]);
export const GATT_REGISTRY = Object.freeze([
  {
    uuid: ELMO_SERVICE,
    label: 'Elmo custom service',
    properties: 'Service',
    evidence: 'community-reported',
  },
  {
    uuid: ELMO_NOTIFY,
    label: 'Data notifications',
    properties: 'Read, Notify',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab91383-b5a1-e29c-b041-bcd562613bdf',
    label: 'Data write (blocked)',
    properties: 'Read, Write without response',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab90756-b5a1-e29c-b041-bcd562613bdf',
    label: 'Control notifications',
    properties: 'Read, Notify',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab90757-b5a1-e29c-b041-bcd562613bdf',
    label: 'Control write (blocked)',
    properties: 'Read, Write without response',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab91440-b5a1-e29c-b041-bcd562613bdf',
    label: 'P2P notifications',
    properties: 'Read, Notify',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab91441-b5a1-e29c-b041-bcd562613bdf',
    label: 'P2P write (blocked)',
    properties: 'Read, Write without response',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab90755-b5a1-e29c-b041-bcd562613bdf',
    label: 'RSSI notifications',
    properties: 'Read, Notify',
    evidence: 'community-reported',
  },
  {
    uuid: 'dab90758-b5a1-e29c-b041-bcd562613bdf',
    label: 'Unknown write (blocked)',
    properties: 'Read, Write without response',
    evidence: 'community-reported',
  },
]);
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** @param {string} value */
export function normalizeUUID(value) {
  const uuid = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(uuid))
    throw new Error('Use a full 128-bit UUID from an identified source.');
  if (uuid.includes('-1212-efde-1523-785feabcd123'))
    throw new Error('Firmware update services are excluded from this laboratory.');
  return uuid;
}
