/** @type {ReadonlyArray<import('./types.js').Capability>} */
export const CAPABILITIES = Object.freeze([
  { id: 'authentication', label: 'Authentication', verified: false, evidence: null },
  { id: 'voice', label: 'Voice playback', verified: false, evidence: null },
  { id: 'sound', label: 'Sound effects', verified: false, evidence: null },
  { id: 'motion', label: 'Head & body motion', verified: false, evidence: null },
  { id: 'actuator', label: 'Motor / actuator', verified: false, evidence: null },
  { id: 'sequence', label: 'Coordinated sequences', verified: false, evidence: null },
  { id: 'sensor', label: 'Sensor protocol', verified: false, evidence: null },
]);
/** No hardware sender exists in v0.2. This guard deliberately fails closed.
 * @param {string} capability
 * @param {{simulation?: boolean, consent?: boolean}} [options]
 */
export function validateCommand(capability, { simulation = false, consent = false } = {}) {
  if (!CAPABILITIES.some((c) => c.id === capability)) throw new Error('Unknown capability.');
  if (!consent) throw new Error('An explicit user action is required.');
  if (!simulation)
    throw new Error(
      'Live transmission is unavailable: protocol and safety limits are not verified.',
    );
  return { mode: 'simulated', capability, hardwareTraffic: false };
}
/** @param {number} value */
export function virtualPosition(value) {
  if (!Number.isFinite(value) || value < -1 || value > 1)
    throw new Error('Virtual position must be between -1 and 1.');
  return value;
}
