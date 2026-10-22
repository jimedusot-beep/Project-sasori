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

## Current v0.2 update

A source-linked community GATT table has now been identified in [NonaSuomy/Love2LearnElmo](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md). The app offers deliberate loading of its candidate service and notification UUIDs. This is not V4 source recovery and is not independent reproduction on this unit.

The historical raw examples and offline analyzer from the earlier research merge are preserved. Live and simulated sessions now save locally, with imported provenance labeled separately. See [current protocol assessment](../../docs/protocol.md).

The [app-protocol lead register](app-protocol-leads.md) now preserves additional claims from the owner's October 18 teardown report. Its reported password/challenge handling and command definitions require independent source verification; no live transmitter has been implemented from them.

## Unknowns

- Whether the community-reported GATT UUIDs and properties match this unit (verify with real inspection or nRF Connect).
- Complete authentication algorithm and packet construction: the earlier report provides MD5/Fletcher32 leads, but source reproduction, password acceptance, and full protocol framing remain outstanding.
- Meaning of mode index 12, lifetime of the BLE link, movement and audio control protocol.

## Next experiment

Follow the [first two live captures](../../docs/iphone-setup.md#first-two-live-captures) on the Project Sasori GitHub Pages site in Bluefy: metadata first, then the candidate data-notification channel if present. Compare timestamps, status, notifications, and disconnect behavior to V4. Do not extrapolate from a completed inspection to authentication success.

## Evidence handling

For the independent original-controller research track, read the [source verification and gap register](source-verification.md), [offline review instructions](offline-review.md), and [gated live experiment draft](live-experiment.md). These supersede any implication that reported command definitions or an inspection-page title demonstrate authentication. Replacement-controller work does not wait for this track.

Retain only sanitized logs. Never commit passwords, challenge-response tokens, or unique device IDs.

## Status

Bluetooth inspection observed through original V4; this new site awaits physical validation.
