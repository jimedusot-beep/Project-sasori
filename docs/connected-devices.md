# Devices and Bluetooth connections

Sasori has one foreground inspection connection at a time. **Devices** holds saved configuration; the **Overview** connection card shows the current live or simulated attempt. A saved profile, successful subscription, or imported file is not proof of authentication.

## Connect, capture, analyze, save

1. Open the HTTPS laboratory. Overview checks the available Bluetooth API without scanning or requesting device permission.
2. On an unsupported iPhone/iPad browser, the setup guide opens with the official Bluefy App Store link and a copyable Sasori address. Open that address inside Bluefy. A built native Sasori app supplies its own Bluetooth bridge.
3. Select the built-in Elmo profile or open Devices to save your own sourced settings. Record the exact model, board revision, and firmware; leave unknown values explicitly unknown.
4. Confirm ownership and tap **Connect & inspect**. The browser or native chooser asks you to select your nearby device. Name filtering is the default; Show all devices is an explicit fallback. No connection starts while loading, navigating, importing, or editing.
5. Keep the app in front during the 15-second capture. Use **Stop** to disconnect. Overview shows the actual attempt state; Protocol explorer shows the observed service map, notifications, and timing table.
6. **Analyze latest notification** copies the current profile's transient received bytes into Discovery with its identity, timestamp, endpoint, and provenance. This is offline analysis and does not enable raw storage automatically.
7. Finished sessions save locally. Research records supports notes, the last five previous title/note versions, metadata exports, and backup/import. Imported source claims remain marked as imported.

Notes can be edited during an inspection; incoming notifications preserve the pending edit. The note editor waits for each save before accepting the next edit. Stop an active inspection before deleting its record. Full notebook backups use compact JSON and support files up to 13 MB, including native sharing. The notebook remains limited to 50 records / 8 MB, with 250 KB per record; a larger file limit does not bypass those storage limits. Bounded local IDs/import timestamps are accounted for separately to preserve restore headroom; imported titles are preserved, and the imported-claim badge distinguishes copies.

For a first Elmo inspection, choose **Metadata only (no subscription)** in the probe selector. Confirm the service and notification properties before selecting a notification channel for a separate inspection. Detailed reproducible steps remain in [iPhone setup](iphone-setup.md).

## What the status means

- **Selecting:** waiting for your device choice.
- **Connecting / discovering:** opening the selected connection and inspecting its sourced service.
- **Inspecting:** metadata is available; the chosen notification channel, if any, is subscribed.
- **Disconnected:** no active inspection. Recent sessions and saved profiles remain available.
- **Simulation:** synthetic transport only; no real device connection.

The current connection name is transient. Unique device identifiers are not added to profiles or ordinary exports. Inspection snapshots store model/revision/firmware, adapter and transport identifiers, service/notify settings, requested duration, and measured GATT duration.

## Physical evidence checklist

Overview helps collect five foreground captures of at least 15 seconds, one manual stop, one page-background stop, and observed Notify/Indicate properties. Counts use unique non-imported live sessions with observed service metadata and matching model/revision/firmware. Older sessions without measured context are retained but cannot establish duration retroactively.

These are **capture candidates for owner review**, not an automatic hardware certification. A browser simulation, native bridge fixture, source label, imported capture, or CI build cannot establish real Elmo compatibility or authentication.

## Native and desktop access

- [Native iPhone app](../native/ios/README.md): shared UI, native device chooser, Core Bluetooth inspection, independent watchdog/background teardown, and native file sharing.
- [Desktop helper](../desktop/README.md): local Python/Bleak inspection with explicit device selection and private session export for import into Sasori.
- [Adapter contract](adapter-contract.md): exact device identity, capabilities, verification requirements, and why imported profiles cannot unlock commands.

Records remain local to the browser/app origin. The native app, Bluefy, and another browser have separate notebooks; use explicit backups/imports to transfer metadata. No cloud account or automatic synchronization is added.
