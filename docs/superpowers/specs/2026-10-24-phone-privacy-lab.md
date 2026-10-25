# Phone-only Privacy Lab

Execution authorized by the owner's “Continue. Implement. Evolve. Improve.” following the phone-only research proposal. Extend Sasori; no companion hardware or purchase is required.

## Design

Use a dedicated `privacy.html` reachable from the device hub and laboratory. Browser camera tools work in a supported secure context. A separate native Core Bluetooth plugin performs a foreground, advertisement-only survey; the website reports that feature unavailable when the plugin is absent. Existing device-control adapters remain separate.

Approaches considered: a checklist alone provides little measurement; browser-only radio discovery cannot deliver a full advertisement survey; the selected approach combines browser optical measurements with native iPhone BLE measurements in the same local interface. No network sniffing, camera authentication bypass or general RF claim is made.

Camera access requires a deliberate button. A generation token closes late streams after cancellation. Stop, page hiding, track termination and a 120-second deadline end capture. No microphone is requested. Zoom is a view aid. Torch and exposure controls are exposed only when actually reported, never assumed. Two downsampled frames (maximum 320×240) can be compared as a 16×12 brightness grid: absolute mean change and bright cells are measurements, not a lens classifier. No automatic flashing. Movement, scene changes and auto-exposure can invalidate a comparison.

The native survey reads BLE advertisements only, for at most 30 seconds, at most 60 devices and 2,000 accepted observations. It has no connection/read/write methods. Per-session aliases replace peripheral identifiers. RSSI, sample count, observed services and elapsed times support repeated comparisons, not distance or room localization. Stop/background/power/permission transitions end scanning. Polling never starts a scan. Raw manufacturer bytes and platform IDs never reach JavaScript.

Keep up to 30 local notebook observations, total 5 MB, in a dedicated IndexedDB database. Notes and scalar measurements save by deliberate action; optional bounded JPEG evidence requires a separate explicit checkbox. Exports omit photos by default, with a separate explicit photo export. BLE exports omit advertised names, service UUIDs and device identifiers. No imports or automatic cloud upload. Failures must be visible, with no silent persistence claim.

Demo data is explicitly synthetic and cannot become a live observation. No scan yields “room safe,” “camera found” or a confidence percentage. Physical camera detection, iPhone camera behavior and actual BLE radio behavior remain unverified until owner trials.

## Acceptance and evidence

Test frame comparisons against hand-built dark/bright/changed grids and reject mismatched dimensions. Test camera permission rejection, late permission resolution, track termination, deadline and repeated Stop. Test notebook capacity, atomic concurrent saves, persistent reload, default photo omission and synthetic provenance. Test native-facade late results, session cancellation and no automatic start. Browser tests cover the actual UI, export, rendering hostile notes as text, permission failures, responsive layout and accessibility. Native CI compiles and launches the bridge; it cannot prove real scanning.

Research provenance: [Haven](https://github.com/guardianproject/haven) informs event-based observation; [phyphox](https://phyphox.org/) informs measured experiments; [Lumos](https://www.usenix.org/system/files/sec22-sharma-rahul.pdf) documents radio-access restrictions; [LAPD](https://github.com/frizensami/lapd) uses specific ToF hardware and does not establish an ordinary browser camera detector. Original code only; no upstream code, models, binaries or images copied.
