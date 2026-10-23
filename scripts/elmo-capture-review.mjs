// Local export review only. No transport, credential handling, or application-message construction.
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseImport, MAX_FILE_BYTES } from '../site/lib/records.js';
import { decodePacket } from '../site/lib/protocol.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';

const corpus = JSON.parse(
  readFileSync(new URL('../experiments/001-elmo-l2l/fixtures/historical-v4.json', import.meta.url)),
);
const hexSamples = new Map(corpus.samples.map((sample) => [sample.hex, sample.id]));

/** Review the established Sasori JSON envelope, not the unknown Elmo application protocol.
 * Output contains fixed labels and counts only; input claims never become hardware verification.
 * @param {string} text
 */
export function reviewElmoCapture(text) {
  const records = parseImport(text, 'capture.json').map((record) => {
    const exactHistoricalMatches = Object.fromEntries(corpus.samples.map(({ id }) => [id, 0]));
    const patterns = { mode: 0, sleep: 0, unknown: 0 };
    let completeRawPackets = 0;
    let incompletePackets = 0;
    let omittedPackets = 0;
    for (const packet of record.packets) {
      if (!record.payloadsIncluded || !packet.hex) {
        ++omittedPackets;
        continue;
      }
      // validateRecord already checked the hex syntax and retained-size limit.
      const hex = packet.hex.replaceAll(' ', '').toLowerCase();
      if (packet.truncated || hex.length / 2 !== packet.length) {
        ++incompletePackets;
        continue;
      }
      ++completeRawPackets;
      const sampleId = hexSamples.get(hex);
      if (sampleId) ++exactHistoricalMatches[sampleId];
      // Recompute from complete bytes; never trust imported kind/text/outcome strings.
      const decoded = decodePacket(Buffer.from(hex, 'hex'));
      if (decoded.kind === 'mode-observation') ++patterns.mode;
      else if (decoded.kind === 'sleep-observation') ++patterns.sleep;
      else ++patterns.unknown;
    }
    const candidateServices = record.services.filter(
      (service) => service.uuid.toLowerCase() === ELMO_SERVICE,
    );
    const properties = new Set(
      candidateServices.flatMap((service) =>
        service.characteristics
          .filter((characteristic) => characteristic.uuid.toLowerCase() === ELMO_NOTIFY)
          .flatMap((characteristic) => characteristic.properties),
      ),
    );
    const totals = {
      packets: record.packets.length,
      bytes: record.packets.reduce((sum, packet) => sum + packet.length, 0),
      malformed: record.packets.filter((packet) => packet.malformed).length,
      truncated: record.packets.filter((packet) => packet.truncated).length,
    };
    return {
      sourceClaim: record.source,
      previouslyImported: !!record.importedAt,
      independentlyVerified: false,
      packetRecords: record.packets.length,
      statsConsistent: Object.keys(totals).every((key) => totals[key] === record.stats[key]),
      completeRawPackets,
      incompletePackets,
      omittedPackets,
      exactHistoricalMatches,
      patterns,
      candidateServiceClaimed: candidateServices.length > 0,
      candidateDataNotifyProperties: [...properties].sort(),
    };
  });
  return {
    format: 'sasori.elmo-offline-review',
    schemaVersion: 1,
    offlineOnly: true,
    protocolVerdict: 'inconclusive',
    records,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/elmo-capture-review.mjs <local-session-or-backup.json>');
    process.exitCode = 1;
  } else {
    try {
      const path = process.argv[2];
      const stat = statSync(path);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Unsupported input');
      console.log(JSON.stringify(reviewElmoCapture(readFileSync(path, 'utf8')), null, 2));
    } catch {
      // Neither parser messages nor native filesystem errors may echo private input or paths.
      console.error('Cannot review capture. Use a valid Sasori JSON export, at most 13 MB.');
      process.exitCode = 1;
    }
  }
}
