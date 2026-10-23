# Protocol recorder and adapter catalog

Open **Protocol recorder** in [Sasori](https://jimedusot-beep.github.io/Project-sasori/#recorder). The page imports normalized bidirectional frames, preserves their declared source, adds timestamped observations, and compares repeat captures. The source cards cite all eight [adapter inspirations](research/adapter-inspirations.md), inspected revisions, reuse decisions, and implementation paths.

## Try it

1. Select **Try synthetic MiP example**. The request is a manufacturer-documented raw byte; the response contains ASCII characters representing hex. Its timing is synthetic, not measured hardware performance.
2. Inspect the separate TX/RX rows and the decoder's version fields. **Inspect documented MiP query bytes** shows an offline command definition; it never transmits.
3. Add an observation marker at a capture-relative time, such as `85` ms / `Normal play button pressed`. Markers label your observations, not command meaning.
4. Select TX and RX frames and measure their interval. The result is explicitly a user-selected elapsed time, not a verified acknowledgment or round-trip metric.
5. Select a trace as A, import another trace of the same declared model/firmware/transport, select B, and compare. Rows align by index, not message sequence. The result reports byte offsets, direction/endpoint changes, and timing differences. Different-length frames and added/removed rows remain visible.
6. Save to **Research records** or export JSON. Raw bytes are omitted by default; explicit raw retention applies to that save/export only. Loading another trace resets the checkbox. Metadata-only traces preserve timing, direction, endpoints, lengths, labels, and markers but cannot be decoded or compared at byte level.

## Import format

JSON uses [sasori.trace v1](../schemas/trace-v1.schema.json). The [synthetic fixture](../experiments/protocol-traces/mip-software-version.synthetic.json) is a complete public example. A session-v2 JSON containing `protocolTrace` can also be opened. Import only parses data; it never evaluates code or sends captured bytes.

Normalized CSV has this exact header, with capture-relative milliseconds and TX/RX as viewed from the app/controller:

```csv
time_ms,direction,endpoint,hex
0,tx,0000ffe9-0000-1000-8000-00805f9b34fb,14
85,rx,0000ffe4-0000-1000-8000-00805f9b34fb,31 34 30 45 30 32 31 42 30 37
```

For CSV, expand **CSV capture identity** and record the exact model, firmware or `unknown`, transport, source class, app version, capture method, and before/after state. JSON embeds its own identity; editing CSV identity fields does not rewrite an already imported JSON trace. Standard CSV quotes, escaped quotes, CRLF, and quoted commas are parsed, but endpoint values must remain simple UUID/handle/channel names. Missing metadata, malformed rows, mismatched byte counts, reversed timestamps, oversized input, and invalid directions reject the entire import.

`handle:0x0012` is an accepted offline endpoint if a capture only exposes ATT handles. Handles are not UUIDs: the MiP decoder requires the documented full characteristic UUIDs, so resolve a handle through the matching service-discovery evidence before assigning that interpretation. No handle mapping is guessed.

Limits: 512 KiB input, 256 frames, 1,024 bytes per frame, 40 KiB retained raw bytes, 100 markers, and 24 hours of capture-relative timestamps. Frames preserve capture boundaries; this implementation does not reassemble application messages across BLE notifications. Split larger recordings explicitly; no successful partial import is reported. Truncated current-session packets are refused for byte-level handoff.

## Obtaining a real app exchange

The browser and native inspection transport capture their own notification stream. **Copy current Sasori RX capture** creates RX-only trace data, retaining the synthetic/owner-observed source class without inventing TX or an authentication result.

For an original app-to-toy conversation, use an owner-controlled capture method such as [Android Bluetooth HCI logging](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging). Extraction/access varies by phone and Android version. Extract ATT characteristic values with their timestamps, directions, and matching endpoint mapping using an appropriate offline analyzer, then normalize them to the CSV/JSON format above. Binary btsnoop, PCAP, and PCAPNG parsing, radio sniffing, automatic decryption, automatic handle resolution, and live replay are not implemented by this release. Ordinary byte import does not reconstruct a missing authentication algorithm.

## Storage and private data

Traces use the existing IndexedDB v4 records store through optional `protocolTrace` in session v2; there is no database-version change. Saved traces share the 50-record / 8 MiB notebook and 250 KB per-record limits. Existing session notes, revisions, migration, recovery, exports, and native file sharing keep their normal behavior. Research records can delete traces; notebook backups always omit raw trace bytes, even when a particular saved trace includes them. A backup therefore cannot restore raw frames that it intentionally omitted.

Raw exchanges may contain credentials, challenges, responses, or other private bytes. Text redaction does not make binary captures public-safe. Keep real captures outside the repository; the included fixture is synthetic and uses only published non-secret MiP example bytes.

## Adapter contract implemented here

`site/lib/adapters.js` provides a built-in, immutable registry with versioned declarative manifests: exact declared model aliases, transports, decoder identifier, source references, inspection capabilities, command availability, and recovery description. It separates original packet interpretation from raw ingestion and UI. No external executable adapter installation or live-action flag is accepted.

- **Elmo:** existing service inspection and notifications, historical text observation, and an unavailable status query with its missing protocol prerequisites. No authentication bytes are constructed.
- **MiP:** original offline software-version query definition and strict ASCII-hex version-reply decoder. The codec follows the manufacturer example, not a hardware test. No movement, sound, UART, firmware, or live MiP sender is implemented.
- **Generic:** bounded timeline, markers, selected intervals, and same-index comparisons without assigning protocol meaning.

Readiness checks distinguish declared model/firmware and TX/RX presence from independently tested authentication and physical recovery. The latter remain false. Pybricks informs the supported-model/recovery workflow; its firmware is not installed on Elmo. Hacksby and PixMob source cards connect to existing WAV and IR timing analysis; they do not claim implemented Furby/PixMob control.

Before enabling one Elmo action, establish exact source-derived framing/authentication vectors, correlate a status request/response, and run real acceptance tests. The target is ten fresh successful connections/actions with explicit rejection, timeout, disconnect, and recovery results. The [original-BLE source gaps](../experiments/001-elmo-l2l/source-verification.md) and replacement-controller path remain explicit.
