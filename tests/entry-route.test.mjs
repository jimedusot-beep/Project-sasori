import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../site/entry.js', import.meta.url), 'utf8');

function run(url) {
  const location = new URL(url);
  let redirected = null;
  vm.runInNewContext(script, {
    location: {
      protocol: location.protocol,
      hostname: location.hostname,
      pathname: location.pathname,
      hash: location.hash,
      href: location.href,
      replace: (target) => { redirected = target; },
    },
    URL,
  }, { timeout: 200 });
  return redirected;
}

test('public project root opens the Hub, but no device connection is attempted', () => {
  assert.equal(run('https://jimedusot-beep.github.io/Project-sasori/'),
    'https://jimedusot-beep.github.io/Project-sasori/hub.html');
});

test('existing full-lab, anchored, native and localhost entry links remain unchanged', () => {
  for (const url of [
    'https://jimedusot-beep.github.io/Project-sasori/index.html',
    'https://jimedusot-beep.github.io/Project-sasori/index.html#protocol',
    'https://jimedusot-beep.github.io/Project-sasori/#sessions',
    'http://127.0.0.1:4173/',
    'capacitor://localhost/',
    'https://different.github.io/Project-sasori/',
  ]) assert.equal(run(url), null, url);
});
