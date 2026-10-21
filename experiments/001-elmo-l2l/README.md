# Experiment 001 — Hasbro Love2Learn Elmo (B6572)

## Goal

Characterize the toy's Bluetooth Low Energy interface on a user-owned unit and explore legitimate interoperability with animatronics research.

## Verified observations from Bluefy V4 on 2026-10-20

- Device chooser returned **Elmo L2L**.
- GATT connection succeeded and an Elmo custom service was discovered.
- A write-without-response characteristic and a notify characteristic were identified.
- Data notifications were enabled.
- Incoming data included a message decoded as `NewModeIdx:12` and another as `Start:LowPowerSleep`.
- Read-only inspection ended after roughly 15 seconds.
- A subsequent screenshot still showed `MODE inspect`, not an authenticated run.

## Unknowns

- Exact GATT UUIDs (retrieve from actual V4 probe source or nRF Connect).
- Authentication algorithm, whether user-selected password is accepted, and full protocol framing.
- Meaning of mode index 12, lifetime of the BLE link, movement and audio control protocol.

## Next experiment

Open the Project Sasori GitHub Pages site in Bluefy, enter documented UUIDs, and repeat the **read-only** connection. Compare timestamps, status, notifications, and disconnect behavior to V4. Do not extrapolate from a completed inspection to authentication success.

## Evidence handling

Retain only sanitized logs. Never commit passwords, challenge-response tokens, or unique device IDs.

## Status

Bluetooth inspection observed through original V4; this new site awaits physical validation.
