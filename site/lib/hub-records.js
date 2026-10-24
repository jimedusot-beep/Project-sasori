import { recordId } from './records.js';
import { sanitizeText } from './diagnostics.js';
import { hubFamily } from './hub-catalog.js';
import { validateRoutine } from './routines.js';
import { validateReactions } from './reactions.js';

export const HUB_LIMIT = 20;
export const HUB_BYTES = 64000;
export const HUB_FAILURES = Object.freeze({
  'connection-failed': [
    'Connection failed',
    'Check the selected device family, power, range and competing apps, then try again.',
  ],
  'browser-unavailable': [
    'Bluetooth unavailable here',
    'For Bluetooth use Bluefy on iPhone/iPad or compatible Chrome. The demo works without Bluetooth.',
  ],
  'permission-denied': [
    'Bluetooth permission needed',
    'Allow this browser to use Bluetooth in phone settings, then reconnect.',
  ],
  'password-required': [
    'Enter an Elmo password',
    'Enter the existing password, or choose a new one and enable setup for an unset toy.',
  ],
  'password-rejected': [
    'Elmo rejected the password',
    'Check the existing password or open the password recovery guide. Setup cannot overwrite a set password.',
  ],
  'password-not-set': [
    'Elmo has no password set',
    'Enter a new password, enable password setup and reconnect. Keep a private copy.',
  ],
  'password-setup-not-confirmed': [
    'Password setup not confirmed',
    'Save the result. The new password may be stored; first try it again with setup unchecked.',
  ],
  'unsupported-device': [
    'Expected channels were not found',
    'Check the exact model. Use the laboratory to inspect connection details.',
  ],
  'selection-cancelled': [
    'No device selected',
    'Choose Connect when ready. Enable Show all devices if your toy is missing.',
  ],
  'bluetooth-error': [
    'Bluetooth connection failed',
    'Check permission, toy power, range and competing apps.',
  ],
  'operation-timeout': [
    'The device took too long',
    'Check power and range, then make a fresh connection.',
  ],
  'authentication-timeout': [
    'No accepted password reply',
    'Close competing Elmo apps and check the password, then reconnect.',
  ],
  'session-timeout': [
    'Connection time limit reached',
    'Save your result, then reconnect manually for another session.',
  ],
  'connection-lost': [
    'Connection lost',
    'Your setup is kept. Check power and range before reconnecting.',
  ],
  'page-hidden': [
    'Stopped while the page was hidden',
    'Keep this page visible and the phone unlocked while using live controls.',
  ],
  'user-stop': [
    'Stopped and disconnected',
    'Your setup is kept. Already-sent sounds or TV commands may continue.',
  ],
  'sound-limit': [
    'Session sound limit reached',
    'Reconnect using Control session for repeatable sound requests. A queued request does not prove playback.',
  ],
  'sound-cooldown': [
    'Sound controls are pacing requests',
    'Wait for the short request gap. The toy does not supply a verified playback-complete acknowledgment.',
  ],
  'volume-limit': ['Volume adjustment limit reached', 'Reconnect for another bounded session.'],
  'invalid-volume': ['Choose volume 1–15', 'Enter a whole number in the supported range.'],
  'unsupported-sound': [
    'Choose a catalog sound',
    'Only the reviewed built-in sound IDs are available.',
  ],
  'not-ready': ['Device is not ready', 'Connect and wait for setup and state reads to finish.'],
  'helper-required': [
    'Open the local TV companion',
    'TV commands run through the local companion on your network. Open its address below.',
  ],
  'pairing-required': [
    'Pair this browser with the companion',
    'Enter the pairing code displayed by the companion on your computer.',
  ],
  'pairing-rejected': [
    'Pairing code was not accepted',
    'Check the current code shown by the companion. Wait before retrying if attempts were limited.',
  ],
  'tv-unreachable': [
    'TV could not be reached',
    'Check that the companion and TV share a network and the selected address is correct.',
  ],
  'tv-control-disabled': [
    'TV rejected remote control',
    'Check the TV’s own remote-control permission settings. Sasori does not change them.',
  ],
  'tv-unsupported': [
    'TV controls unavailable',
    'Use a matching Roku device, configured Home Assistant media player, or learned IR remote.',
  ],
  'ha-unavailable': [
    'Home Assistant is unavailable',
    'Check its address, certificate and connection from the companion computer.',
  ],
  'ha-unauthorized': [
    'Home Assistant authorization failed',
    'Update the companion’s private Home Assistant token. Do not enter it in this page.',
  ],
  'action-unavailable': [
    'This action is unavailable',
    'Reconnect and check the device’s reported capabilities.',
  ],
  'local-network-required': [
    'Use a local device address',
    'Enter the companion’s local address; public hosts and embedded credentials are not accepted.',
  ],
  'network-error': [
    'Local companion request failed',
    'Open the companion address directly on the same network and pair again if necessary.',
  ],
  busy: ['An operation is still running', 'Wait for it to finish or choose Stop.'],
});
export function hubFailure(error) {
  const code = Object.hasOwn(HUB_FAILURES, error?.code)
    ? error.code
    : error?.name === 'NotFoundError'
      ? 'selection-cancelled'
      : error?.name === 'SecurityError' || error?.name === 'NotAllowedError'
        ? 'permission-denied'
        : error?.name === 'AbortError'
          ? 'user-stop'
          : 'connection-failed';
  return { code, title: HUB_FAILURES[code][0], hint: HUB_FAILURES[code][1] };
}
export function localCompanionURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter the companion’s full local address.');
  }
  const host = url.hostname.toLowerCase();
  const parts = host.split('.').map(Number);
  const ipv4 = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    (ipv4 &&
      (parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168)));
  if (
    !local ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use a local companion address without a password, query or fragment.');
  url.pathname = '/hub.html';
  return url.href;
}
const text = (value, max) =>
  typeof value === 'string' &&
  value.length <= max &&
  [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
export function validateHubData(input) {
  if (
    !input ||
    input.format !== 'sasori.hub' ||
    input.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.revision ?? 0) ||
    input.revision < 0 ||
    input.revision > 1000000000 ||
    !Array.isArray(input.setups) ||
    input.setups.length > HUB_LIMIT ||
    !Array.isArray(input.routines) ||
    input.routines.length > HUB_LIMIT
  )
    throw new Error('Choose a Sasori hub backup with up to 20 devices and 20 routines.');
  const ids = new Set();
  const setups = input.setups.map((s) => {
    if (
      !s ||
      !text(s.id, 48) ||
      !/^setup-[a-zA-Z0-9_-]{1,40}$/.test(s.id) ||
      ids.has(s.id) ||
      !text(s.label, 80) ||
      !s.label.trim() ||
      !text(s.namePrefix ?? '', 60) ||
      (s.deviceId !== undefined && (!text(s.deviceId, 256) || !s.deviceId))
    )
      throw new Error('Invalid saved device setup.');
    ids.add(s.id);
    hubFamily(s.familyId);
    const out = {
      id: s.id,
      label: s.label.trim(),
      familyId: s.familyId,
      namePrefix: s.namePrefix || '',
    };
    if (s.deviceId) out.deviceId = s.deviceId;
    if (s.elmoMode !== undefined) {
      if (s.familyId !== 'elmo-l2l/v1' || !['check', 'control'].includes(s.elmoMode))
        throw new Error('Invalid Elmo mode.');
      out.elmoMode = s.elmoMode;
    }
    if (s.reactions !== undefined) {
      if (s.familyId !== 'elmo-l2l/v1') throw new Error('Touch mappings require Elmo.');
      out.reactions = validateReactions(s.reactions);
    }
    if (s.companionURL) out.companionURL = localCompanionURL(s.companionURL);
    if (s.tv) {
      if (s.familyId !== 'tv-local/v1' || !['roku', 'ha-media', 'ha-remote'].includes(s.tv.driver))
        throw new Error('Invalid TV setup.');
      const target = s.tv.target;
      if (
        !text(target, 160) ||
        !target ||
        (s.tv.driver !== 'roku' && !/^(media_player|remote)\.[a-z0-9_]+$/.test(target))
      )
        throw new Error('Invalid TV target.');
      if (s.tv.driver === 'ha-media' && !target.startsWith('media_player.'))
        throw new Error('Choose a media player.');
      if (s.tv.driver === 'ha-remote' && !target.startsWith('remote.'))
        throw new Error('Choose an IR remote entity.');
      if (s.tv.driver === 'roku' && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target))
        throw new Error('Enter the Roku’s local IPv4 address.');
      if (
        !text(s.tv.device ?? 'sasori-tv', 60) ||
        !/^[a-zA-Z0-9_-]{1,60}$/.test(s.tv.device ?? 'sasori-tv')
      )
        throw new Error('Use a simple IR device label.');
      out.tv = { driver: s.tv.driver, target, device: s.tv.device || 'sasori-tv' };
    }
    if (s.lastResult) {
      const r = s.lastResult;
      if (
        !['connected', 'failed', 'cancelled'].includes(r.outcome) ||
        typeof r.at !== 'string' ||
        !Number.isFinite(Date.parse(r.at)) ||
        (r.code && !Object.hasOwn(HUB_FAILURES, r.code))
      )
        throw new Error('Invalid connection result.');
      out.lastResult = { at: new Date(r.at).toISOString(), outcome: r.outcome, code: r.code || '' };
    }
    return out;
  });
  const routineIds = new Set();
  const routines = input.routines.map((r) => {
    const clean = validateRoutine(r);
    if (routineIds.has(clean.id)) throw new Error('Duplicate routine.');
    routineIds.add(clean.id);
    return clean;
  });
  const out = {
    format: 'sasori.hub',
    schemaVersion: 1,
    revision: input.revision ?? 0,
    legacyImported: input.legacyImported === true,
    selectedId: ids.has(input.selectedId) ? input.selectedId : setups[0]?.id || '',
    setups,
    routines,
  };
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > HUB_BYTES)
    throw new Error('Hub backup exceeds 64 KB.');
  return out;
}
export function emptyHubData() {
  return validateHubData({
    format: 'sasori.hub',
    schemaVersion: 1,
    revision: 0,
    setups: [],
    routines: [],
  });
}
export function portableHubData(input) {
  const data = validateHubData(input);
  return validateHubData({
    ...data,
    revision: 0,
    legacyImported: true,
    setups: data.setups.map(({ id, label, familyId, namePrefix, elmoMode, reactions }) => ({
      id,
      label: sanitizeText(label).slice(0, 80),
      familyId,
      namePrefix: sanitizeText(namePrefix).slice(0, 60),
      ...(elmoMode ? { elmoMode } : {}),
      ...(reactions ? { reactions } : {}),
    })),
    routines: data.routines.map((r) => ({ ...r, name: sanitizeText(r.name).slice(0, 80) })),
  });
}
export function parseHubBackup(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > HUB_BYTES)
    throw new Error('Hub import limit is 64 KB.');
  const data = portableHubData(JSON.parse(value));
  return validateHubData({
    ...data,
    selectedId: '',
    setups: data.setups.map((s) => ({ ...s, id: 'setup-' + recordId() })),
    routines: data.routines.map((r) => ({ ...r, id: 'routine-' + recordId() })),
  });
}
