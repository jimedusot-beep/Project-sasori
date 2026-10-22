# Elmo BLE protocol: facts, candidates, and unknowns

Status: inspection support implemented; real-unit compatibility pending. There is no live authentication or physical command specification.

## Provenance

Historical inbound bytes originate from the earlier V4 user-reported test, preserved in [protocol-notifications.md](../experiments/001-elmo-l2l/protocol-notifications.md). They are not a new capture from Sasori v0.2.

The GATT identifiers in site/lib/profiles.js are transcribed facts from [NonaSuomy/Love2LearnElmo at commit 82fa312e06af1d8e549cec588856ebce227b5f77](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md), section ELMO_SERVICE_UUID. The original source blob is 5cbdcf5272a25ee4c17235b16570895b8bf2bf13. This single research notebook is not a manufacturer protocol document, and its results have not been independently reproduced on Jimmy's unit.

The app exposes that source and requires deliberate profile loading. It requests only the chosen service; Web Bluetooth cannot enumerate arbitrary ungranted services. Characteristic property names describe GATT capabilities, not valid Elmo commands, permissions at every security level, or safe physical actions.

## Inspection behavior

The default candidate profile uses the reported custom service and data-notify characteristic. Users may enter independently observed identifiers. An empty notify identifier performs metadata-only inspection. Subscription can change the GATT client-characteristic configuration descriptor, but no application characteristic writes are implemented.

The registry also records other reported notify/write characteristics for comparison, with every write entry explicitly blocked. Firmware services are excluded. No serial number, device address, password, or device identifier is intentionally read.

## Inbound interpretation

One notification is retained as one observation. This does not prove one notification equals one protocol frame. There is no speculative reassembly, checksum, packet replay, or generated command.

Known historical text patterns are NewModeIdx followed by digits and Start:LowPowerSleep. Their values and operational meanings remain unknown. In the recorded examples, candidate text begins after 0x60 or 0x61 and may end with null. The decoder preserves all received hex and raw display text, labels matching candidate text, and explicitly leaves prefix meaning unknown. An arbitrary joined or fragmented text sequence is not promoted to a known message.

Binary input is shown in hex with a malformed/non-UTF-8 flag where applicable. Live retention is capped at 1,024 bytes per notification; the original length is reported. Offline pasted-hex analysis accepts at most 4,096 bytes. Oversized input is not used to infer semantics.

## Authentication assessment

Hasbro's historical app terms describe a user-selected password. This establishes neither its wire encoding nor a challenge-response algorithm. The community notebook mentions a securityChallenge field in application notes but does not establish a validated exchange, response construction, success marker, key derivation, retry policy, or compatibility with V4.

Accordingly there are no live handshake operations, credential inputs, or guessed passwords in Sasori. The authentication UI tests synthetic success, rejection, timeout, cancellation, and inconclusive outcomes only. Its fixture events do not implement or model an Elmo cryptographic algorithm.

Before live authentication: finish repeatable inspection, identify exact characteristics and message boundaries, acquire authorized traces from legitimately held app/device observations, establish a testable success/rejection criterion, and document a finite traffic budget. Keep legitimate credentials in private local memory; never public source or diagnostics.

## Command registry

| Category                             | Current entries                                            | Transmission                      |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------- |
| Passive inspection                   | Service metadata and configured notifications              | Explicit connection only; bounded |
| Experimental application commands    | None established                                           | Disabled                          |
| Verified application commands        | None established                                           | Unavailable                       |
| Physical voice/motor/sensor commands | No verified protocol or safety envelope                    | Unavailable                       |
| Simulation                           | Synthetic lifecycle, outcomes, movement, phone-local audio | No Bluetooth traffic              |

## Independent source-verification track

The October 21 [source review](../experiments/001-elmo-l2l/source-verification.md) separately records directly inspected project/community source, prior-report app-message claims, historical user observations and unresolved hypotheses. It reviews open PR #11 at its exact head revision and rereads the original teardown report. The reported APK could not be obtained here (HTTP 403); password/challenge construction, acceptance framing and status-message vectors remain unverified. No application-message constructors or transmitter have been added.

The [offline capture reviewer](../experiments/001-elmo-l2l/offline-review.md) handles the existing session envelope and historical byte examples only. Its protocol verdict is always inconclusive. The [live experiment draft](../experiments/001-elmo-l2l/live-experiment.md) defines prerequisites, bounded budgets and accepted/rejected/inconclusive results; it is not ready to run. This track supplies no dependency or gate for replacement-controller development.
