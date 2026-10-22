import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { analyzeElmoNotification, hexOf, parseHex } from '../site/elmo-packets.mjs';
import { decodePacket } from '../site/lib/protocol.js';

const corpus = JSON.parse(
  readFileSync(new URL('../experiments/001-elmo-l2l/fixtures/historical-v4.json', import.meta.url)),
);
const historicalDocument = readFileSync(
  new URL('../experiments/001-elmo-l2l/protocol-notifications.md', import.meta.url),
  'utf8',
);
test('historical corpus pins the preserved document and immutable source reference', () => {
  const blob = createHash('sha1')
    .update(`blob ${Buffer.byteLength(historicalDocument)}\0`)
    .update(historicalDocument)
    .digest('hex');
  assert.equal(corpus.sourceBlob, blob);
  assert.equal(
    corpus.source,
    'https://github.com/jimedusot-beep/Project-sasori/blob/c0b4f74a6f10549cf09ec6062f9626cb570c9666/experiments/001-elmo-l2l/protocol-notifications.md',
  );
});
for (const sample of corpus.samples) {
  test(`historical report vector ${sample.id}: lossless bytes and unverified text only`, () => {
    const bytes = parseHex(sample.hex);
    assert.equal(corpus.evidenceClass, 'historical-user-reported');
    assert.equal(corpus.direction, 'RX');
    assert.ok(historicalDocument.includes(sample.hex));
    assert.equal(bytes.length, sample.byteLength);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256);
    assert.equal(hexOf(bytes), sample.hex);
    const analyzed = analyzeElmoNotification(bytes);
    assert.equal(analyzed.bodyText, sample.candidateBodyText);
    assert.equal(analyzed.verifiedCommand, false);
    // Exercise a real view with unrelated bytes on both sides of the retained observation.
    const padded = Uint8Array.from([255, ...bytes, 255]);
    const decoded = decodePacket(new DataView(padded.buffer, 1, bytes.length));
    assert.equal(decoded.hex.replaceAll(' ', ''), sample.hex);
    assert.equal(decoded.kind, sample.expectedKind);
  });
}
