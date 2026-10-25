const base = process.argv[2];
if (!base || !base.startsWith('https://')) throw new Error('Provide the deployed HTTPS Pages URL.');
const checked = new Set();
async function check(relative) {
  const url = new URL(relative, base).href;
  if (checked.has(url)) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
  const body = await response.text();
  checked.add(url);
  if (relative === 'index.html' && !body.includes('Project Sasori'))
    throw new Error('Unexpected deployed HTML.');
  if (/\.(?:js|mjs)$/.test(relative)) {
    const imports = [...body.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map((m) => m[1]);
    for (const name of imports)
      await check(new URL(name, url).pathname.slice(new URL(base).pathname.length));
  }
}
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    for (const file of [
      'index.html',
      'entry.js',
      'app.js',
      'style.css',
      'tokens.css',
      'icon.svg',
      'elmo.html',
      'elmo.css',
      'elmo-ui.js',
      'hub.html',
      'hub.css',
      'hub-ui.js',
      'projects.html',
      'projects.css',
      'projects-ui.js',
      'keyfob-lab.html',
      'keyfob-lab.css',
      'keyfob-lab.js',
      'lib/keyfob-audio.js',
      'signal-atlas.html',
      'signal-atlas.css',
      'signal-atlas-ui.js',
      'pocket-ir.html',
      'pocket-ir.css',
      'pocket-ir-ui.js',
      'companion.html',
      'companion-ui.js',
    ])
      await check(file);
    console.log('Verified deployed HTTPS site and ' + checked.size + ' assets at ' + base);
    process.exit(0);
  } catch (error) {
    checked.clear();
    if (attempt === 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
