import { compareCaptures, validateDiscovery } from './discovery.js';

// An offline, read-only view over existing Sasori Discovery data.
// No radio interface or sender belongs in this module.
export const MAX_ATLAS_RECORDS = 50;
export const MAX_ATLAS_COLUMNS = 64;

export function atlasKey(record) {
  const row = validateDiscovery(record);
  return [row.deviceModel.trim().toLocaleLowerCase().replace(/\s+/g, ' '), row.method, row.kind].join('\u241f');
}

export function buildSignalAtlas(input, { toleranceUs = 100 } = {}) {
  if (!Array.isArray(input) || input.length > MAX_ATLAS_RECORDS)
    throw new Error('Signal Atlas accepts at most 50 Discovery captures.');
  if (!Number.isSafeInteger(toleranceUs) || toleranceUs < 0 || toleranceUs > 1000000)
    throw new Error('Pulse tolerance must be an integer from 0 to 1,000,000 microseconds.');
  const groups = new Map();
  for (const item of input) {
    const record = validateDiscovery(item);
    const key = atlasKey(record);
    if (!groups.has(key))
      groups.set(key, {
        key,
        deviceModel: record.deviceModel,
        method: record.method,
        kind: record.kind,
        captures: [],
      });
    groups.get(key).captures.push(record);
  }
  return [...groups.values()]
    .map((group) => {
      const captured = group.captures;
      const retained = captured.filter((r) => Array.isArray(r.values));
      const counts = {
        total: captured.length,
        retained: retained.length,
        metadataOnly: captured.length - retained.length,
        imported: captured.filter((r) => r.importedAt !== null).length,
        synthetic: captured.filter((r) => r.evidence === 'synthetic').length,
        ownerLabeled: captured.filter(
          (r) => r.evidence === 'owner-observed' && r.importedAt === null,
        ).length,
        community: captured.filter((r) => r.evidence === 'community-reported').length,
      };
      // The cross-capture consensus is a comparison, never a protocol decoder.
      // A missing position is not stable. Unknown and mixed evidence stay explicit.
      const positions = [];
      if (retained.length >= 2 && group.kind !== 'audio') {
        const max = Math.min(
          MAX_ATLAS_COLUMNS,
          Math.max(...retained.map((r) => r.values.length)),
        );
        for (let offset = 0; offset < max; offset++) {
          const samples = retained
            .map((r) => r.values[offset])
            .filter((value) => value !== undefined);
          const coverage = samples.length;
          const minimum = Math.min(...samples);
          const maximum = Math.max(...samples);
          const range = maximum - minimum;
          positions.push({
            offset,
            coverage,
            minimum,
            maximum,
            range,
            status:
              coverage !== retained.length
                ? 'partial'
                : range <= (group.kind === 'pulses' ? toleranceUs : 0)
                  ? 'stable'
                  : 'variable',
          });
        }
      }
      return {
        ...group,
        counts,
        positions,
        comparable: retained.length >= 2 && group.kind !== 'audio',
        truncated: positions.length === MAX_ATLAS_COLUMNS &&
          retained.some((r) => r.values.length > MAX_ATLAS_COLUMNS),
        // Never imply observed semantics or that imported/synthetic files validate hardware.
        evidenceLabel:
          counts.imported || counts.synthetic || counts.community
            ? 'Mixed or non-live claims; not hardware verification'
            : 'Owner-labeled captures; physical effects unverified',
      };
    })
    .sort((a, b) => a.deviceModel.localeCompare(b.deviceModel) ||
      a.method.localeCompare(b.method) || a.kind.localeCompare(b.kind));
}

export function compareAtlasPair(first, second, toleranceUs = 100) {
  if (atlasKey(first) !== atlasKey(second))
    throw new Error('Choose two captures for the same model, method and representation.');
  const report = compareCaptures(first, second, toleranceUs);
  return {
    ...report,
    // The original comparison preserves raw values for private inspection;
    // the Atlas report intentionally exports positions/status only.
    differences: report.differences.map(({ offset, status }) => ({ offset, status })),
    caveat: 'Aligned index differences only. Correlation is not device command identification.',
  };
}

export function atlasMetadataExport(groups) {
  if (!Array.isArray(groups) || groups.length > MAX_ATLAS_RECORDS)
    throw new Error('Invalid Atlas export.');
  // Untrusted labels, source notes, exact model IDs, endpoint IDs, and bytes are omitted.
  // A recipient cannot reconstruct the recordings from this aggregate.
  return {
    format: 'sasori.signal-atlas-summary',
    schemaVersion: 1,
    payloadPolicy: 'aggregate-only-no-identity-or-raw',
    groups: groups.map((group, index) => ({
      group: index + 1,
      kind: group.kind,
      method: group.method,
      counts: { ...group.counts },
      comparable: group.comparable,
      stablePositions: group.positions.filter((p) => p.status === 'stable').length,
      variablePositions: group.positions.filter((p) => p.status === 'variable').length,
      partialPositions: group.positions.filter((p) => p.status === 'partial').length,
      columnsReviewed: group.positions.length,
      truncated: group.truncated,
      interpretation: 'Index alignment only; no protocol or hardware validation',
    })),
  };
}
