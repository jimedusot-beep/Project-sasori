# Prioritized roadmap

## Two independent Elmo tracks

The original-board milestones M1-M3 below apply to commands sent through Hasbro's firmware. Replacement-controller development follows the [retrofit assignments](../experiments/001-elmo-l2l/retrofit/README.md) and does not depend on original-board authentication. Its independent prerequisites are a reviewed custom protocol/design, exact controller and driver selection, isolated wiring and measured operating limits.

Assignment 1 now has a source-labeled [inventory](../experiments/001-elmo-l2l/retrofit/hardware-inventory.md), [measurement worksheet](../experiments/001-elmo-l2l/retrofit/bench-worksheet.md) and explicit hardware blockers. Assignment 2 has a [proposed virtual-controller specification](superpowers/specs/2026-10-22-custom-controller-design.md) awaiting owner review. Firmware, coordinated physical audio/mouth operation and a USB bridge are not implemented. No simulation can close the physical acceptance milestones.

## M1 — Repeatable physical inspection

Tracked in [issue #4](https://github.com/jimedusot-beep/Project-sasori/issues/4).

1. Open the published page in Bluefy and test the attributed candidate profile on the real Elmo.
2. If needed, collect actual service/characteristic UUIDs and properties with the read-only nRF guide.
3. Complete five foreground 15-second captures with explicit stop reasons and saved notes.
4. Verify a manual stop and page-background stop. Record iPhone/iOS/Bluefy versions; keep identifiers private.

Exit criterion: repeatable discovery, metadata, subscription, capture, and teardown on the real unit. Software simulation is not an alternative acceptance.

## M2 — Authorized, evidence-backed authentication

Tracked in [issue #5](https://github.com/jimedusot-beep/Project-sasori/issues/5).

After M1, collect legally held app/protocol documentation and authorized private traces. Establish message framing, challenge fields, credential handling, positive/rejected markers, retry limits, and a disprovable hypothesis. Review implementation before any live authentication traffic. Never brute force, extract credentials, reset firmware, or transplant commands from another toy.

Exit criterion: independently reproduced authentication with bounded opt-in traffic and clear inconclusive/rejected outcomes.

## M3 — Guarded voice and movement

Only after M2 and separate protocol/physical-limit evidence: characterize one known action at a time, define independent operating envelopes and a physical power stop, then add guarded adapters and regression fixtures. No raw transmitter in the normal UI.

## M4 — Broader laboratory

Implement device profiles 002–004 as independent modules; use the simulator contract first. Add private Bleak transport and H.E.R.B.I.E. session ingestion. Any authenticated remote management needs a separate backend and threat review.

## Data durability improvements

Tracked in [issue #6](https://github.com/jimedusot-beep/Project-sasori/issues/6).

Add optional server-side authenticated GitHub/private-storage integration without public tokens. Keep origin/local storage disclosure explicit. Expand raw-capture archiving only after privacy-safe retention and recovery are designed.
