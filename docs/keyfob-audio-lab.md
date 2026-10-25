# Phone-only key-fob acoustic experiment

Open **[Key-Fob Audio Lab](../site/keyfob-lab.html)** from Sasori in Safari on iPhone or a current HTTPS browser. No extra radio hardware is needed. This is a **microphone** experiment, not a 433 MHz protocol reader, decoder, replay tool, or means of controlling a vehicle.

## What we can and cannot learn

- **Can learn:** whether an old remote's mechanical click is audible to the phone, how often the app misses it, and whether ordinary taps falsely trigger detection.
- **Cannot learn:** whether the 433 MHz transmitter works, what lock/unlock data it sends, whether codes are fixed or rolling, or whether a car recognizes it. Ordinary phones do not expose an arbitrary 433 MHz transmit/receive radio.
- The observed "ClapSplash worked" result demonstrates a _sound-correlated reaction_, not RF capture.
- No audio is saved, uploaded, or sent to a server. The microphone is used only while the page is foregrounded and the user starts it. The app keeps an in-memory measurement table until reload/close, with optional manual JSON/CSV export.

## Repeatable protocol

1. Open the Sasori lab on your phone using HTTPS. Press **Start microphone + calibrate**, accept access and stay silent for 2.4 seconds. Set **Normal** sensitivity first.
2. Put the fob about a hand's width from your phone. Keep the distance and room unchanged.
3. Choose **Unlock**. Tap **Run 1 trial**, wait for the 3-second countdown. Press the remote once only during **GO** (2 seconds). Repeat five times.
4. Repeat five trials for **Lock**.
5. Repeat five **Silence** trials without touching anything during GO. This measures background false alarms.
6. Repeat five **Tap table** trials without touching the remote. This measures whether your detector recognizes _ordinary_ nearby clicks as if they were remote button sounds.
7. Optionally wrap the fob in cloth and do the **Muffled press** test five times, holding distance constant. This is a rough control, not evidence of RF: cloth also changes the mechanical sound, and microphone processing varies by phone.
8. Read the condition-specific detection rates and verdict. Use **Export JSON evidence** or **Export CSV** to keep results before closing the tab. Trial histories intentionally do not store audio.

Every trial records one _declared_ condition, whether any sound exceeded threshold, approximate events during GO, background level, peak and threshold. There is no automatic way for the phone to verify that you truly pressed lock vs unlock; the labels are user-reported.

## How to interpret the result

- A promising **acoustic trigger** requires at least 5 trials each for lock, unlock, silence and tap; at least 80% detected on each fob button and no more than 20% detected during either negative control. It must be repeated in a different room before any automation.
- If table taps also trigger, the software is hearing generic clicks. More fob presses cannot fix the false-positive problem. Avoid automating anything consequential from this detector.
- If the silence condition triggers, recalibrate with less noise, move the phone, or use Strict. Changing conditions requires a new comparable block of tests.
- The microphone can rarely distinguish lock from unlock by sound alone. A high detection rate for both **does not** mean it knows which command was pressed.
- Testing beside an active car is unnecessary. The prototype does not send RF commands or interact with any vehicle.

## Implementation and device limits

The analyzer uses Web Audio's `getUserMedia` and a high-pass filter followed by RMS/edge-threshold detection. Foreground JavaScript timers are not laboratory instruments; noise cancellation and auto-gain settings are requests rather than guarantees. The page suspends testing and closes the microphone when hidden. Some embedded browsers and native WebViews do not expose microphone permissions; use Safari over HTTPS if needed. A real physical phone acceptance test is still required.

The page does not attempt 433 MHz radio access and should not be presented as a successful RF attack. For proof of RF behavior, genuinely compatible radio measurement equipment would be required (outside the phone-only experiment's scope).
