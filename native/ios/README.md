# Sasori for iPhone and iPad

This Capacitor app packages the shared Sasori interface with an original Swift Core Bluetooth plugin. It can choose a nearby BLE peripheral, inspect the configured service, capture notifications, disconnect, and share exported research files. The original inspection mode contains no command-write API. [Universal controls](../../docs/universal-controls.md) offers fixed standard BLE identity/battery/alert operations and a separately selected original WowWee MiP protocol family. MiP has two fixed queries and a dim-blue/off chest LED operation. There is no arbitrary characteristic-write, custom Elmo authentication, motor, audio-command, or firmware API.

## Build and install

Use Node 22+, a Mac with Xcode 26+, and an iPhone/iPad running iOS 16+. From the repository:

    cd native/ios
    npm ci
    npm run build
    npm run prepare:ios
    npm run open

In Xcode select the **App** target, set your bundle identifier/signing team, select your connected iPhone/iPad, and run. Signing and device provisioning belong to your Apple account. An unsigned simulator build is verified in GitHub Actions; that build cannot be installed as a signed iPhone app. Real Bluetooth behavior requires a physical device.

The build copies the site into a local bundle and adds a bundled Capacitor bootstrap. The generator creates a Swift Package Manager Xcode project, registers SasoriBluetoothPlugin through a custom bridge controller, adds its Swift sources, and supplies the Bluetooth and microphone permission descriptions. The microphone prompt is requested only after the user opens the phone-only Key-Fob Audio Lab and taps Start; no audio is saved or uploaded. Generation is repeatable; it does not overwrite an existing user's signing team.

Generated www, ios, build products, and dependencies are ignored by Git. Make application changes in the shared site or Sources; rerun build and prepare. Capacitor/core/ios/cli are pinned to 8.5.3. The project-generation tool's UUID dependency is overridden to the patched compatible 11.1.1 release.

## Runtime behavior

- Loading the app does not scan, connect, or request Bluetooth permission.
- Connect opens a five-second discovery window followed by an explicit device chooser, filtered by the selected profile's name prefix unless Show all devices was chosen.
- In inspection mode only the configured service is inspected. Subscription requires an observed Notify/Indicate property. Standard controls inspect only the fixed SIG Device Information, Battery and Immediate Alert services. The explicitly selected MiP family discovers only FFE0/FFE5, subscribes to FFE4, and sends the four reviewed frames through FFE9 using the semantic `mipCommand` bridge method. Available channels are rediscovered on every connection.
- JavaScript inspection retains its existing duration/operation budgets. The native plugin independently enforces operation timeouts, a 30-second inspection ceiling (five minutes for shared controls), a 500-notification budget, and a 4 KB incoming notification limit.
- Backgrounding stops scanning, inspection and shared controls and cancels pending operations. There is no reconnect loop. Shared controls can reuse a saved Core Bluetooth peripheral reference after a user presses Reconnect; otherwise the chooser remains available.
- Session exports open the native share sheet using a temporary protected file removed after sharing/cancellation. The finite 13 MB file budget matches the web import limit and accommodates a compact full-notebook backup; the 8 MB notebook and per-record limits still apply.
- The app loads bundled assets, with no remote web application or browser token. Imported files remain inert.

## Verification limits

**Read model & firmware** uses Core Bluetooth reads for five standard Device Information strings: manufacturer, model, hardware, firmware, and software. The Swift plugin enforces that service/field allowlist and a 512-byte response cap. Serial numbers, System ID, generic reads, characteristic writes, and firmware interfaces are excluded. Identification disconnects when the reads finish; the same UI can save the reported fields in a reusable device setup or a metadata connection report.

The CI job compiles the generated app for the iOS simulator without code signing, installs and launches it, waits until the native Bluetooth workspace has rendered, and saves a screenshot. A simulator-only DOM probe reports readiness through the system log; it requests no Bluetooth permission. JavaScript tests exercise the native facade with synthetic plugin callbacks, including cancellation, background stop, invalid/stale notifications, and listener cleanup. Browser fixtures exercise the shared UI through the same bridge contract.

If `simctl launch` times out after starting the app, the smoke check still requires the fresh simulator's readiness marker and a successful screenshot. A launch timeout alone cannot pass. The extended log window retains a marker emitted before that timeout; Python tests cover both successful evidence recovery and rejection without proof.

These checks do not establish iPhone radio permissions, real peripheral compatibility, successful Elmo authentication, or observed physical effects. Standard mild alert writes have no application acknowledgment; the native plugin independently clears them after two seconds or disconnects if its queue cannot send no-alert. Run the [real inspection procedure](../../docs/iphone-setup.md) on your exact unit.

The MiP LED also has an independent two-second off timer and best-effort off on disconnect. It finishes off rather than restoring a prior color/pattern, and physical cleanup cannot be guaranteed after radio loss. The [real-device check workflow](../../docs/device-action-validation.md) records command timing and owner observations without promoting simulated or imported reports to verified hardware support.

Implementation references: [Capacitor native code](https://capacitorjs.com/docs/ios/custom-code), [Swift Package Manager](https://capacitorjs.com/docs/ios/spm), and [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth).

## Startup verification correction

Capacitor 8.5.3's generated SceneDelegate instantiates a bridge controller directly.
Preparation therefore configures its `rootViewController` as `SasoriViewController`,
in addition to preserving storyboard compatibility, so the original Bluetooth plugin
instance is registered. The Bluetooth permission description is inserted in the root
Info.plist dictionary, including when re-preparing a project with an older nested entry.

Simulator readiness now requires an exact structured log event from the App process,
plus the rendered native workspace and Capacitor's plugin-availability check. A query
containing the readiness text, another process, or a launch timeout cannot pass alone.
This verifies startup/registration without requesting Bluetooth permission or scanning;
physical iPhone and toy behavior still require separate tests. The unrelated Privacy
Lab PR remains separate.

The bundle injects native.js before the laboratory module while preserving its cache-version query. An absent or duplicate entry fails the build; it cannot silently ship a web-only page inside the native app.
