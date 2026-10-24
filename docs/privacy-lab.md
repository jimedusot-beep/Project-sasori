# Phone Privacy Lab

Open [Privacy Lab](https://jimedusot-beep.github.io/Project-sasori/privacy.html) from the device hub or laboratory. It uses the phone alone. It does not certify a room or identify a hidden camera, microphone or offline recorder.

## Optical experiment

1. Open the HTTPS site directly in your phone browser and press **Start camera**. Grant camera permission. No microphone is requested. Nothing captures automatically on page load.
2. Use view magnification to inspect details. It changes the displayed view, not the whole-frame measurement. A live session lasts at most two minutes, including time waiting for permission.
3. Torch and exposure compensation enable only if the active camera reports those controls. They may be unavailable on iPhone browsers. Exposure compensation does not lock automatic exposure. There is no automatic flashing.
4. Hold the phone steady and **Capture A**, change lighting deliberately, then **Capture B & compare**. The tool downsamples each frame to at most 320×240 and compares a 16×12 grid of mean luminance values. A new camera session requires a new A.
5. Blue cells changed by at least 20 brightness levels. Orange cells increased by at least 20 and reached at least 235/255. Those thresholds explain the visualization; they are not calibrated lens-detection criteria. Camera movement, auto-exposure and ordinary reflections can produce the same changes.
6. Stop the camera before putting the phone away. Stop, a track ending, a deadline or page hiding closes camera tracks. Late permission grants are closed after cancellation. Captured data remains in page memory for deliberate saving; reloading clears unsaved images.

**Try synthetic example** compares a generated bright square with a dark frame. It requests no camera. Its observations remain synthetic in storage and exports.

## Native Bluetooth survey

Install/build the updated [native iPhone app](../native/ios/README.md), then open Privacy Lab from its laboratory. The hosted website clearly reports that native advertisement surveying is unavailable; a Web Bluetooth chooser is not a room survey.

Press **Start native survey** to request Bluetooth access. The native plugin scans advertisements only: it has no peripheral connection, GATT read, authentication or command-write method. It stops after 30 seconds, 60 observed devices or 2,000 accepted observations. Backgrounding, Stop and unavailable Bluetooth also end it. JavaScript has an additional 35-second deadline and polls only during a manually started session.

Each device receives a fresh `signal-N` alias per session. Latest/minimum/maximum RSSI, sample counts and up to 12 time-spaced history samples are observations. They are not distance, room boundaries or proof of a camera. Signals may come from adjacent rooms, change with body position or disappear between advertisements. Aliases in separate records cannot be matched as if they were persistent identities. A synthetic survey example works without native support.

The Swift plugin keeps peripheral identifiers private. Raw manufacturer bytes are never exposed. Native simulator compilation and browser fake-plugin tests do not establish real-radio behavior.

The native deadline uses monotonic uptime checks before starting a scan, accepting an advertisement and returning a poll, plus a timer in common run-loop modes. OS scheduling can delay teardown; a delayed final duration is not hidden by clamping it to 30 seconds. The JavaScript facade rejects malformed or excessively late reports. Tracking-mode and real-radio deadline checks still require the owner trial below.

## Local evidence and export

- Enter a label (80 characters) and note (2,000 characters), then save an optical observation/note or stopped survey. Measurements and source class are explicit; independent hardware verification remains false.
- Photos are omitted by default. **Keep the current photo on this browser** explicitly retains a downsampled JPEG, limited to 200,000 characters. The choice resets after saving. Check images for private details.
- The dedicated IndexedDB notebook stores at most 30 records and 5 MB. Its atomic capacity check preserves existing records on failure and competing saves. It does not alter Sasori research, device or routine stores. Unavailable storage produces an error rather than silently claiming a save.
- **Export notes & measurements** omits photos. **Export including retained photos** is a separate deliberate action. Radio identifiers, advertised names, services and backend error strings do not enter portable observations. Your free-text notes can still contain identifiers: review them before sharing.
- Deletion requires two clicks. Exports have no executable commands and are not imported as evidence or hardware authority. No cloud upload, analytics, location request or network scan is implemented. Browser storage is origin-specific and can be evicted; back up important records.

## Research and physical acceptance

Original implementation, informed by [Haven's event-driven observation](https://github.com/guardianproject/haven), [phyphox's phone experiments](https://phyphox.org/), [Lumos's radio fingerprinting research and access restrictions](https://www.usenix.org/system/files/sec22-sharma-rahul.pdf), and [LAPD's specific ToF optical technique](https://github.com/frizensami/lapd). No upstream code or models copied. Ordinary RGB frame differences are not a reproduction of LAPD. [USENIX detector research](https://www.usenix.org/publications/loginonline/sneaky-spy-devices-and-defective-detectors) documents why weak signals should not be presented as a detector verdict.

Owner checks remain **NOT PERFORMED**:

1. Record exact phone/OS/browser or native build. Confirm rear camera selection and actual torch/exposure availability. Verify permission rejection, Stop, backgrounding, track interruption and deadline on that phone.
2. Compare known camera lenses with screws, glass, glossy plastic and ordinary LEDs under repeatable lighting, angles and distances. Record false alarms and missed targets. Run blinded repetitions; do not infer detection accuracy from generated pixels.
3. With known owned BLE devices, check advertisement reception, permission/power changes, Stop/background teardown and the sampling deadline. Repeat with a device outside the room. Do not infer a transmitter is in the room from RSSI.
4. Save/reload/export/delete an observation and verify that default export omits its photo. Do not modify smoke alarms, electrical outlets or other safety equipment for these experiments.

Automated checks cover hand-derived image differences, malformed frames, camera cancellation/deadlines, private persistence/capacity and native-facade cancellation. Browser tests cover the integrated page, downloads, permission failures, synthetic provenance and accessibility. They do not demonstrate hidden-device detection or actual iPhone camera/radio acceptance.
