# Elmo retrofit build

Reviewed October 22, 2026 (America/New_York). Assignment 1 deliverable: conversion plan and evidence inventory. No controller has been selected, wired, or bench-tested by this work.

## First demonstration

A manual button starts one chosen recording and bounded mouth activity, then returns to idle. Stop cancels playback and movement. Conversation, a microphone, cameras, additional joints, and autonomous decisions are later work.

Two tracks run independently:

| Track                  | Reused system                                       | Required evidence                                                                                             | Current boundary                                                                                    |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Original board / BLE   | Hasbro electronics, firmware and existing mechanism | Source-backed packet construction, this unit's GATT observations, authentication and action-specific limits   | Inspection and offline RX review exist. Authentication and live commands remain unverified.         |
| Replacement controller | Body and individually verified reusable components  | Exact controller/driver documentation, isolated wiring, supply compatibility and measured mechanical behavior | Hardware inventory and proposed virtual-controller design only. No physical sender or firmware yet. |

Factory authentication is a prerequisite only for commands that require it on the original board. It is not a prerequisite for an independent replacement controller. Conversely, a custom-controller simulation cannot verify the factory protocol or a physical motor.

## Work already in the repository

At base commit `debf53704c13b1df714f9e47e741e6574f1d7fa6`, PRs #11 and #12 are merged. Use the existing [app leads](../app-protocol-leads.md), [source verification](../source-verification.md), [offline review](../offline-review.md), and [gated live experiment](../live-experiment.md). Do not recreate them or treat the historical captures as fresh observations. PR #15, the private REA handoff, was open at review time and is separate work, not a dependency or a merged feature.

The application already provides BLE inspection, persistent My toys profiles, research records, a synthetic transport, synthetic authentication fixtures, visual motion previews, and computer/phone-local audio previews. These do not implement the replacement-controller protocol proposed below.

## Assignment status and dependencies

| Assignment               | Deliverable and exit evidence                                                                                | Dependencies                                                                                        | Status at this review                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Conversion plan       | Inventory, compatibility requirements, worksheet, independent tracks and explicit blockers                   | Current repository and available project sources                                                    | Documentation prepared; no hardware approval implied                                    |
| 2. Virtual controller    | Versioned requests, simulated mouth view, arming/stop lifecycle and deterministic failure tests              | Review of [proposed design](../../../docs/superpowers/specs/2026-10-22-custom-controller-design.md) | Proposed; not implemented                                                               |
| 3. Firmware              | Build for an exact board, tested local watchdog/driver abstraction and isolated bench procedure              | Assignment 2 protocol plus selected board/driver, mapped wiring and calibration                     | Blocked on hardware selection/evidence                                                  |
| 4. Audio coordination    | User-owned/licensed clip, preview, interruption-safe scheduling, then compatible physical audio              | Assignment 2 simulator; physical playback additionally needs amplifier/speaker evidence             | Existing local previews only; coordinated scheduler not implemented                     |
| 5. Behaviors             | Editable deterministic routines, input debounce/cooldowns and stop/fault priority                            | Tested controller/audio interfaces                                                                  | Not implemented                                                                         |
| 6. Integrated build      | Acer-hosted local USB bridge, disarmed startup, origin checks, clear status and repeated bench trials        | Firmware, audio, behavior and physical compatibility evidence                                       | Not implemented; physical acceptance pending                                            |
| 7. Original BLE research | Reproducible source facts, offline vectors and eventually a bounded known-credential/status-query experiment | Independent source and unit-specific evidence                                                       | Existing research retained; exact gaps G1-G8 remain in the source-verification document |

Implementation and hardware acceptance are separate. A simulator can be finished while physical checks remain pending. A firmware compile can pass before wiring is approved. Neither is evidence that Elmo spoke or moved.

## Proposed system responsibilities

| Part                                         | Responsibility                                                                  | Constraint                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Existing Sasori site                         | Research, inspection and clearly labeled simulation                             | GitHub Pages remains static; it is not a USB host or a public motor service |
| Acer laptop, if its OS/USB/audio checks pass | Later local bridge, routine scheduling and a supported audio path               | Prefer one local runtime; initial control surface on the same computer      |
| Selected microcontroller                     | Local arming, bounded actuation, limit input, communication watchdog and faults | No selected model or pin assignment yet; power-up and reconnect disarmed    |
| Matched motor driver                         | Switch motor current and implement the tested stop condition                    | Controller GPIO is a signal source, not a motor supply                      |
| Matched audio interface/amplifier            | Drive an identified speaker                                                     | Original and replacement amplifier outputs must never be tied together      |
| Physical disconnect                          | Remove the relevant load power independently of browser/software                | Function and accessibility must be checked on the actual wiring             |

A newly written adapter must be separate from `BluetoothTransport`, the existing synthetic inspection transport, and factory packet decoding. Never enable physical operation by changing the current `verified: false` capability flags or promoting an imported record. No controller code is shipped by this documentation change.

## Immediate physical blockers

The first missing evidence is small: current toy markings, an existing usable photo set or new clear connector photos, and the exact controller/driver hardware actually available. The [worksheet](bench-worksheet.md) starts with power removed and requires no speculative powered experiment. The [inventory](hardware-inventory.md) records what each later check must establish.

Do not buy a collection of boards before this check. The H.E.R.B.I.E. pan/tilt BOM is a planning reference for another mechanism; its actuator counts and ratings do not transfer to Elmo.

## First physical acceptance record

After component-specific operating limits have been established, use one record per trial. Run 10 normal start/play/mouth/idle trials under the same documented setup, plus separate stop, link-loss, audio-failure and applicable limit-input trials. Ten trials are a project repeatability target, not a reliability certification.

| Field        | Required entry                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Setup        | Board/revision, firmware, driver, wiring revision, calibration ID, power source and clip ID         |
| Conditions   | Date/time zone, supply at rest and under representative load, ambient conditions                    |
| Trigger      | One manual action; no unattended autoplay                                                           |
| Observations | Actual audio path, actual mouth response, faults, temperature/current anomalies                     |
| Stop test    | Requested stop, measured response, applicable measured acceptance limit and power-disconnect result |
| End state    | Idle/disarmed/fault, remaining movement or queued audio                                             |
| Result       | PASS / FAIL / PENDING with evidence and next action                                                 |

Never prefill a pass or an allowable electrical/mechanical value. Missing acceptance limits leave the physical result pending. See the inventory's source table for the evidence basis.
