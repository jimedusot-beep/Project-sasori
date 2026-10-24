import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  MAX_IR_BYTES,
  MAX_IR_SIGNALS,
  encodeFlipperSignal,
  parseFlipperIR,
  profileFromFlipperIR,
} from '../site/lib/flipper-ir.js';
import { IR_EXAMPLE_TEXT } from '../site/lib/flipper-ir-example.js';
import { emptyPocketData, importPocketProfile } from '../site/lib/pocket-ir-setups.js';
import { ResearchStore } from '../site/lib/storage.js';
import { indexedDB } from 'fake-indexeddb';
const header = 'Filetype: IR signals file\nVersion: 1\n#\n';
const block = (
  name = 'Power',
  protocol = 'SIRC',
  address = '01 00 00 00',
  command = '15 00 00 00',
) =>
  `name: ${name}\ntype: parsed\nprotocol: ${protocol}\naddress: ${address}\ncommand: ${command}\n#\n`;
const options = { id: 'ir-import-fixture', name: 'My exact model' };
test('conversion matches independent primary source vectors including all Sony bit widths', () => {
  for (const [p, a, c, proto, bits, code] of [
    ['NEC', 4, 8, 'NEC', 32, '0x20DF10EF'],
    ['NECext', 0x87ee, 0xa05d, 'NEC', 32, '0x77E1BA05'],
    ['NECext', 0xfb04, 0xf708, 'NEC', 32, '0x20DF10EF'],
    ['Samsung32', 7, 2, 'SAMSUNG', 32, '0xE0E040BF'],
    ['SIRC', 1, 21, 'SONY', 12, '0xA90'],
    ['SIRC15', 1, 21, 'SONY', 15, '0x5480'],
    ['SIRC15', 0xaa, 21, 'SONY', 15, '0x5455'],
    ['SIRC20', 0x21, 1, 'SONY', 20, '0x81080'],
    ['SIRC20', 0x1fff, 0x7f, 'SONY', 20, '0xFFFFF'],
    ['NECext', 0xffff, 0xffff, 'NEC', 32, '0xFFFFFFFF'],
  ])
    assert.deepEqual(encodeFlipperSignal(p, a, c), { proto, bits, code });
});
test('encoder rejects unsupported protocols, truncation, nonintegers, and overflow', () => {
  for (const protocol of ['RAW', 'RC5', 'NEC42', 'SONY', '__proto__', 'toString'])
    assert.throws(() => encodeFlipperSignal(protocol, 0, 0), /not supported/);
  for (const [p, a, c] of [
    ['NEC', 256, 1],
    ['NECext', 0, 65536],
    ['Samsung32', 1, 256],
    ['SIRC', 32, 0],
    ['SIRC15', 256, 0],
    ['SIRC20', 8192, 0],
    ['SIRC20', 0, 128],
    ['NEC', -1, 1],
    ['NEC', 1.5, 1],
    ['NEC', NaN, 1],
    ['NEC', 1, '1'],
  ])
    assert.throws(() => encodeFlipperSignal(p, a, c), /width/);
});
test('Flipper little-endian fields become named code candidates without adding complement bytes to NECext', () => {
  const parsed = parseFlipperIR(header + block('Apple', 'NECext', 'EE 87 00 00', '5D A0 00 00'));
  assert.equal(parsed.signals[0].code, '0x77E1BA05');
  assert.deepEqual(
    parseFlipperIR('\uFEFF' + (header + block()).replaceAll('\n', '\r\n')).signals[0],
    parseFlipperIR(header + block()).signals[0],
  );
});
test('CC0 source fixture is byte-identical to its pinned blob and example uses its six named records', async () => {
  const raw = await readFile('tests/fixtures/sony-bravia.ir');
  assert.equal(
    createHash('sha1')
      .update('blob ' + raw.length + '\0')
      .update(raw)
      .digest('hex'),
    'f8b0828d048a9f9d630af6ab4488a6e2cc9681f7',
  );
  const full = parseFlipperIR(raw.toString()),
    example = parseFlipperIR(IR_EXAMPLE_TEXT);
  assert.equal(full.signals.length, 13);
  assert.equal(full.signals.filter((s) => s.supported).length, 11);
  assert.equal(example.signals.filter((s) => s.supported).length, 5);
  for (const item of example.signals) {
    const source = full.signals.find((s) => s.name === item.name);
    assert.deepEqual({ ...item, index: 0 }, { ...source, index: 0 });
  }
  assert.doesNotMatch(JSON.stringify(example), /8958|duty_cycle|frequency|data:/);
});
test('RAW and unsupported parsed protocols remain inert and cannot enter a remote profile', () => {
  const raw =
    'name: Capture\ntype: raw\nfrequency: 38000\nduty_cycle: 0.33\ndata: 9000 4500 560 560\n#\n';
  const parsed = parseFlipperIR(
    header + block() + raw + block('Other', 'RC5', '00 00 00 00', '01 00 00 00'),
  );
  assert.deepEqual(
    parsed.signals.map((s) => s.supported),
    [true, false, false],
  );
  for (const pick of [[1], [2], [0, 1]])
    assert.throws(() => profileFromFlipperIR(parsed, pick, options), /supported/);
  assert.equal(profileFromFlipperIR(parsed, [0], options).buttons.length, 1);
});
test('malformed headers, duplicate fields, unknown fields, and invalid encoding reject the entire file', () => {
  const normal = header + block();
  for (const raw of [
    '',
    'Filetype: Flipper SubGhz Key File\nVersion: 1\n' + block(),
    normal.replace('Version: 1', 'Version: 2'),
    normal.replace('IR signals file', 'IR library file'),
    header,
    normal + 'protocol: NEC\n',
    normal.replace('type: parsed', 'type: parsed\ntype: raw'),
    normal.replace('type: parsed', 'type: parsed\nscript: run()'),
    normal.replace('address: 01 00 00 00', 'address: 01'),
    normal.replace('address: 01 00 00 00', 'address: 20 00 00 00'),
    normal.replace('command: 15 00 00 00', 'command: 15 00 00 FF'),
    normal.replace('Power', 'Pöwer'),
    normal.replace('Power', 'A'.repeat(81)),
    normal + 'oops',
    'name: Power\n' + normal,
  ])
    assert.throws(() => parseFlipperIR(raw));
});
test('input size and signal count limits accept the edge and reject larger payloads', () => {
  const edge =
    header + Array.from({ length: MAX_IR_SIGNALS }, (_, i) => block('Button' + i)).join('');
  assert.equal(parseFlipperIR(edge).signals.length, MAX_IR_SIGNALS);
  assert.throws(() => parseFlipperIR(edge + block()), /128 signals/);
  const base = header + block(),
    padded = base + '#' + ' '.repeat(MAX_IR_BYTES - base.length - 1);
  assert.equal(parseFlipperIR(padded).signals.length, 1);
  assert.throws(() => parseFlipperIR(padded + ' '), /128 KB/);
  assert.throws(() => parseFlipperIR(base + '#' + '🧪'.repeat(MAX_IR_BYTES / 4)), /128 KB/);
});
test('invalid RAW carriers, duty cycles, timings and oversized timing arrays reject', () => {
  const raw = 'name: Raw\ntype: raw\nfrequency: 38000\nduty_cycle: 0.33\ndata: 10 20\n';
  for (const text of [
    raw.replace('38000', '0'),
    raw.replace('0.33', '1.1'),
    raw.replace('10 20', '-1 2'),
    raw.replace('10 20', '0 20'),
    raw.replace('10 20', '4294967296'),
    raw.replace('10 20', Array(1025).fill('1').join(' ')),
  ])
    assert.throws(() => parseFlipperIR(header + text));
});
test('five-button profiles validate selection, preserve chosen order, and never upgrade physical evidence', () => {
  const parsed = parseFlipperIR(IR_EXAMPLE_TEXT),
    before = JSON.stringify(parsed);
  const profile = profileFromFlipperIR(parsed, [4, 0, 2], options);
  assert.deepEqual(
    profile.buttons.map((b) => [b.label, b.slot]),
    [
      ['Mute', 1],
      ['Power', 2],
      ['Vol dn', 3],
    ],
  );
  assert.match(profile.source, /physical behavior unverified/);
  assert.equal(JSON.stringify(parsed), before);
  for (const selection of [[], [0, 0], [0, 1, 2, 3, 4, 5], [-1], [99], ['0'], [0.5]])
    assert.throws(() => profileFromFlipperIR(parsed, selection, options));
  assert.throws(() => profileFromFlipperIR(parsed, [0], { ...options, name: '<script>' }));
});
test('hostile printable names are rendered as labels only and cannot add arbitrary profile fields', () => {
  const parsed = parseFlipperIR(header + block('<img src=x>'));
  const p = profileFromFlipperIR(parsed, [0], options);
  assert.equal(p.buttons[0].label, 'img src=x');
  const data = importPocketProfile(JSON.stringify(p), emptyPocketData());
  assert.equal(data.profiles.length, 1);
  assert.throws(() =>
    importPocketProfile(JSON.stringify({ ...p, endpoint: 'https://example.invalid' }), data),
  );
});
test('converted profiles reuse existing IndexedDB persistence and preserve saves after malformed new input', async () => {
  const name = 'ir-import-' + crypto.randomUUID(),
    s = await new ResearchStore({ indexedDB, name }).open();
  const p = profileFromFlipperIR(parseFlipperIR(IR_EXAMPLE_TEXT), [0, 1, 2, 3, 4], options);
  const next = await s.setPocketData(
    importPocketProfile(JSON.stringify(p), await s.getPocketData()),
  );
  assert.equal(next.selected, options.id);
  assert.throws(() => parseFlipperIR(header + block() + 'code: 0xBAD'));
  assert.equal((await s.getPocketData()).profiles[0].buttons[0].code, '0xA90');
  s.db.close();
  const reopened = await new ResearchStore({ indexedDB, name }).open();
  assert.equal((await reopened.getPocketData()).profiles[0].buttons.length, 5);
  reopened.db.close();
});
