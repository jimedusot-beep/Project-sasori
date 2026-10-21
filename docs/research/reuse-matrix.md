# Reuse Matrix — Source Code and Research Tools

## Tier 1: Immediate direct reuse of methods, not copied source

| Project/source                                                                                                  | License or standing                                        | Technical asset                                                                   | Sasori application                                  | Compatibility gate                                              |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| MDN Web Bluetooth docs https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API                       | Documentation/reference                                    | secure-context support and GATT access API                                        | Browser capability checks, connection lifecycle     | Web Bluetooth only where browser implements it; validate Bluefy |
| Chromium notifications demo https://googlechrome.github.io/samples/web-bluetooth/notifications-async-await.html | Example/reference; inspect exact license if copying source | GATT characteristic events                                                        | Compare our notification subscribe/unsubscribe flow | Match actual Elmo service/characteristic UUIDs                  |
| Nordic nRF Connect for Mobile https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile      | Vendor tool (app source not necessarily published)         | BLE scan/service/property inventory                                               | Recover UUIDs without authentication writes         | User-authorized, read-only observation                          |
| Jeija bluefluff https://github.com/Jeija/bluefluff                                                              | MIT repository; check file-level notices                   | Reverse-engineering methodology and device-specific protocol documentation format | Evidence register and byte-label discipline         | Furby bytes are NOT Elmo bytes                                  |

## Tier 2: Use after current BLE milestone

| Project/source                                                                                                | License or standing                    | Technical asset                                  | Sasori application                         | Compatibility gate                                                 |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| Bleak https://github.com/hbldh/bleak                                                                          | MIT                                    | asyncio cross-platform BLE client                | Local Python transport adapter on a laptop | Host OS BLE availability and Elmo UUID evidence                    |
| Nordic nRF Sniffer https://docs.nordicsemi.com/r/bundle/nrfutil/page/nrfutil-ble-sniffer/guides/overview.html | Vendor hardware + tools                | Over-the-air radio packet capture into Wireshark | Controlled app-to-toy traffic research     | Compatible sniffer hardware, secure acquisition and privacy        |
| Wireshark https://www.wireshark.org/docs/                                                                     | Software tool with applicable licenses | Analyze timestamped Bluetooth captures           | Trace analysis, compare command framing    | Only capture own/authorized sessions; do not assume decryptability |

## Tier 3: Future animatronic control

| Project/source                                                                    | License or standing                                                     | Technical asset                                                             | Sasori application                      | Compatibility gate                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Bottango https://github.com/EvanBottango/Bottango                                 | BSD-3-Clause drivers (desktop app licensing must be checked separately) | Arduino/C++ firmware and Python network driver examples; animation controls | Independent puppet servo driver adapter | Measured motor limits, controller board, safe power |
| Adafruit CircuitPython BLE https://github.com/adafruit/Adafruit_CircuitPython_BLE | Check repository/file licenses before copying                           | Embedded BLE APIs and profiles                                              | Future custom toy or robotic accessory  | Specific board and firmware support                 |

## Rules

- Source identification is NOT proof of protocol or hardware compatibility.
- Prefer protocol documentation, small independently written adapters and interface tests before copying implementation.
- For reused source, record original URL, exact commit/tag, file, author notice, SPDX license, any attribution requirements and changes.
- Never add authenticated or raw write functionality by transplanting packet bytes from Furby, WHOOP or another BLE product.
- Every external adapter must satisfy a simulator contract and a physical safety plan before integration.
