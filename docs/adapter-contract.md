# Device adapter contract

The implemented adapter is **ble-inspection/v1**. It supports service inspection and notification capture over Web Bluetooth, the native Core Bluetooth facade, and the desktop Bleak helper. Authentication and physical-action verification are false. A profile is configuration and evidence provenance; it is never executable adapter code.

## Identity and provenance

Save the device's display label separately from exact model, board revision, and firmware. Unknown values remain unknown. Snapshot that identity with every new inspection along with sourced service/notify identifiers, transport, requested duration, and measured GATT duration. Renaming a profile does not rewrite earlier snapshots.

User-supplied UUIDs, community reports, synthetic fixtures, and imported files remain distinguishable from locally observed service metadata. A writable property establishes a characteristic capability, not a known command or safe action.

## Adding a real device action

1. Complete repeatable physical inspection on the exact unit. Retain the observed characteristic properties, outcomes, and source references.
2. Establish framing and any required authentication from documented behavior or authorized private captures. Identify independently testable success, rejection, timeout, and inconclusive outcomes.
3. Implement a separate adapter for the exact model/firmware with named actions, strict parameter validation, finite time/packet budgets, explicit cancellation, and regression fixtures. Keep credential handling local to its reviewed runner.
4. Verify the mechanism and electrical operating limits before a physical action. Provide an appropriate independent stop/power-isolation method.
5. Test one action on hardware and retain its evidence and recovery behavior before advertising support.

No imported field, settings toggle, source claim, or successful synthetic fixture can enable a physical action in the current implementation. Elmo command bytes, keys, framing, motor limits, and recovery procedures are not invented.

## Independent replacement-controller route

A new owner-programmed controller is a separate adapter family. Its prerequisites are exact board/load identification, electrical ratings, mechanical limits, and a simulation-tested control interface. It does not depend on recovering original BLE authentication. See [replacement-controller research](replacement-controller-research.md) and the separately proposed retrofit work; no physical controller wiring or motor operation is implemented by this release.

## Reproducible evidence collection

Overview's checklist counts unique completed non-imported live sessions with matching identity, measured foreground capture duration, and observed service metadata. It separately tracks manual/background stops and notification properties. Counts remain candidates for owner review and never set a hardware-verified flag.

Next hardware input: a metadata-only session from the exact Elmo. Verify the reported service/endpoints, collect repeated captures, and review the gaps in [the original BLE experiment](../experiments/001-elmo-l2l/live-experiment.md). The software and native app builds alone cannot supply that evidence.
