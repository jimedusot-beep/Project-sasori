import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const ignored = new Set([
  '.git',
  'node_modules',
  'test-results',
  'playwright-report',
  'coverage',
  '.openai',
  'secrets',
  'private-logs',
]);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[a-zA-Z0-9_]{30,}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][a-zA-Z0-9/+_=-]{24,}["']/i,
];
const failures = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (
      /\.(?:js|mjs|json|html|md|ya?ml|txt)$/.test(entry.name) &&
      entry.name !== 'package-lock.json' &&
      !file.includes('tests/')
    ) {
      const text = await readFile(file, 'utf8');
      if (rules.some((rule) => rule.test(text))) failures.push(file);
    }
  }
}
await scan('.');
if (failures.length) {
  console.error('Potential credentials detected in: ' + failures.join(', '));
  process.exitCode = 1;
} else
  console.log(
    'Credential-pattern scan passed. This check does not detect every possible secret; review captures before sharing.',
  );
