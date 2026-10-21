# Contributing

Use a focused feature branch, preserve recorded evidence, and run npm ci, npm run check, npm audit, and the browser suite before a pull request. Explain concrete behavior changes and what the tests establish.

Each protocol fact needs a source, exact revision or capture provenance, evidence class, unknowns, and a reproducible test. Synthetic fixtures must say synthetic in source, UI, records, and reports. Add regressions for meaningful lifecycle defects.

Do not commit credentials, unique device identifiers, challenge-response secrets, firmware dumps, app binaries, or proprietary audio. Unknown UUIDs, command bytes, electrical pinouts, and motor limits must stay unknown. The absence of an upstream license is not permission to copy its implementation.

Physical controls require a separate design and verified limits. The current transport intentionally exposes no command-write method. Imported files must never execute code or trigger traffic.

Use native modules and minimal dependencies; keep transport, device profiles, decoding, persistence, and UI responsibilities separate. Maintain relative assets for GitHub Pages repository paths. Update changelog, documentation, and evidence labels when scope changes.
