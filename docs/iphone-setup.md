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
