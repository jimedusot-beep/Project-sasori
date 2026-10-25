import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { nativeEntry } from './configure.mjs';
const root = fileURLToPath(new URL('./', import.meta.url));
await mkdir(root + 'www', { recursive: true });
await cp(root + '../../site', root + 'www', { recursive: true });
await build({
  entryPoints: [root + 'bootstrap.js'],
  outfile: root + 'www/native.js',
  bundle: true,
  format: 'iife',
  minify: true,
});
const html = await readFile(root + 'www/index.html', 'utf8');
await writeFile(root + 'www/index.html', nativeEntry(html));
console.log('Bundled Sasori UI and local native bridge. No remote website or secrets included.');

const privacy = await readFile(root + 'www/privacy.html', 'utf8');
const entry = '<script type="module" src="privacy-ui.js"></script>';
if (!privacy.includes(entry) || privacy.includes('<script src="native.js"></script>'))
  throw new Error('Unexpected Privacy Lab native entry.');
await writeFile(
  root + 'www/privacy.html',
  privacy.replace(entry, '<script src="native.js"></script>\n' + entry),
);
