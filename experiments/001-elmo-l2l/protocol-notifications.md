# Historical Notification Observations, NOT a Command Catalog

Captured from user-supplied Bluefy V4 inspection, 2026-10-20. These were incoming notifications (RX), not packets Sasori should transmit.

| Raw notification hex | Text after removing initial byte and terminal null | Meaning |
|---|---|---|
| 604e65774d6f64654964783a313200 | NewModeIdx:12 | Visible textual pattern; unknown state semantics |
| 6153746172743a4c6f77506f776572536c656570 | Start:LowPowerSleep | Visible textual pattern; unknown relation to official Lullaby |
| 6100 | Empty after prefix and null | Unknown |

Important: 0x60 and 0x61 are byte observations, not established opcode assignments. Data may also contain non-ASCII in other packets. Preserve full hex alongside attempted decoding; never automatically construct BLE writes from this file.

Interpretations to test offline:
1. First byte acts as message category (hypothesis only).
2. Trailing 0x00 is a terminator for selected text notifications (hypothesis; not necessarily protocol-wide).
3. Text starts at byte 1 for these three examples only; other packet families may differ.

Rejected inference: neither RX message proves authenticated motor/audio control.
