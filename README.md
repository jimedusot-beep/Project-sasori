# Project Sasori — Animatronics & Reverse Engineering Laboratory

A standalone learning laboratory for animatronic toys, BLE observation, robotic puppetry, and future H.E.R.B.I.E. interoperability. Independent fan project; not affiliated with Hasbro or Naruto.

## Experiment 001: Love2Learn Elmo (B6572)

A prior **Elmo Authentication Feasibility Probe V4** was observed connecting through Bluefy on iPhone (2026-10-20). The recorded test showed `Elmo L2L` discovery, GATT connection, custom service discovery, notification subscription, and incoming messages including `NewModeIdx:12` and `Start:LowPowerSleep`. Inspection finished with a disconnect after about fifteen seconds. **Authentication, audio, and motor control are not established.**

The original V4 probe source and exact BLE UUIDs have **not** been recovered. This repository provides a **new inspection-only site**, not a recreation of the original authentication routine. Fill in verified service and notification characteristic UUIDs from V4 source or nRF Connect before testing. No guessed pinouts, passwords, challenge algorithms, or motor commands.

## Website

After GitHub Pages is configured to use **GitHub Actions**, it deploys the `site/` directory. Open the deployed site in **Bluefy** on iPhone for Web Bluetooth. Safari may not expose Web Bluetooth. On first launch, enter two verified 128-bit UUIDs and tap **Connect & inspect (read-only)**. The site disconnects after approximately 15 seconds. Export or copy the diagnostic log if needed.

## Structure

- `site/` — static mobile-first inspection application.
- `experiments/001-elmo-l2l/` — evidence and open questions.
- `docs/safety.md` — safety boundaries.
- `tests/` — Node automated checks.
- `.github/workflows/` — CI and Pages deployment.

## Safety and privacy

Only test hardware you own or are authorized to investigate. Keep fingers and cables clear of gears. Stop for electrical heat, exposed conductors, or unexpected movement. Do not upload toy passwords, credentials, personal details, or challenge-response secrets into public Issues/logs. GATT notifications require changing a subscription descriptor, but no application commands or authentication writes are sent by this site. Bluetooth functionality must be verified on the physical device; local static tests do not prove it works.

## Development

Run `node --check site/app.js` and `node --test tests/*.test.mjs` in repository root with Node 22+. Development status: experimental / hardware validation pending.

## Research and verification package (proposed branch)

- [Seven-area engineering dossier](docs/research/seven-area-engineering-dossier.md) — primary manufacturer sources, reusable code references, community methods, hardware observations, software audit, experiment procedures and expansion architecture.
- [Experiment 001 evidence register](experiments/001-elmo-l2l/evidence-register.md) — demonstrated vs unknown capabilities.
- [Read-only iPhone UUID capture guide](experiments/001-elmo-l2l/iphone-uuid-capture-guide.md) — recover the two UUIDs required by the site, without application commands.
- [Technology reuse matrix](docs/research/reuse-matrix.md) — what to reuse, what NOT to copy, and license/compatibility gates.
- [Recorded notification examples](experiments/001-elmo-l2l/protocol-notifications.md) — historic inbound bytes, **not commands**.
- [Offline packet analyzer](site/index.html) — parses existing log samples locally without connecting or sending Bluetooth application packets.

The original V4 hosted probe is not accessible to the repository; its original JavaScript code and UUIDs have not been independently recovered. This branch does not create new authentication functionality. Do not interpret the offline decoder as proving an Elmo command protocol.

### Before opening a pull request
Review changes, run \`node --check site/app.js\`, \`node --check site/elmo-packets.mjs\`, and \`node --test tests/*.test.mjs\`. Run real BLE verification only in Bluefy with verified UUIDs. Classify results as SIMULATED, SOURCE-VERIFIED, or HARDWARE-OBSERVED.
