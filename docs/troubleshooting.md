# Troubleshooting

| Symptom                 | What to check                                                            | Next action                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Connect disabled        | Unsupported browser, insecure origin, future profile, or running session | Use HTTPS Bluefy, select Experiment 001, or run simulation.                                                          |
| Authorization warning   | Checkbox not selected                                                    | Confirm you own/have permission to inspect the selected device.                                                      |
| Chooser cancelled       | No device selected; recorded as selection-cancelled                      | Retry manually when ready. A pending native chooser may still need closing.                                          |
| Elmo missing            | Power, proximity, name filter, or another app owns link                  | Close competing apps and retry once. Do not repeatedly hammer Connect.                                               |
| Service absent          | Community candidate may differ from this firmware                        | Inspect UUIDs with nRF Connect without writes. Record parent service and characteristic properties.                  |
| No notify support       | Wrong characteristic or unsupported native bridge                        | Review observed properties and source; use metadata-only inspection if appropriate.                                  |
| No notifications        | Correct subscription does not guarantee traffic                          | Save an inconclusive record. Silence proves neither authentication success nor rejection.                            |
| Unexpected disconnect   | Radio loss, firmware sleep, power, other app, or bridge failure          | Review log; retry manually after checking setup. Keep the page foreground.                                           |
| Timed disconnect        | inspection-complete after 15 seconds from GATT connection                | Expected bounded behavior. No automatic reconnect.                                                                   |
| Packet limit            | More than 500 notifications                                              | Inspection stops rather than collecting unbounded data. Review counts and retry only deliberately.                   |
| Backgrounded page       | page-hidden disconnect                                                   | Reopen Bluefy and start a fresh session. Timers are not physical safety guarantees.                                  |
| Clipboard denied        | Browser capability/permission                                            | Log is selected for manual copy; JSON/TXT downloads remain available.                                                |
| Records missing         | Different browser/origin, private mode, eviction, cleared storage        | Import a metadata backup. Nothing syncs across devices automatically.                                                |
| Storage blocked         | Another tab has an old DB connection                                     | Close old Sasori tabs, reload, and inspect the visible storage status.                                               |
| Temporary memory        | IndexedDB unavailable or could not open                                  | Export before closing. Do not assume records will survive reload.                                                    |
| Corrupt records skipped | Failed schema validation                                                 | Export valid records first. Use the explicit corrupt-record cleanup control; do not clear all browser data casually. |
| Capacity exceeded       | 50 records, 8 MB total, or 250 KB record                                 | Export metadata backups; delete only selected obsolete records. Raw payloads can exceed limits quickly.              |
| Invalid import          | Foreign version, malformed JSON, oversized file                          | No partial import occurs. Correct the format or split text notes.                                                    |
| Pages configure failure | Repository Pages not enabled or token cannot configure it                | Repository Settings → Pages → Build and deployment → GitHub Actions. Rerun Deploy Pages.                             |

If there is heat, binding, smoke, damaged wiring, or unexpected movement, stop and switch off physical power. Disconnecting the browser is not a reliable physical emergency stop.
