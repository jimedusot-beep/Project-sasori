# Reuse a Flipper IR remote in Sasori

The [Pocket Remote](https://jimedusot-beep.github.io/Project-sasori/pocket-ir.html) can now turn a local Flipper `.ir` remote file into a saved five-button Sasori profile. It uses the same ESP32 bridge and requires no Flipper hardware, cloud account, hex editing, or new dashboard per model. This is software interoperability, **not verified physical appliance support**.

## Full phone workflow

1. Open Pocket Remote. Tap **Add a remote from a file**, or scroll to **Reuse a remote file**.
2. For an immediate example, tap **Load Sony file example**. It loads six credited community signals, with five convertible buttons and one unsupported RAW signal. This does not connect or send IR.
3. For your own remote, obtain a matching `.ir` file from your own capture or the linked [community repository](https://github.com/Lucaslhm/Flipper-IRDB). Save the actual raw `.ir` text file to your phone's Files/Downloads, then tap **Open a local .ir file** and choose it. An HTML GitHub page or ZIP is not an IR file. Alternatively copy the full file text, including `Filetype` and `Version`, tap **Paste file text**, paste, and press **Preview file text**.
4. Review the named buttons and compatibility messages. Up to five convertible buttons are preselected. Uncheck those you do not want and choose replacements; saving is disabled for zero or more than five selections. Unsupported signals stay disabled. A protocol match does not prove that a file matches your appliance.
5. Enter an exact model or memorable setup name and tap **Save selected buttons**. This creates/selects a reusable profile in the existing local catalog. It does not connect, program slots, or transmit IR. Previewing alone does not alter the selected setup or an already prepared remote; saving different codes requires fresh preparation.
6. Without hardware: **Try offline demo → Prepare remote → Power**. The demo uses the converted buttons and emits no IR.
7. With hardware: follow the [full bridge build/flash directions](../hardware/pocket-ir/README.md), use Bluefy on iPhone or a Web Bluetooth browser on desktop/Android, confirm permission, select your flashed bridge, and tap **Prepare remote**. Each selected command is stored once in a named slot; preparation emits no IR. Then point the bridge at your appliance and press one button manually. Observe the actual effect yourself.
8. Use **Export profile** to preserve/share a Sasori JSON copy, or reopen the same browser later to select the saved remote. Exports intentionally contain your labels and converted IR codes; review before sharing. Each fresh connection still requires Prepare. Browser/origin storage is separate; another browser or the local companion does not share these saves automatically.
9. **Clear draft** discards only the current import preview. Page hide/close discards temporary source text and preview, cancels a pending file read, and closes the bridge connection. Saved profiles remain in the catalog. The bridge retains programmed slots and independently wired physical buttons until erased/powered off as described in its guide.

## Accepted subset and conversion

Only **`Filetype: IR signals file`, `Version: 1`**, representing one remote, is accepted. Universal `IR library file`, `.sub`, test arrays, archives, and executable content are not accepted. The original parser does not copy or execute Flipper firmware. It follows the public file contract and maps only reviewed encodings to the existing fixed-protocol transmitter.

| Flipper protocol | Address / command widths | Sasori bridge output                                                   |
| ---------------- | ------------------------ | ---------------------------------------------------------------------- |
| NEC              | 8 / 8                    | NEC32; reversed address/command bytes with their complements           |
| NECext           | 16 / 16                  | NEC32; reverse both 16-bit fields, preserving all command bits         |
| Samsung32        | 8 / 8                    | SAMSUNG32; repeated reversed address and complemented reversed command |
| SIRC             | 5 / 7                    | SONY12; reverse the complete assembled signal                          |
| SIRC15           | 8 / 7                    | SONY15; reverse the complete assembled signal                          |
| SIRC20           | 13 / 7                   | SONY20; extended Sony bits are included in the Flipper address field   |

Address and command are each four bytes in the file, interpreted **little-endian**; values outside protocol masks are rejected rather than truncated. In particular, SIRC TV power `address: 01 00 00 00`, `command: 15 00 00 00` becomes `SONY12 0xA90`, not the un-reversed `0x95`. NECext carries a full 16-bit command; using the NEC 8-bit helper here would lose information.

RAW timings and other parsed protocols are listed with reasons and cannot be selected or saved as sendable buttons. RAW input is structurally checked, then omitted from the preview object/profile; it is not normalized into a guessed command. No raw-pulse transmitter, code sweep, Sub-GHz support, Bluetooth authentication bypass, or target firmware change is added.

## Limits and failure handling

- 128 KB UTF-8 text, at most 128 signals, printable ASCII signal names of at most 80 characters, and at most 1,024 durations per RAW record. Unknown/duplicate fields, invalid headers, malformed hex and out-of-range supported signals reject the file. A malformed file cannot replace an existing saved setup or leave a previous draft enabled under its error. Editing pasted source invalidates the previous preview until Preview is pressed again.
- Local file reads have a 15-second deadline. Clear, a replacement read, Stop, backgrounding, or page close cancels/invalidates an outstanding read. A late callback cannot restore an old draft over a newer preview.
- The saved catalog uses the existing versioned IndexedDB record: 20 custom profiles, 64 KB, revision conflict checks, no database upgrade or capture migration. Read-only/corrupt storage disables saving. Failed saving preserves the previously selected setup. Each successful save still requires manual Prepare before use.
- File text is temporary. Saved profiles retain selected encoded commands, labels, a new local profile ID, and an explicit imported/unverified source description. They do not include the full file, raw timings, original filename as a separate field, Bluetooth IDs, credentials, or source URLs. Your suggested setup name starts from the filename and is editable before saving.
- The existing bridge still has no authenticated pairing, slot readback, transaction nonce, or appliance acknowledgment. Successful conversion, storage, GATT writes, and simulated statuses are not evidence of real IR output or appliance response.

## Sources and actual reuse

Reviewed 2026-10-24:

- [Flipper official file format](https://developer.flipper.net/flipperzero/doxygen/infrared_file_format.html), with the [exact documentation revision](https://github.com/flipperdevices/flipperzero-firmware/blob/66613d2b46e4aa533aeaf8181d2a1e6566616a4e/documentation/file_formats/InfraredFileFormats.md).
- Flipper protocol widths and field behavior, same revision: [NEC variants](https://github.com/flipperdevices/flipperzero-firmware/blob/66613d2b46e4aa533aeaf8181d2a1e6566616a4e/lib/infrared/encoder_decoder/nec/infrared_protocol_nec.c), [NEC encoding](https://github.com/flipperdevices/flipperzero-firmware/blob/66613d2b46e4aa533aeaf8181d2a1e6566616a4e/lib/infrared/encoder_decoder/nec/infrared_encoder_nec.c), [Samsung widths](https://github.com/flipperdevices/flipperzero-firmware/blob/66613d2b46e4aa533aeaf8181d2a1e6566616a4e/lib/infrared/encoder_decoder/samsung/infrared_protocol_samsung.c), and [Sony address/extension description](https://github.com/flipperdevices/flipperzero-firmware/blob/66613d2b46e4aa533aeaf8181d2a1e6566616a4e/lib/infrared/encoder_decoder/sirc/infrared_protocol_sirc.h). Their GPL runtime is **not copied** into Sasori's browser client.
- IRremoteESP8266 **v2.9.0**, matching the pinned bridge build: [NEC encoder](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.9.0/src/ir_NEC.cpp), [Samsung encoder](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.9.0/src/ir_Samsung.cpp), [Sony encoder](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.9.0/src/ir_Sony.cpp), and [independent Sony encoder test vectors](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.9.0/test/ir_Sony_test.cpp). Sasori implements the browser conversion itself and tests expected bytes; no library runtime was added to the page.
- **Actual copied data:** [Lucaslhm/Flipper-IRDB, Sony_Bravia.ir](https://github.com/Lucaslhm/Flipper-IRDB/blob/d126fb1b6f1e114c52b4a8c19839ea65e3a9c24d/TVs/Sony/Sony_Bravia.ir), CC0-1.0. `tests/fixtures/sony-bravia.ir` is byte-identical to Git blob `f8b0828d048a9f9d630af6ab4488a6e2cc9681f7`. `site/lib/flipper-ir-example.js` embeds six selected records: Power, Vol_up, Vol_dn, Input, Mute, Ch_next. Source SHA-256 and names are recorded in [sources.json](../hardware/pocket-ir/sources.json); the [CC0 dedication](../hardware/pocket-ir/LICENSE-CC0-IRDB.txt) is preserved. The example makes no hardware compatibility claim.

The transferred strategy is a shared, portable remote description behind one small interface. A new supported IR model can reuse the same importer and controller rather than getting a new hand-coded dashboard. New physical protocols still require separately implemented, tested transport support.
