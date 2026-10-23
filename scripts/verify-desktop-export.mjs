import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseImport } from '../site/lib/records.js';
const records = parseImport(await readFile(process.argv[2], 'utf8'), 'desktop.json');
assert.equal(records.length, 1);
assert.equal(records[0].source, 'simulated');
assert.equal(records[0].inspection.transport, 'simulation');
assert.equal(records[0].payloadsIncluded, false);
console.log('Desktop synthetic export passes the shared Sasori session validator.');
