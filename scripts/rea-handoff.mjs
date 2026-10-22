// Project Sasori -> REA Recovery Kit: owner-run, local-only, no transport.
import { readFileSync, lstatSync, openSync, writeFileSync, closeSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIMIT = 2 * 1024 * 1024;
const REPO_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const VALID_HEX = /^(?:[0-9a-fA-F]{2}(?: |$))*$/;

function sessionsFrom(text) {
  if (Buffer.byteLength(text, 'utf8') > LIMIT) throw new Error('Input too large');
  const input = JSON.parse(text);
  const records = input?.format === 'sasori.backup' && input.schemaVersion === 2
    ? input.records : [input];
  if (!Array.isArray(records) || records.length < 1 || records.length > 50) {
    throw new Error('Unsupported backup envelope');
  }
  for (const r of records) {
    if (!r || r.format !== 'sasori.session' || r.schemaVersion !== 2 ||
        !['live', 'simulated', 'imported'].includes(r.source) ||
        typeof r.payloadsIncluded !== 'boolean' ||
        !Array.isArray(r.packets) || r.packets.length > 500 ||
        !r.stats || ['packets','bytes','malformed','truncated'].some(
          (key) => !Number.isSafeInteger(r.stats[key]) || r.stats[key] < 0)) {
      throw new Error('Unsupported session envelope');
    }
    for (const packet of r.packets) {
      if (!packet || !Number.isSafeInteger(packet.length) || packet.length < 0 ||
          packet.length > 4096 || typeof packet.kind !== 'string' ||
          typeof packet.timestamp !== 'string' || !Number.isFinite(Date.parse(packet.timestamp)) ||
          (packet.truncated !== undefined && typeof packet.truncated !== 'boolean') ||
          (packet.malformed !== undefined && typeof packet.malformed !== 'boolean') ||
          (packet.hex !== undefined &&
            (typeof packet.hex !== 'string' || packet.hex.length > 3072 || !VALID_HEX.test(packet.hex)))) {
        throw new Error('Invalid packet envelope');
      }
    }
  }
  return records;
}

/** Count-only summary: no byte contents, UUIDs, free text, IDs, or URLs. */
export function reviewForRea(text) {
  return {
    format: 'rea.sasori-handoff-review', schemaVersion: 1, offlineOnly: true,
    independentlyVerified: false,
    sessions: sessionsFrom(text).map((r) => {
      const complete = r.packets.filter((p) =>
        r.payloadsIncluded && !p.truncated && !p.malformed &&
        typeof p.hex === 'string' &&
        p.hex.replaceAll(' ', '').length === p.length * 2);
      return {
        sourceClaim: r.source, previouslyImported: r.importedAt != null,
        packetRecords: r.packets.length, completeRawPackets: complete.length,
        missingOrIncomplete: r.packets.length - complete.length,
        statsConsistent: r.stats.packets === r.packets.length,
        eligibleForExplicitPrivateTrace: r.source === 'live' && r.importedAt == null &&
          r.payloadsIncluded && r.packets.length > 0 && complete.length === r.packets.length &&
          r.stats.packets === r.packets.length &&
          r.stats.bytes === r.packets.reduce((total, p) => total + p.length, 0) &&
          r.stats.malformed === r.packets.filter((p) => p.malformed).length &&
          r.stats.truncated === r.packets.filter((p) => p.truncated).length,
      };
    }),
    note: 'Provenance is a user-file claim; this tool cannot confirm a real hardware inspection.',
  };
}

/** Raw trace is only for a separate, deliberate, private analysis; never sent to hardware. */
export function privateTraceForRea(text) {
  const records = sessionsFrom(text);
  const review = reviewForRea(text);
  if (review.sessions.some((s) => !s.eligibleForExplicitPrivateTrace)) {
    throw new Error('A complete non-imported live session with explicit raw payloads is required');
  }
  return records.flatMap((r) => r.packets.map((p) =>
    JSON.stringify({ transport: 'ble', direction: 'rx', hex: p.hex.replaceAll(' ', '').toLowerCase() })
  )).join('\n') + '\n';
}

function main(args) {
  if (args.length !== 1 && args.length !== 4) throw new Error('Invalid usage');
  const source = resolve(args[0]);
  const st = lstatSync(source);
  if (!st.isFile() || st.isSymbolicLink() || st.size > LIMIT) throw new Error('Unsupported input');
  const text = readFileSync(source, 'utf8');
  if (args.length === 1) {
    process.stdout.write(JSON.stringify(reviewForRea(text), null, 2) + '\n');
    return;
  }
  if (args[1] !== '--trace' || args[3] !== '--acknowledge-sensitive') {
    throw new Error('Explicit raw-export consent required');
  }
  const output = resolve(args[2]);
  const parent = realpathSync(dirname(output));
  const relativeToRepo = relative(REPO_ROOT, resolve(parent, output.split(/[\\/]/).at(-1)));
  if (relativeToRepo === '' || (!relativeToRepo.startsWith('..') && !isAbsolute(relativeToRepo))) {
    throw new Error('Private trace must be outside repository');
  }
  const trace = privateTraceForRea(text); // validate before opening output
  const handle = openSync(output, 'wx', 0o600);
  try { writeFileSync(handle, trace, 'utf8'); }
  finally { closeSync(handle); }
  process.stdout.write('Private trace written outside repository. Treat it as sensitive; do not commit or share.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch {
    console.error('Handoff failed: check local session, flags, export completeness, and private output path.');
    process.exitCode = 1;
  }
}
