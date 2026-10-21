# iPhone setup

1. Install/open Bluefy from its official App Store listing linked by [PNN Soft](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices). Do not assume normal Safari exposes Web Bluetooth.
2. Open the published HTTPS Sasori URL. First try Use simulation → Run simulated inspection. A synthetic session should finish and appear in Research records.
3. For physical testing, use your own intact Elmo, keep moving parts clear, enable Bluetooth, and close any competing Elmo/nRF connection.
4. Turn simulation off. Tap Use published Elmo UUIDs and review the community source. The settings are candidates, not yet validated for your unit.
5. Confirm authorization and tap Connect & inspect. Choose Elmo L2L. If the name-filtered chooser cannot see it, deliberately select Show all Bluetooth devices and retry; choose only your own toy. Keep Bluefy in the foreground and the phone unlocked.
6. Wait for the 15-second inspection deadline or tap Stop. Check the exact disconnect reason, service map, and counts.
7. Add a session name and observations. Finished sessions save automatically; use Export backup regularly.

Notification subscription does not authenticate Elmo. No movement or voice commands are available. If the candidate profile does not exist, use the [read-only UUID guide](../experiments/001-elmo-l2l/iphone-uuid-capture-guide.md). Do not reset or flash the toy.

Bluefy version, iOS version, firmware, and radio conditions affect behavior. A WebKit emulation test does not reproduce Bluefy's native Bluetooth bridge. Physical validation is an outstanding milestone.

## Guided Elmo probe sequence (experimental)

Do not change several variables in a single experiment. Each session requires a fresh manual tap
and permission; the app **never** cycles channels or sends physical commands.

1. **Metadata first:** choose **Metadata only (no subscription)**, load the published service UUID, then connect once. Check whether the service and the reported characteristics appear. This is the lowest-impact attempt.
2. **Data notifications:** choose **Data notifications (candidate)** and inspect for 15 seconds. This is the community-reported `dab91382...` endpoint. Note whether you get the notification-subscription stage or a specific error. No notification is not proof that authentication failed.
3. **Control notifications:** only after the service map confirms the matching notify property, explicitly choose **Control notifications (candidate)** and inspect in a separate session. This choice subscribes to a notification endpoint; it does not send control commands.
4. **P2P notifications:** optionally repeat on the community-reported peer-to-peer notify endpoint, again only if its property is present. Do not guess what P2P messages mean.
5. **Repeat:** run the same successful channel five times under similar conditions. Export and privately retain the metadata backups, logs, firmware/OS/app versions, and observed byte counts. Raw bytes are omitted from ordinary backups unless specifically opted into; review any raw export before sharing.

Sasori now displays a **connection stage** and total elapsed milliseconds: device-chooser,
gatt-connection, service-discovery, characteristic-discovery, notification-subscription,
inspection-ready, and teardown. On error, the diagnostic event includes the failed stage.
Use this to distinguish a permissions/chooser problem from a firmware/UUID mismatch.

Do not interpret a successful subscription as authentication. The documented UUIDs are independent community observations, not validated firmware compatibility. Each live subscription can update a GATT CCCD, although Sasori makes no application-level characteristic writes.

### If the probe fails

- **device-chooser:** verify Elmo is on and advertising, then try Show all Bluetooth devices once.
- **gatt-connection:** close competing apps and check range and battery condition.
- **service-discovery:** record the exact failing UUID and compare with a read-only nRF Connect service inventory.
- **characteristic-discovery:** inspect its properties; do not invent a notify endpoint.
- **notification-subscription:** confirm the chosen characteristic has `notify` or `indicate` and retry manually only after checking.
- **inspection-ready with zero packets:** the BLE setup worked but traffic was silent. Mark inconclusive, not authenticated.

Stop if Elmo behaves unexpectedly, gets hot, or produces unusual mechanical noise.
