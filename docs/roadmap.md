# Prioritized roadmap

Reviewed October 24, 2026 against main `47b0ddcf75a3d02acc871b13a219b2c7cbfbc544`. Software implementation and physical acceptance have separate completion criteria.

## Current software and next evidence

| Area                   | Implemented                                                                                                                                                   | Still needed                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Inspection             | Browser/Bluefy inspection, native iPhone Core Bluetooth app, desktop Bleak helper and private exports                                                         | Repeatable captures and teardown on the owner's unit                                                                              |
| Original Elmo protocol | Recovered app-method evidence, original browser/desktop known-password clients, input/volume queries and one built-in greeting; browser opt-in password setup | Unit-specific acceptance, status replies, actual playback, password persistence and recovery                                      |
| Laboratory             | Saved devices, Discovery, protocol recorder, standard BLE controls and a source-backed MiP adapter                                                            | Physical validation for each supported device/action; other experiment profiles remain scaffolds                                  |
| Replacement controller | Retrofit inventory, bench worksheet and proposed virtual-controller specification                                                                             | Virtual-controller implementation, exact hardware selection, firmware, coordinated audio/mouth behavior and local USB integration |

**Next owner-run step:** open [Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html) in Bluefy, connect with the known password, read status, request the greeting once and save the result. Use the [trial worksheet](elmo-remote.md#record-the-first-real-toy-trial) to record actual sound/motion and connection teardown separately. The report's queued greeting and toy-reported acceptance do not establish a physical effect. Disconnect is not a verified silence or motor-stop command.

## Two independent Elmo tracks

The original-board milestones M1-M3 below concern Hasbro's electronics and firmware. Replacement-controller development follows the [retrofit assignments](../experiments/001-elmo-l2l/retrofit/README.md) and does not depend on original-board authentication. Its independent prerequisites are a reviewed custom protocol/design, exact controller and driver selection, isolated wiring and measured operating limits.

Assignment 1 now has a source-labeled [inventory](../experiments/001-elmo-l2l/retrofit/hardware-inventory.md), [measurement worksheet](../experiments/001-elmo-l2l/retrofit/bench-worksheet.md) and explicit hardware blockers. Assignment 2 has a [proposed virtual-controller specification](superpowers/specs/2026-10-22-custom-controller-design.md) awaiting owner review. Firmware, coordinated physical audio/mouth operation and a USB bridge are not implemented. No simulation can close the physical acceptance milestones.

## M1 — Repeatable physical inspection

Tracked in [issue #4](https://github.com/jimedusot-beep/Project-sasori/issues/4).

The inspection tools exist; the repeatable physical baseline remains pending.

1. Open the published laboratory in Bluefy and test the attributed candidate profile on the real Elmo.
2. If needed, collect actual service/characteristic UUIDs and properties with the read-only nRF guide.
3. Complete five foreground 15-second captures with explicit stop reasons and saved notes.
4. Verify manual disconnect and page-background teardown of the inspection session. These are connection-lifecycle checks, not toy silence/motor-stop tests. Record iPhone/iOS/Bluefy versions; keep identifiers private.

Exit criterion: repeatable discovery, metadata, subscription, capture, and teardown on the real unit. Software simulation is not an alternative acceptance.

## M2 — Authorized, evidence-backed authentication

Tracked in [issue #5](https://github.com/jimedusot-beep/Project-sasori/issues/5).

The source-acquisition/construction blocker is cleared for the implemented subset. The [recovered-source record](../experiments/001-elmo-l2l/recovered-source.md) establishes method provenance, password conversion, digest/challenge construction and selected message framing. Browser and desktop implementations have synthetic tests; these do not establish real-unit acceptance. The [older source assessment](../experiments/001-elmo-l2l/source-verification.md) remains a dated record.

Run the [browser procedure and trial worksheet](elmo-remote.md) or the [bounded desktop procedure](../desktop/README.md#experimental-elmo-known-password-check). Record accepted, rejected and inconclusive outcomes without guessing credentials or command bytes. Read status before requesting the single greeting. Password setup is a separate browser-only opt-in after an exact unset report; persistence needs a fresh connection. Factory reset is not required for an existing-password trial.

Exit criterion: repeatable owner-device authentication and status-query results with private evidence, clear rejected/inconclusive outcomes and observed teardown/recovery. Actual greeting playback is a separate observation.

## M3 — Guarded voice and movement

The remotes already expose one experimental built-in greeting request. Its actual sound and any accompanying movement still need observation. Source-backed playback construction is not custom speech or independent mouth control.

Further actions require action-specific source/protocol evidence, unit-specific operating limits and a demonstrated physical power disconnect. A verified command to silence or stop the original toy has not been established; Bluetooth disconnect alone cannot close that gap. Custom audio, independent mouth actuation and their interruption behavior need additional engineering. No raw transmitter in the normal UI.

For the independent hardware path, see [Elmo replacement-controller research](replacement-controller-research.md). It can proceed independently of the original Bluetooth protocol, but physical power and movement tests require independent electrical and safety verification.

## M4 — Broader laboratory

Browser, native iPhone and private Bleak inspection transports are implemented. The [private REA handoff](rea-handoff.md), Discovery and protocol-recorder workflows also exist. Complete device profiles 002–004 as independent modules using the simulator contract first, and gather device-specific physical evidence for existing standard BLE/MiP controls. Any authenticated remote management needs a separate backend and threat review.

## Data durability improvements

Tracked in [issue #6](https://github.com/jimedusot-beep/Project-sasori/issues/6).

Add optional server-side authenticated GitHub/private-storage integration without public tokens. Keep origin/local storage disclosure explicit. Expand raw-capture archiving only after privacy-safe retention and recovery are designed.
