# iPhone setup

For a button-based experimental Elmo control trial, open [Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html) in Bluefy and follow [its short guide](elmo-remote.md). The inspection procedure below remains separate; native Elmo writes and actual hardware validation are still unavailable.

1. Install/open Bluefy from its official App Store listing linked by [PNN Soft](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices). Do not assume normal Safari exposes Web Bluetooth.
2. Open the published HTTPS Sasori URL. First try Use simulation → Run simulated inspection. A synthetic session should finish and appear in Research records.
3. For physical testing, use your own intact Elmo, keep moving parts clear, enable Bluetooth, and close any competing Elmo/nRF connection.
4. Tap **Love2Learn Elmo** in quick setup. This selects the published service and **Find connection details**, without notifications. The settings are candidates, not yet validated for your unit.
5. Confirm authorization and tap Connect & inspect. Choose Elmo L2L. If the name-filtered chooser cannot see it, deliberately select Show all Bluetooth devices and retry; choose only your own toy. Keep Bluefy in the foreground and the phone unlocked.
6. Wait for the 15-second inspection deadline or tap Stop. Check the exact disconnect reason, service map, and counts.
7. Add a session name and observations. Finished sessions save automatically; use Export backup regularly.

Notification subscription does not authenticate Elmo. This inspection workflow sends no movement or voice commands. If the candidate profile does not exist, use the [read-only UUID guide](../experiments/001-elmo-l2l/iphone-uuid-capture-guide.md). Do not reset or flash the toy.

Bluefy version, iOS version, firmware, and radio conditions affect behavior. A WebKit emulation test does not reproduce Bluefy's native Bluetooth bridge. Physical validation is an outstanding milestone.

## First two live captures

Start with these two sessions. The current app already supports both; no additional equipment or software changes are required. Use the existing power switch and original power arrangement, with the mechanism secured. Do not open, reset, or reflash the toy for this experiment.

1. In Bluefy, open [the live laboratory](https://jimedusot-beep.github.io/Project-sasori/) and tap the **Love2Learn Elmo** quick setup.
2. Keep **Find connection details** selected. Notifications remain blank. The advanced **Use published Elmo UUIDs** button is under **Capture notifications** and intentionally selects the data channel; it is not needed for this metadata attempt.
3. Confirm ownership, tap **Connect & inspect**, and select your Elmo. Keep Bluefy visible for the 15-second inspection. Zero received packets are expected in this metadata-only session.
4. When the session ends, change **Session name** to `E001-01-metadata`, tap **Save session**, and use **Export JSON**. In **Protocol explorer**, check the observed service map for the data endpoint `dab91382-b5a1-e29c-b041-bcd562613bdf` and a `notify` or `indicate` property. A write property by itself is insufficient.
5. If the metadata session confirms that endpoint and property, tap **Capture from Data notifications** in the result card, confirm ownership again, and make a separate manual inspection. Name the finished session `E001-02-data`, save, and export it. A quiet capture remains inconclusive; do not start guessed writes to make it respond.

Use **Copy log** and capture the observed service map if an export is inconvenient. The site cannot connect to your toy from someone else's browser or computer; the live connection must run on your nearby phone.

### What to retain

For each saved session, use **Research records** to add the following to its notes. The title and notes matter: ordinary exports intentionally drop generic event details and omit raw packet contents, so they cannot be relied on to preserve the selected probe or decode its bytes later.

```text
Session: E001-01-metadata OR E001-02-data
Date/time and time zone:
iOS version:
Bluefy version:
Toy model/firmware: known value OR unknown; do not reset to identify it
Sasori page refreshed on:
Service UUID: dab91435-b5a1-e29c-b041-bcd562613bdf
Notify UUID: none OR dab91382-b5a1-e29c-b041-bcd562613bdf
Observed endpoint properties:
Final stage, disconnect reason, and any failed stage:
Received packet count and byte count:
Toy activity and any ordinary touch/power actions during the session:
Conclusion: metadata observed / notifications received / silent / failed at [stage]
```

An inspection may end with the `teardown` stage even after success; retain the preceding `inspection-ready` stage or the error's failed stage as well. For the first review, share the two metadata exports or copied logs and observed service properties. Leave unknown fields explicitly unknown.

If byte-level analysis is needed, enable engineering mode **after the live capture**, then deliberately select **Include raw payloads when saving/exporting this session** and use **Export JSON** before leaving or reloading the page. Review that file privately before sharing: raw bytes can contain secrets that a text redactor will miss. Ordinary **Export backup** remains metadata-only even when a session has raw bytes. There is no need to share a password for the first review.

## Guided Elmo probe sequence (experimental)

Do not change several variables in a single experiment. Each session requires a fresh manual tap
and permission; the app **never** cycles channels or sends physical commands.

1. **Metadata first:** tap the **Love2Learn Elmo** quick setup and keep **Find connection details** selected, then connect once. Check whether the service and the reported characteristics appear.
2. **Data notifications:** choose **Capture notifications**, then **Data notifications (candidate)** and inspect for 15 seconds. This is the community-reported `dab91382...` endpoint. Note whether you get the notification-subscription stage or a specific error. No notification is not proof that authentication failed.
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
