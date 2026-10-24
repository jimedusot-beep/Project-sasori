# Device hub: phone directions and supported actions

Open the [Sasori Device hub](https://jimedusot-beep.github.io/Project-sasori/hub.html). It combines remembered device setups, supported controls and saved routines. The laboratory and original Elmo remote remain available from the header.

## Start without hardware

1. Open the hub in your phone browser.
2. Choose **Love2Learn Elmo**, **Bluetooth gadget**, **Original WowWee MiP** or **TV & universal remote**.
3. Tap **Try offline demo**. The DEMO banner means all replies are synthetic. No real radio, local companion or physical device is used.
4. Try the controls. For Elmo, change volume, choose a catalog sound or simulate a nose press. For TV, try the directional pad and volume buttons.
5. Tap **Stop & disconnect**. **Save connection result** downloads a JSON receipt. Demo receipts remain synthetic and cannot establish hardware compatibility.

## Connect your Elmo

1. On iPhone/iPad, open the HTTPS hub link directly in **Bluefy**. On a Bluetooth-equipped computer or Android device, use a browser providing Web Bluetooth. Ordinary iPhone Safari does not expose the required Bluetooth chooser. The hub reports what its current browser provides.
2. Switch on your Love2Learn Elmo B6572, keep it nearby and close any other app connected to it. Select **Love2Learn Elmo**.
3. Give the setup a name, such as “Living room Elmo.” Keep the `Elmo` name filter, or explicitly select **Show all Bluetooth devices** if needed.
4. Enter the toy's existing password exactly. For a new or factory-reset toy, enter a new password and explicitly select **Set this password if Elmo reports none**. Sasori sends setup only after the exact unset report. A rejected existing password cannot be overwritten. If you forgot it, expand **I don’t know Elmo’s password** and follow the [manufacturer-linked recovery directions](elmo-password-recovery.md). Physical reset erases personalization.
5. Choose **Control session** for up to ten minutes of foreground use, or **Quick check** for the earlier 30-second, one-sound check. Tap **Connect device** and choose your toy. Wait for **Toy reported acceptance**. Sasori requests volume and touch state; absent replies stay unknown. Passwords clear from the field and are never saved.
6. First choose **Greeting → Play sound** and listen to the actual toy. The catalog now has twenty reviewed sound IDs, including welcomes, clap/music prompts, a dog imitation and laughter variations. Quick pads expose common choices. Control sessions permit up to sixty sound requests, four seconds apart; Quick check permits one. The gap does not establish that a sound has finished, and a later request may interrupt playback. These numeric IDs are source-backed; sounds, language and behavior on your unit still need observation.
7. Optionally choose a whole-number volume from **1–15** and tap **Apply volume**. Control sessions permit up to sixty explicit changes; Quick check permits four. “Last requested” and “Reported volume” are separate: a read-back is not an acknowledgment that the preceding write took effect. Touch indicators reflect reported input bits while connected.
8. Record **Did the physical device respond?**, tap **Stop & disconnect**, then **Save connection result**. Control sessions are bounded to ten minutes and Quick check to 30 seconds. Disconnect cannot guarantee that an already-requested sound stops. After password setup, reconnect with setup unchecked and your new password to check retention.

No real Elmo was available for this release. Authentication, password retention, touch events, volume and sound effects remain unverified on your unit. The native iPhone Core Bluetooth facade remains inspection-only for Elmo; use the hosted hub in a compatible Bluetooth browser for these controls.

## Reconnect without rebuilding the setup

Live connection attempts automatically save the label, family, name filter, private device binding and latest fixed result. **Save setup** also saves configuration before connecting. Select it from **Saved setup** next time. Where the browser implements `Bluetooth.getDevices()`, Sasori restores an already-granted device reference before your next manual Connect. Otherwise the chooser opens again. Device names and grants do not establish model identity.

Enter Elmo's password again each time. Nothing connects, authenticates or runs automatically on page load. **Choose another device next time** makes the next Connect open the chooser. Saved standard BLE/MiP setups from the earlier universal-controls workspace migrate once, without deleting their original records. The laboratory's inspection profiles remain separate.

Failure cards explain the next useful action: missing Bluetooth, cancelled chooser, rejected password, missing channels, expired connection, lost radio, companion pairing or unavailable TV control. A failed attempt keeps the setup. Keep the page visible and phone unlocked; hiding it stops the current connection and routine.

## Save and run a routine

1. Select a device family and expand **Create or edit a routine**.
2. For Elmo, choose a **Ready-made performance**: Touch → hello, Little comedy routine or Clap and music. Tap **Load starter routine**, or choose a step and tap **Add step**. The Elmo starter waits for a new nose press then requests the greeting. The TV starter requests volume down, waits half a second, then requests it again. Standard BLE/MiP starters read identity and status.
3. Name it and tap **Save routine**. Reopening a saved routine loads its steps for editing. Use **Clear steps** to replace them or **Remove saved routine** to delete that routine.
4. Connect a matching device or its demo, choose the saved routine, then tap **Run routine**. Saving, importing and reconnecting never start it. Actions unavailable on that connected adapter stop the routine with a clear result.
5. For an Elmo touch step, release the chosen input and press it while the routine waits. A previously active input is not enough; Sasori requires a new reported release → press. The touch wait lasts up to ten seconds. This is one trigger during the foreground session, not a permanent background automation.
6. Tap **Cancel** or **Stop & disconnect** to cancel pending steps and disconnect. Commands already sent may continue. **Save routine result** records completion/cancellation/failure and synthetic/live provenance, without device IDs or authentication material.

Limits are 32 steps, two minutes runtime, 90 seconds of configured waits, twelve sound requests, four touch waits and twelve volume changes. Sound actions automatically wait for the control-session request gap. The active connection can have lower remaining time or action limits. A routine is tied to one active connection and never crosses into a replacement connection. It cannot contain imported JavaScript, arbitrary packet bytes or firmware operations.

## Arm live touch reactions

In a Control session, expand **Live touch reactions**. Choose an input and sound, then **Add / replace mapping**, or choose **Use playful mappings** for nose → giggle, left hand → greeting and clap → clap sound. **Save mappings with setup** preserves configuration; saving and reloading never arm it.

Tap **Arm touch reactions**. A new reported release → press can trigger the mapped sound repeatedly during this foreground session. Presses during another action or the four-second gap are counted as skipped and never queued for later playback. Up to seven mapped inputs and sixty triggers are allowed. Manual actions and performances pause while reactions are armed. **Disarm** stops new reactions; **Stop & disconnect**, page hiding, time limits and lost/replaced connections also stop them. An already-sent sound can continue.

In the demo, choose a **Demo touch input** and **Simulate … press** to test mappings without hardware. The reaction result records sent/skipped/failed request counts and retains synthetic/live provenance. Software counters are not physical playback confirmation.

## Other devices and TV remotes

| Family                           | Available controls                                                            | What must match                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Standard Bluetooth gadget        | Available identity and battery reads; mild Find alert when exposed            | Bluetooth SIG Device Information, Battery or Immediate Alert services |
| Original WowWee MiP              | Manufacturer version/status queries and a bounded blue chest-light pulse      | Original MiP GATT channels and command format                         |
| Roku local network               | Directional pad, Home/Back, playback; reported TV-volume/power-off capability | Local Roku ECP device and enabled remote-control setting              |
| Home Assistant media player      | Reported volume, mute, playback and power capabilities                        | An already-configured `media_player` integration                      |
| Home Assistant learned IR remote | Named learned buttons using the same remote layout                            | A compatible configured IR hub and learned original-remote signals    |

TV controls require the [local TV companion](tv-remote.md), which serves this same hub to your phone. An ordinary phone web page cannot emit infrared. An IR hub lets you reuse the buttons for a TV, projector, stereo or another small device with a matching IR remote. Only adapter-supported buttons enable; this is shared control vocabulary, not universal authentication or automatic model support.

## Backups, observations and privacy

The hub stores up to 20 setups and 20 routines in a separate 64 KB record in the existing IndexedDB database. It does not erase laboratory captures, notes or trials. Storage warnings explain when saves are unavailable. Storage conflicts preserve existing records rather than silently overwriting another tab's update.

**Export hub backup** saves labels, family settings, filters and routine steps. It omits Bluetooth platform IDs, companion addresses, TV addresses/entity bindings and last connection results. Review your own labels before sharing. Import validates the entire file before saving, gives records fresh IDs and never performs an action. Re-select or re-enter private bindings after import.

Connection/routine receipts use fixed result fields, with owner observations separate from independent verification. Hardware, authentication and physical-effect verification flags remain false. Credentials, tokens, raw packets and backend error text are not exported. Phone/browser storage is origin-specific; hosted Sasori and a computer's local companion are separate origins and have separate saves.

Implementation and evidence: [recovered Elmo methods](../experiments/001-elmo-l2l/recovered-source.md), [TV protocol sources](tv-remote.md#sources-and-implementation), [testing](testing.md) and [real-device acceptance](device-action-validation.md).

For wider civilian-maker research and the proposed lower-cost phone-to-IR path, see the [resourceful-making research record](research/resourceful-maker-research-2026-10-24.md). The [experimental Pocket Remote](pocket-ir-pilot.md) now implements the phone-to-ESP32 IR path with saved named profiles and a demo. It includes an attributed firmware/build kit; physical hardware support remains unverified.
