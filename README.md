# Project Sasori — Animatronics & Reverse Engineering Laboratory

A standalone learning laboratory for animatronic toys, BLE observation, robotic puppetry, and future H.E.R.B.I.E. interoperability. Independent fan project; not affiliated with Hasbro or Naruto.

## Experiment 001: Love2Learn Elmo (B6572)

A prior **Elmo Authentication Feasibility Probe V4** was observed connecting through Bluefy on iPhone (2026-10-20). The recorded test showed `Elmo L2L` discovery, GATT connection, custom service discovery, notification subscription, and incoming messages including `NewModeIdx:12` and `Start:LowPowerSleep`. Inspection finished with a disconnect after about fifteen seconds. **Authentication, audio, and motor control are not established.**

The original V4 probe source has **not** been recovered. Candidate BLE UUIDs have been documented by independent reverse-engineering research at https://github.com/NonaSuomy/Love2LearnElmo, but still require verification on this specific toy. This repository provides a **new inspection-only site**, not a recreation of the original authentication routine. The proposed mobile lab can load community-documented UUIDs and allows verification or editing before testing. No guessed pinouts, passwords, challenge algorithms, or motor commands.

## Website

After GitHub Pages is configured to use **GitHub Actions**, it deploys the `site/` directory. Open the deployed site in **Bluefy** on iPhone for Web Bluetooth. Safari may not expose Web Bluetooth. In live mode, review the community-sourced profile or manually enter verified UUIDs, enable **Show all Bluetooth devices** if the name-filtered picker cannot see Elmo, confirm ownership, and tap **Connect & inspect**. The site disconnects after approximately 15 seconds. Export or copy the diagnostic log if needed.

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

## Research archive and test boundaries

See [Seven-area engineering dossier](docs/research/seven-area-engineering-dossier.md), [Source reuse matrix](docs/research/reuse-matrix.md), [Evidence register](experiments/001-elmo-l2l/evidence-register.md), [UUID capture](experiments/001-elmo-l2l/iphone-uuid-capture-guide.md), and [Historical raw notifications](experiments/001-elmo-l2l/protocol-notifications.md). Original read-only packet-decoder source is retained in `site/elmo-packets.mjs` for research, but the new modular lab uses `site/lib/protocol.js`.

The browser laboratory's authentication and actuator controls are **simulation-only**. Bluetooth inspection is read-only at the application level, but subscribing to notifications changes the GATT subscription state. Web Bluetooth hardware verification remains pending. IndexedDB data stays local to this browser and may be lost: export backups. No GitHub synchronization backend is implemented.

To test the proposed v0.2 lab on Node 24+: `npm ci && npm run check && npm run test:browser` (the last command needs Playwright browsers installed). CI verifies web software but cannot certify iPhone Bluefy compatibility or real Elmo command behavior.
