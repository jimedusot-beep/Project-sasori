// Only allow controls that the chosen host transport explicitly implements.
// No generic/native Elmo or Furby write path is available.
export const NATIVE_CONTROL_FAMILIES = Object.freeze(['ble-standard/v1', 'wowwee-mip/v1']);

export function hostSupport(
  familyId,
  { native = false, webBluetooth = false, companion = false } = {},
) {
  if (familyId === 'tv-local/v1')
    return companion
      ? { live: true, explanation: 'Local computer TV companion ready.' }
      : { live: false, explanation: 'TV control needs the local computer companion. Try Demo.' };
  if (native)
    return NATIVE_CONTROL_FAMILIES.includes(familyId)
      ? {
          live: true,
          explanation:
            'Native iPhone: fixed identity, status and bounded light/alert commands. Physical response remains unverified.',
        }
      : {
          live: false,
          explanation:
            familyId === 'elmo-l2l/v1'
              ? 'Native Elmo sound/password commands are unavailable. Try Demo, or use the hosted Elmo Remote in Bluefy for a real owner-authorized trial.'
              : 'Native commands for this device are unavailable. Try Demo or a compatible Web Bluetooth browser.',
        };
  return webBluetooth
    ? {
        live: true,
        explanation:
          'Compatible Bluetooth browser found. Real device support still requires a physical test.',
      }
    : {
        live: false,
        explanation:
          'Bluetooth unavailable in this browser. On iPhone use Bluefy for compatible live devices, or try Demo.',
      };
}

export function hostCanRecognize({ native = false, webBluetooth = false } = {}) {
  // Native Bluetooth is allowlisted per adapter, not a multi-service discovery probe.
  return !native && webBluetooth;
}
