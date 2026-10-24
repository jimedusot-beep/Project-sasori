# Elmo remote: open a link and connect

Open [Sasori Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html). No Python, Terminal, local server or software build is required. The main laboratory also links to **Elmo remote** in quick setup.

1. Use Chrome on a Bluetooth-equipped Mac/Windows computer, or Bluefy on iPhone/iPad. The page checks whether Bluetooth is available in its current browser and shows another-browser instructions when it is absent. Bluetooth permission, radio availability and real Bluefy behavior still depend on the device.
2. Turn on your own Love2Learn Elmo and close other apps connected to it.
3. Enter the **existing password previously set for the toy**. For a new or factory-reset toy, enter your chosen new password and explicitly select **Set this password if Elmo reports none**. Keep a private copy; it is used locally and is not saved. For a forgotten password, open **I don’t know Elmo’s password** or follow the [password recovery guide](elmo-password-recovery.md): accessible original-app settings can show it, and Hasbro documents a physical reset that erases personalization. Select **Connect Elmo**, then choose your toy in the browser's chooser. If necessary, explicitly enable **Show all Bluetooth devices** before trying again.
4. Wait for the toy to report acceptance. The remote requests input/volume state automatically. **Read status** repeats these queries; missing replies remain unknown. Touch inputs update while connected.
5. Select **Play greeting** to request built-in sound ID 9 once. Listen to the actual toy. A queued request is not proof of playback, and **Disconnect** is not a verified silence command.
6. Select **Disconnect**, then **Save connection result** if you want the private JSON report. After password setup, uncheck setup and reconnect with your chosen password to test persistence; save the second result separately. If setup was interrupted, the toy may already have stored it, so try that password with setup unchecked before another reset. Reconnect can reuse the device chosen during this page visit; it still needs your password. Reloading clears that device reference and never starts Bluetooth automatically.

**Try the demo first** works without Bluetooth and uses an isolated fake device. Its badge, messages and receipt remain synthetic. It sends no request to `navigator.bluetooth` and produces no real toy sound.

## What this release establishes

The browser client is an original JavaScript port of the [desktop subset](../desktop/README.md#experimental-elmo-known-password-check), supported by the [recovered original-app method evidence](../experiments/001-elmo-l2l/recovered-source.md). The JavaScript and Python calculations share independent, published synthetic expected vectors for whitespace and UTF-16 low-byte password behavior. Browser MD5 tests also compare with Node's standard implementation across padding and multi-block boundaries.

The browser sender requires observed service/notify/write-without-response channels and explicit status `40 01` after its current challenge response or opted-in password-setup write. Setup is disabled by default, requires the exact `40 00` unset report in an eligible authentication stage, sends at most one enrollment frame and never overwrites a rejected existing password. It rejects malformed/unknown/early statuses, changed challenges and unsupported frame lengths. Its other actions are input/volume queries and a single fixed greeting. Source facts do not establish acceptance, password persistence, sound, firmware compatibility or recovery on Jimmy's physical Elmo. Physical factory reset remains an owner action described by Hasbro, not a remote command or universal bypass.

Chooser operations have a 40-second budget; the selected-device session lasts at most 30 seconds, with shorter operation/authentication/query budgets and a 500-notification cap. Disconnect/page hiding cancels pending work, removes listeners and requests teardown; late chooser/connect results are closed without sending a command. It does not automatically reconnect. Web Bluetooth cannot forcibly dismiss the browser's chooser or guarantee that an operating-system operation stops immediately.

## Password and report handling

The password field is cleared when a connection or demo starts and when the page is hidden. Credential bytes, digests, challenges and responses do not enter UI snapshots, errors, storage, URLs, console logs or result reports. No cloud endpoint or analytics is used; the page's Content Security Policy disallows network connections and form submission. Browser/OS Bluetooth still handles the local radio exchange. JavaScript cannot guarantee erasure of every browser-managed string or buffer copy.

The downloadable `sasori.elmo-check` v1 result records source class, fixed outcomes, password-setup opt-in/outcome, observed query values and untested hardware/physical fields. It omits device IDs, free-form backend errors, passwords and raw packets. It is a private standalone receipt, not an import that can unlock the recorder or certify hardware. All independent verification flags remain false. A demo result remains synthetic even if its protocol exchange completes successfully.

## Platform scope

The remote is a hosted HTML/CSS/JavaScript app using browser Bluetooth. Open its HTTPS link directly; an iframe preview or local `file:` copy may not grant the required browser capabilities. The existing compiled Sasori iPhone Core Bluetooth facade retains its inspection, SIG and MiP APIs; this release does not add native Elmo writes to that facade. Use the hosted link in a compatible browser for the Elmo control trial.

References: [Web Bluetooth chooser](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice), [Bluetooth GATT write without response](https://developer.mozilla.org/en-US/docs/Web/API/BluetoothRemoteGATTCharacteristic/writeValueWithoutResponse), [Bluefy vendor](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices), and [RFC 1321 algorithm specification](https://www.rfc-editor.org/rfc/rfc1321). The MD5 arithmetic is original code implementing the toy's existing protocol facts; no RFC reference implementation or upstream application source was copied.
