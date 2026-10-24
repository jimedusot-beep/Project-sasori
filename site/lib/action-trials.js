import { recordId } from './records.js';
import { sanitizeText } from './diagnostics.js';
import { controlFamily } from './device-controls.js?v=recognition-20261024';
export const MAX_ACTION_TRIALS = 200;
export const MAX_TRIAL_BYTES = 400000;
const text = (s, max) => typeof s === 'string' && s.length <= max;
export function validateActionTrial(input) {
  if (
    !input ||
    input.format !== 'sasori.action-trial' ||
    input.schemaVersion !== 1 ||
    !/^trial-[\w-]{1,36}$/.test(input.id) ||
    !/^control-[\w-]{1,36}$/.test(input.targetId) ||
    !/^connection-[\w-]{1,36}$/.test(input.sessionId) ||
    !['live', 'synthetic', 'imported'].includes(input.source) ||
    !['connect', 'identify', 'status', 'alert', 'check'].includes(input.intent) ||
    !['effect-clear-queued', 'matched-reply', 'read-complete', 'failed', 'cancelled'].includes(
      input.outcome,
    ) ||
    !['idle', 'pending', 'cleared', 'disconnected', 'failed'].includes(input.cleanup) ||
    !['not-tested', 'yes', 'no'].includes(input.observed) ||
    !['not-tested', 'yes', 'no'].includes(input.recovered) ||
    !text(input.model, 160) ||
    !input.model.trim() ||
    !text(input.firmware, 160) ||
    !input.firmware.trim() ||
    !text(input.label, 80) ||
    !text(input.notes, 500) ||
    !text(input.error, 240) ||
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > 86400000 ||
    !Number.isFinite(Date.parse(input.startedAt)) ||
    !Number.isFinite(Date.parse(input.endedAt)) ||
    Date.parse(input.endedAt) < Date.parse(input.startedAt) ||
    !Array.isArray(input.stages) ||
    input.stages.length > 3 ||
    input.stages.some((s) => !text(s, 80))
  )
    throw new Error('Invalid action trial.');
  controlFamily(input.adapterId);
  return {
    format: 'sasori.action-trial',
    schemaVersion: 1,
    id: input.id,
    targetId: input.targetId,
    sessionId: input.sessionId,
    adapterId: input.adapterId,
    source: input.source,
    intent: input.intent,
    label: input.label,
    model: input.model,
    firmware: input.firmware,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    outcome: input.outcome,
    cleanup: input.cleanup,
    observed: input.observed,
    recovered: input.recovered,
    notes: input.notes,
    error: input.error,
    stages: [...input.stages],
    authenticationVerified: false,
    physicalEffectVerified: false,
  };
}
export function trialFromAction(action, target) {
  return validateActionTrial({
    ...action,
    format: 'sasori.action-trial',
    schemaVersion: 1,
    id: 'trial-' + recordId(),
    targetId: target.id,
    label: target.label,
    observed: 'not-tested',
    recovered: 'not-tested',
    notes: '',
    stages: action.stages || [],
  });
}
export function observeActionTrial(input, { observed, recovered, notes = '' }) {
  return validateActionTrial({ ...validateActionTrial(input), observed, recovered, notes });
}
export function validateTrials(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ACTION_TRIALS)
    throw new Error('Action trial limit is 200. Export and remove old trials first.');
  const clean = rows.map(validateActionTrial);
  if (
    new Set(clean.map((r) => r.id)).size !== clean.length ||
    new TextEncoder().encode(JSON.stringify(clean)).byteLength > MAX_TRIAL_BYTES
  )
    throw new Error('Duplicate or oversized action trials.');
  return clean;
}
export function trialSummary(rows, targetId) {
  const local = validateTrials(rows)
    .filter(
      (r) =>
        r.targetId === targetId && r.source === 'live' && ['check', 'connect'].includes(r.intent),
    )
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  let consecutive = 0,
    identity = '',
    failures = 0;
  const sessions = new Set();
  for (const row of local) {
    if (row.intent === 'connect' && !['failed', 'cancelled'].includes(row.outcome)) continue;
    const key = [row.adapterId, row.model, row.firmware].join('|');
    const qualifies =
      row.intent === 'check' &&
      row.outcome === 'effect-clear-queued' &&
      row.cleanup === 'cleared' &&
      row.observed === 'yes' &&
      row.recovered === 'yes' &&
      row.model.trim().toLowerCase() !== 'unknown' &&
      row.firmware.trim().toLowerCase() !== 'unknown';
    const fresh = !sessions.has(row.sessionId);
    sessions.add(row.sessionId);
    if (!qualifies) {
      consecutive = 0;
      identity = '';
      failures++;
      continue;
    }
    if (key !== identity) {
      consecutive = 0;
      identity = key;
    }
    if (fresh) consecutive++;
  }
  return {
    consecutive,
    failures,
    target: 10,
    readyForReview: consecutive >= 10,
    hardwareVerified: false,
    authenticationVerified: false,
    label:
      consecutive >= 10
        ? 'Ten fresh owner-observed checks recorded. Review the report; no independent verification is implied.'
        : `${consecutive} / 10 fresh owner-observed checks with known model/firmware. Failed, untested or changed-identity checks restart the count.`,
  };
}
export function portableTrials(rows) {
  return {
    format: 'sasori.action-trials',
    schemaVersion: 1,
    trials: validateTrials(rows).map((r) => ({
      ...r,
      label: sanitizeText(r.label).slice(0, 80),
      model: sanitizeText(r.model).slice(0, 160),
      firmware: sanitizeText(r.firmware).slice(0, 160),
      notes: sanitizeText(r.notes).slice(0, 500),
      error: sanitizeText(r.error).slice(0, 240),
    })),
  };
}
export function parseTrials(value) {
  if (new TextEncoder().encode(value).byteLength > MAX_TRIAL_BYTES)
    throw new Error('Trial import limit is 400 KB.');
  const data = JSON.parse(value);
  if (data?.format !== 'sasori.action-trials' || data.schemaVersion !== 1)
    throw new Error('Unsupported action-trial backup.');
  return validateTrials(data.trials).map((r) => ({
    ...r,
    id: 'trial-' + recordId(),
    source: 'imported',
  }));
}
