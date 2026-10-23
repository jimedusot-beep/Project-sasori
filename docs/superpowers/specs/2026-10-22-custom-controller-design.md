# Custom-controller virtual Elmo design

Status: proposed for owner review, October 22, 2026. Scope: assignment 2 only. This document specifies a software simulation; no code, firmware, physical sender, electrical calibration or hardware approval is delivered by it.

## Goal and boundaries

Build a virtual mouth controller inside the existing Control laboratory. A user explicitly connects a virtual controller, arms it, requests one bounded opening/closing animation, and stops/disarms it. The interface and tests establish a contract for later custom hardware without requiring Hasbro authentication.

Preserve BLE inspection, My toys, records, historical decoding, synthetic authentication, and existing local audio previews. The original `BluetoothTransport` stays inspection-only. Do not enable physical commands through the current capability flags. A custom controller has a different identity and schema from an original Elmo, a BLE inspection profile, and a `sasori.session` record. Imported data never dispatches commands.

## Alternatives and decision

| Approach                                                                                       | Consequence                                                                       | Proposal    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| Extend the original inspection transport to send custom motor requests                         | Mixes unrelated protocols and undermines the current inspection boundary          | Reject      |
| Separate virtual custom-controller module and a later independently validated physical adapter | Reuses the existing UI while isolating simulation, protocol and hardware evidence | Recommended |
| Build a separate application/framework                                                         | Duplicates navigation, storage and testing before the first behavior works        | Defer       |

This is an architectural addition. Implementation follows owner review of this specification and a subsequent file-level plan. Firmware and real transport require a later board-specific design.

## Modules and proposed interfaces

| Proposed file                                                           | Responsibility / interface                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site/lib/retrofit/protocol.js`                                         | `validateRequest(value)` validates a decoded command; `parseRequest(text)` bounds/decodes JSON; neither performs actions                                         |
| `site/lib/retrofit/virtual-controller.js`                               | `VirtualMouthController({clock, emit})`, with `connect()`, `dispatch(request)`, `advance(nowMs)`, `setFault(code, active)`, `disconnect(reason)`; no device APIs |
| `site/retrofit.js`                                                      | `initRetrofitLab()` binds existing Control laboratory markup to the virtual controller, renders events and owns timer cleanup                                    |
| Existing `site/index.html`, `site/style.css`, `site/app.js`             | Add one clearly labeled virtual-controller panel and initialize it; retain existing screens and feature behavior                                                 |
| `tests/retrofit-protocol.test.mjs`, `tests/virtual-controller.test.mjs` | Request boundary and deterministic state/time tests using an injected monotonic clock                                                                            |
| `tests/browser/retrofit.spec.js`                                        | User workflow, cancellation/background handling, source labels and no radio/serial access                                                                        |

The simulated controller's `connect()` returns a fresh opaque connection session ID and a disarmed status. A second connect while connected rejects rather than resetting the active session. `dispatch` returns an acknowledgement and emits relevant events. `advance` evaluates deadlines in the injected clock domain; tests do not rely on wall-clock sleeps. The browser adapter owns a single scheduler that advances the controller, renders state, and cancels on teardown. No hardware-specific GPIO, PWM, UUID, driver or voltage value enters these modules.

## Request contract

Proposed schema name: `sasori.retrofit.command`, version `1`. This is an original Sasori design, not a recovered Hasbro packet.

Required fields: `format`, `version`, `sessionId`, `requestId`, `sequence`, `command`, `args`. IDs are nonempty strings of at most 64 ASCII letters/digits/underscore/hyphen. `sequence` is a positive safe integer. Reject unknown fields, wrong types, arrays/null in place of objects, non-finite values, unsupported commands/versions and arguments not belonging to the selected command. `parseRequest` accepts at most 1,024 UTF-8 bytes and a single JSON object; no evaluation, command replay or import hook.

| Command       | Args                                                  | Allowed effect                                                                                                   |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `STATUS`      | `{}`                                                  | Return source, controller ID, current state and software budgets; never arm or refresh the heartbeat             |
| `ARM`         | `{consent: true}`                                     | In a current, healthy, disarmed virtual session, arm and start the lease; no motion                              |
| `PULSE_MOUTH` | `{direction: "open" or "close", durationMs: integer}` | If armed, start one bounded virtual animation; reject if another pulse is active                                 |
| `HEARTBEAT`   | `{}`                                                  | Refresh the lease for an armed/moving current session only                                                       |
| `STOP`        | `{}`                                                  | Cancel motion, clear pending actions and disarm; idempotent in every connected state, including fault            |
| `CLEAR_FAULT` | `{consent: true}`                                     | After the fault condition has been removed, acknowledge fault clearance and return disarmed; never resume or arm |

Acknowledgement schema: `sasori.retrofit.ack`, version `1`, echoed `sessionId`/`requestId`, `accepted` and `duplicate` booleans, fixed result `code`, and the controller's current `state`. Codes include `OK`, `INVALID_REQUEST`, `DISCONNECTED`, `WRONG_SESSION`, `STALE_SEQUENCE`, `DUPLICATE_CONFLICT`, `DISARMED`, `BUSY`, `FAULT`, `BUDGET_EXCEEDED`. No echoed arbitrary exception text. Acknowledgement means the virtual request was accepted, not that physical movement occurred.

Within one connection, previously accepted request IDs with identical content return their recorded acceptance/result code with `duplicate: true` and the current state, without repeating an action or refreshing a lease. Never return an old armed/moving state after the controller has stopped or faulted. Reusing an ID for different content rejects it. New state-changing requests require increasing sequence values. A request with a previous connection's session ID is stale and cannot arm or move the current controller. A structurally valid `STOP` for the current session always stops, even when its sequence/ID is repeated; cancellation takes precedence over replay bookkeeping. Unparseable data cannot start an action.

Limit each connection to 256 new state-changing requests and retain their acknowledgement identities for that connection. Budget exhaustion cancels motion and faults; it must not evict an old identity and allow its replay. `STATUS` remains readable and `STOP` remains effective after exhaustion. Those two commands are stateless/idempotent, do not allocate replay entries, do not advance the state-changing sequence, and never refresh a lease. They must still have a valid envelope and current session. Reconnect creates a fresh session and stays disarmed. This finite simulation session is not a production serial replay/security design; the later physical transport must specify its own bounded framing, freshness and identity rules before transmission.

## States and timing

States: `disconnected`, `disarmed`, `armed`, `moving`, `fault`. Initial state and state after disconnect are `disconnected`; a new connection becomes `disarmed`. A completed pulse becomes `armed` only while its existing lease/session budget remains valid. Stop becomes `disarmed` when no fault is latched; otherwise it cancels activity and leaves state `fault`. A cleared fault becomes `disarmed`. No automatic arming, reconnect, queued movement, or replay after a stop.

Proposed **simulation-only software budgets**:

| Budget                                            | Value             | Meaning                                                                              |
| ------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Maximum virtual pulse                             | 500 ms            | Animation scheduling limit; request duration must be an integer 1–500 ms             |
| Heartbeat lease                                   | 1,000 ms          | At expiry, cancel the pulse and fault/disarm; a duplicate heartbeat cannot extend it |
| Browser heartbeat interval while explicitly armed | 250 ms            | One scheduler only, stopped when disarmed/hidden/disconnected                        |
| Connection duration                               | 60,000 ms         | Expiry stops/disarms and closes the virtual connection                               |
| Encoded frame                                     | 1,024 UTF-8 bytes | Parser limit                                                                         |
| New state-changing requests per connection        | 256               | Finite identity/replay budget; status/stop stay available                            |

These constants are chosen for a bounded UI demonstration and do not specify safe motor pulse lengths, controller watchdog latency, electrical limits or physical travel. No mechanical position/angle is inferred. Render a stylized mouth animation/direction and explicitly synthetic phase; do not label it measured position, degrees or feedback.

The controller checks elapsed time on every dispatch and `advance` before accepting any motion/lease extension. A delayed browser timer cannot grant extra simulated motion. If the clock goes backward or is non-finite, cancel and fault. Real watchdog enforcement later belongs on the microcontroller and must not depend on browser scheduling.

`setFault(code, active)` accepts the fixed synthetic cause `LIMIT_INPUT`; setting it true cancels motion and latches fault. Setting it false removes the cause without clearing the latch. Clock/lease/budget faults arise from the controller's own checks. For an expired lease, an explicit clear may acknowledge it and return disarmed; an exhausted connection budget or elapsed connection requires reconnect instead. Fault injection is visibly synthetic. A fault latch survives `STOP` until its cause is removed and `CLEAR_FAULT` is explicitly accepted. Closing a connection invalidates all old callbacks; a delayed completion cannot re-arm a stopped/reconnected session.

## UI and lifecycle

Use the existing Control laboratory, not a separate app. Display `VIRTUAL CUSTOM CONTROLLER`, `SIMULATED`, `NO HARDWARE TRAFFIC`, state, current action, connection/lease status and fixed fault code. Controller identity is `sasori.virtual-mouth.v1` and is never displayed as the real Elmo's firmware.

Provide explicit Connect virtual, Arm, Open pulse, Close pulse, Stop, Disconnect and synthetic fault/clear controls. Arm needs a deliberate confirmation control; pulse buttons are unavailable while disarmed/faulted/busy. Stop is available for a connected virtual controller. A user pressing a disabled button cannot bypass state validation through the protocol layer.

The existing global Stop cancels both existing previews and the virtual controller. Page hidden, page teardown, or leaving Control laboratory stops/disarms virtual motion and cancels its timers. Returning to the panel never restores an armed session. Raw imports, saved inspection settings, My toys selections, and synthetic authentication outcomes have no route to this dispatcher. No Web Bluetooth, Web Serial, local bridge, network sender or credentials are added in assignment 2.

## Acceptance and failure tests

| Input or event                                                                            | Required result                                                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Connect; pulse before arm                                                                 | Disarmed; no motion event                                                                             |
| Arm; one valid pulse; clock reaches its deadline                                          | Exactly one pulse; no queue; returns armed only if lease valid                                        |
| Stop during pulse; later completion callback                                              | Disarmed and inactive; callback cannot restart it                                                     |
| Rapid/repeated clicks or duplicate accepted request                                       | At most one active pulse; no repeated execution                                                       |
| Same ID with changed arguments, old sequence or prior session                             | Rejected; no motion or lease refresh                                                                  |
| Missing/extra fields, invalid JSON, wrong version, oversized UTF-8 or non-finite duration | Rejected before action                                                                                |
| Lease expiry, clock anomaly, injected limit/fault                                         | Pulse cancelled; fault latched, no implicit resume                                                    |
| Delayed heartbeat arrives after lease expiry                                              | Cannot revive the old arm lease                                                                       |
| Fault cause removed; clear; new arm                                                       | Clear leaves disarmed; only a separate explicit arm allows a new pulse                                |
| Connection duration/request budget exhausted                                              | Cancel; disarm/fault as specified; reconnect starts a fresh disarmed session                          |
| Disconnect/reconnect; old timers and queued events                                        | New session ID; no stale action                                                                       |
| Global Stop, hidden page or navigation away                                               | Cancel current previews and virtual motion; no active virtual timers                                  |
| Imported file, selected toy or synthetic auth success                                     | No arm/dispatch side effect                                                                           |
| Browser workflow in desktop Chromium and iPhone-sized WebKit                              | Labels visible, controls usable, no horizontal overflow and no Bluetooth/serial/network-control calls |

Run existing repository checks and relevant browser regression suites after implementation. Tests must assert emitted actions/state and absence of forbidden transport calls, not only match labels or implementation strings. Hardware tests remain pending even if every simulation test passes.

## Review decisions and later work

The owner is reviewing the separated virtual-controller approach, pulse-based abstraction, explicit arming/stop behavior and scoped assignment 2. Electrical pinouts, controller/driver selection, physical stop mode, watchdog/pulse values for real hardware, serial framing and audio-output selection remain outside this specification; they require measured evidence and later design work.

Next after specification review: write a file-level implementation plan with red/green tests for the modules above. Assignments 3–6 then add board-specific firmware, audio coordination, deterministic behaviors and a local USB bridge in separate reviewable changes. Assignment 7 retains its existing independent evidence gates. Source basis and ownership/measurement limits are in the [hardware inventory](../../../experiments/001-elmo-l2l/retrofit/hardware-inventory.md).
