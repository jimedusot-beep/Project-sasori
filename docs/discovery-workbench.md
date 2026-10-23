# Discovery workbench

Discovery is an offline workspace for observations from an exact owned toy model. It adds byte comparison, infrared mark/space timing comparison, and local PCM WAV inspection. It does not connect to a toy, replay a capture, authenticate, or change the inspection transport.

## Compare two captures

1. Open **Discovery workbench**. Enter the exact model and revision, or explicitly record that the revision is unknown.
2. Label the first capture. Select its method, evidence class, and source note. Record the normal action, initial state, date, receiver/analyzer settings, and source reference. Exclude credentials and unique identifiers.
3. Paste hex bytes or positive integer microseconds, then choose **Analyze capture**. Hex accepts compact pairs, whitespace, commas, colons, dashes, and optional per-byte 0x prefixes. Pulse input alternates mark and space, starting with a mark.
4. Choose **Use current as A**. Enter and analyze the second observation, then choose **Use current as B**.
5. Choose **Compare A and B**. Byte differences use zero-based offsets and hex values. Pulse differences use microseconds and an inclusive tolerance; the default is 100 µs. Added or removed values always count.

Comparisons require matching device model/revision text, method, and representation. Case and repeated whitespace are normalized for model comparison. There is no realignment: inserting a byte or pulse can shift subsequent offsets. Only the first 64 differences are displayed; counts include all differences. Similarity does not establish command semantics, compatibility, or authentication.

## Save and restore

**Save capture** saves a metadata summary by default. To compare a saved capture after reload, explicitly check **Keep raw byte / pulse values on this browser** before saving. The checkbox resets after saving. Raw bytes may contain private information that pattern-based sanitizers cannot identify.

Saved captures with raw values can be selected as A or B. Metadata-only captures cannot reconstruct source values. Keep original recordings and traces privately if needed. Deletion requires a second click and preserves BLE sessions and toy profiles.

Discovery has a separate IndexedDB store with 50 captures and a 2 MB budget. Version 4 adds this store without replacing existing sessions, settings, or toys. Validation and capacity checks share the write transaction, including competing browser tabs. When IndexedDB is unavailable, the UI explicitly reports temporary memory.

**Export discovery metadata** omits raw bytes, pulse timings, WAV audio, waveform samples, and spectrum samples, even when raw byte/pulse values were retained locally. It includes labels, model, method, source notes, evidence class, timestamps, retention policy, and summary numbers. Known credential patterns are redacted from free text, but review notes before sharing. Discovery, toy, and session backups are separate.

Imports accept a version-1 **sasori.discoveries** envelope, validate the entire batch before writing, allocate fresh IDs, and mark every item **IMPORTED CLAIM**. Existing evidence labels remain source claims and are never upgraded. Imports are inert; unsupported fields are discarded. JSON imports are limited to 1 MB.

## Inspect sound without playing it

Fill in the capture label, exact model, source note, and evidence class. Select **Sound & acoustic channels**, choose a local uncompressed PCM16 WAV, then select **Inspect WAV**. Supported files are mono/stereo at 8–192 kHz, at most 30 seconds and 10 MB. Other encodings and formats are rejected.

The first channel is analyzed even in stereo. Results include duration, sample rate, channel count, RMS amplitude, peak amplitude, clipped sample count, waveform envelope, and relative-power spectrum. The spectrum averages up to eight evenly spaced 2,048-sample Hann-windowed FFTs. It excludes DC when selecting the largest bin and reports the bin width. This is not a calibrated acoustic sound-level measurement. Silence reports zero dominant frequency.

Only a scalar summary is saved with **Save audio summary**. The WAV, waveform, and spectrum stay in memory. The page does not play the file, request the microphone, upload audio, or transmit a signal. Frequencies above half the sample rate cannot be observed; a spectral peak alone does not identify an acoustic protocol.

## Nine independent research routes

Expandable plans cover sound, infrared, accessory connectors, BLE/content channels, internal UART/SPI/I²C, companion apps, other RF, offline firmware models, and peripherals/sensors. Each specifies a question, capture method, and limits. They do not assert that an interface exists on Elmo or another device.

Record source-backed electrical levels and pin identity before hardware connections outside the existing Bluetooth inspection workflow. Original Elmo authentication, audio, motion, and physical limits remain unverified. Physical adapters and commands require their own implementation and evidence; no Discovery record can unlock them.

## Verification scope

Synthetic tests exercise parsing limits, unequal capture lengths, pulse tolerances, model/method separation, metadata redaction, atomic imports, competing tabs, version-3 upgrades, WAV framing/encoding failures, a known 1 kHz sine, silence, clipping, and stereo layout. Browser tests cover persistence, comparison, export/import, inert markup, audio inspection, and absence of Bluetooth calls. Accessibility/viewport checks include Discovery on desktop Chromium and iPhone WebKit.

These checks establish software behavior. They do not establish physical Elmo compatibility, successful authentication, decoded commands, or a completed real-device milestone.
