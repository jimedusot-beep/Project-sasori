// Source receipts for original Sasori implementations. No upstream runtime is bundled.
export const INSPIRATIONS = Object.freeze([
  {
    id: 'elmo-pyelmo',
    name: 'Elmo pyelmo implementation',
    url: 'https://github.com/jesserockz/love2learn-elmo',
    revision: 'd397a7fb094079f6b1cac5605e95f74d1cb8d4b3',
    reference:
      'https://github.com/jesserockz/love2learn-elmo/blob/d397a7fb094079f6b1cac5605e95f74d1cb8d4b3/custom_components/love2learn_elmo/pyelmo/README.md',
    license: 'Apache-2.0',
    licenseReference:
      'https://github.com/jesserockz/love2learn-elmo/blob/d397a7fb094079f6b1cac5605e95f74d1cb8d4b3/LICENSE',
    reuse: 'Protocol-fact reference; original Sasori client, checked against the acquired app',
    aspect:
      'Known-password handshake, explicit hardware claims, fixed greeting and strict reply handling',
    implementation: 'site/lib/elmo-remote.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'elmo',
    name: 'Elmo research',
    url: 'https://github.com/NonaSuomy/Love2LearnElmo',
    revision: '82fa312e06af1d8e549cec588856ebce227b5f77',
    reference:
      'https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md',
    license: 'No explicit repository license found',
    licenseReference:
      'https://github.com/NonaSuomy/Love2LearnElmo/tree/82fa312e06af1d8e549cec588856ebce227b5f77',
    reuse: 'Read factual identifiers; original implementation only',
    aspect: 'Exact Elmo identity, source provenance, explicit authentication gaps',
    implementation: 'site/lib/adapters.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'bluefluff',
    name: 'Bluefluff',
    url: 'https://github.com/Jeija/bluefluff',
    revision: '9e865c47326167c2d4e6f47d96321e8e5cfc0e32',
    reference:
      'https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/README.md',
    license: 'MIT',
    licenseReference:
      'https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/LICENSE.md',
    reuse: 'Methodology only; no code or assets copied',
    aspect: 'Separate wire bytes, decoding, and device-specific interpretation',
    implementation: 'site/lib/adapters.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'mip',
    name: 'WowWee MiP',
    url: 'https://github.com/WowWeeLabs/MiP-BLE-Protocol',
    revision: '6123d0250f9b0bb6513d31eb6fbdc8213b5268a4',
    reference:
      'https://github.com/WowWeeLabs/MiP-BLE-Protocol/blob/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4/MiP-Protocol.md',
    license: 'No explicit repository license found',
    licenseReference:
      'https://github.com/WowWeeLabs/MiP-BLE-Protocol/tree/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4',
    reuse: 'Manufacturer protocol facts; original codec only',
    aspect: 'Command schema, raw request / ASCII-hex reply distinction, documented version query',
    implementation: 'site/lib/adapters.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'hacksby',
    name: 'Hacksby',
    url: 'https://github.com/iafan/Hacksby',
    revision: '2fbfa34f22635a56d0a13a7d65be104c1d5f7c06',
    reference:
      'https://github.com/iafan/Hacksby/blob/2fbfa34f22635a56d0a13a7d65be104c1d5f7c06/README.md',
    license: 'MIT',
    licenseReference:
      'https://github.com/iafan/Hacksby/blob/2fbfa34f22635a56d0a13a7d65be104c1d5f7c06/MIT-LICENSE.txt',
    reuse: 'Methodology only; no code or audio copied',
    aspect: 'Labeled acoustic capture path and cross-reference to existing WAV analysis',
    implementation: 'site/recorder-ui.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'pixmob',
    name: 'PixMob research',
    url: 'https://github.com/danielweidman/pixmob-ir-reverse-engineering',
    revision: 'b372420e1e1ff818a8d25ba50f0c71e97e62f138',
    reference:
      'https://github.com/danielweidman/pixmob-ir-reverse-engineering/blob/b372420e1e1ff818a8d25ba50f0c71e97e62f138/README.md',
    license: 'MIT',
    licenseReference:
      'https://github.com/danielweidman/pixmob-ir-reverse-engineering/blob/b372420e1e1ff818a8d25ba50f0c71e97e62f138/LICENSE',
    reuse: 'Methodology only; no code or signals copied',
    aspect:
      'Before/after markers and same-action timing comparisons; existing pulse analysis handoff',
    implementation: 'site/lib/traces.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'pulseview',
    name: 'PulseView / sigrok',
    url: 'https://github.com/sigrokproject/pulseview',
    revision: 'af02198741b4e57c9f9b796bd5e6c0f2ae9f2f2b',
    reference:
      'https://github.com/sigrokproject/pulseview/blob/af02198741b4e57c9f9b796bd5e6c0f2ae9f2f2b/README',
    license: 'GPL-3.0-or-later; file/asset terms vary',
    licenseReference:
      'https://github.com/sigrokproject/pulseview/blob/af02198741b4e57c9f9b796bd5e6c0f2ae9f2f2b/COPYING',
    reuse: 'Architecture reference only; no GPL implementation bundled',
    aspect: 'Timeline rows, explicit decoder selection, raw-versus-decoded separation',
    implementation: 'site/recorder-ui.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'pybricks',
    name: 'Pybricks',
    url: 'https://github.com/pybricks/pybricks-micropython',
    revision: 'df04d7220631bf0b7b435c1e371e627ccdd21822',
    reference:
      'https://github.com/pybricks/pybricks-micropython/blob/df04d7220631bf0b7b435c1e371e627ccdd21822/README.md',
    license: 'MIT for tagged Pybricks files; bundled components have separate licenses',
    licenseReference:
      'https://github.com/pybricks/pybricks-micropython/blob/df04d7220631bf0b7b435c1e371e627ccdd21822/LICENSE',
    reuse: 'Workflow reference only; no firmware copied or flashed',
    aspect: 'Model-specific support and setup / recovery readiness checklist',
    implementation: 'site/lib/adapters.js',
    reviewed: '2026-10-23',
  },
  {
    id: 'homeassistant',
    name: 'Home Assistant',
    url: 'https://github.com/home-assistant/core',
    revision: 'e53648ab56680237472408b070980e3f03329ad1',
    reference:
      'https://github.com/home-assistant/core/blob/e53648ab56680237472408b070980e3f03329ad1/homeassistant/components/demo/manifest.json',
    license: 'Apache-2.0 core; docs/components can differ',
    licenseReference:
      'https://github.com/home-assistant/core/blob/e53648ab56680237472408b070980e3f03329ad1/LICENSE.md',
    reuse: 'Manifest architecture reference only; no core code copied',
    aspect: 'Versioned adapter manifests, explicit capabilities, sources and availability',
    implementation: 'site/lib/adapters.js',
    reviewed: '2026-10-23',
  },
]);
