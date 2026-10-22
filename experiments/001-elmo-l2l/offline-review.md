# Review an Elmo capture offline

This tool reads the existing Sasori JSON export format. It does not parse an established Elmo command protocol, transmit packets, handle credentials or decide whether authentication succeeded.

From the repository root, using Node 22 or later:

```sh
npm run review:elmo -- /absolute/path/to/private-session.json
```

For JSON-only stdout without npm's script banner:

```sh
node scripts/elmo-capture-review.mjs /absolute/path/to/private-session.json
```

Input may be a session or metadata backup, up to 2 MB. Existing record validation applies, including v1 migration, at most 50 records, 500 packets per record, 250 KB per record and the retained hex limit. The CLI reads a regular local file and writes only a JSON review to stdout. Errors omit file paths and input contents. No data is saved or sent. Keep the original private export outside tracked repository files.

| Output                                                     | Meaning                                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceClaim`, `previouslyImported`                        | Preserve declared session provenance; an offline file is never independently verified, including a file labeled `live`                                         |
| `packetRecords`, `statsConsistent`                         | Count retained packet entries and compare stored statistics against their metadata; consistency does not authenticate a capture or verify physical byte counts |
| `completeRawPackets`                                       | Retained nonempty hex, payload policy enabled, declared length matching hex, no truncation flag; completeness is limited to that exported notification         |
| `omittedPackets`                                           | Payload policy disabled or no retained hex; metadata-only capture does not mean the toy transmitted no bytes                                                   |
| `incompletePackets`                                        | Truncated retention or contradictory declared length; not analyzed as complete bytes                                                                           |
| `exactHistoricalMatches`                                   | Byte-for-byte matches to the three historical user-reported examples; not protocol verification                                                                |
| `patterns`                                                 | Existing decoder's textual descriptions recomputed from bytes; stored `kind`, text and outcome strings cannot supply evidence                                  |
| `candidateServiceClaimed`, `candidateDataNotifyProperties` | Candidate UUID matches from the imported service inventory, scoped to the matching service; still claims, with sorted property names                           |
| `protocolVerdict`                                          | Always `inconclusive`; this tool has no verified authentication/status response parser                                                                         |

Reports contain counts, booleans and fixed labels. They omit IDs, filenames, notes, timestamps, arbitrary UUIDs, diagnostics, outcome text and raw payloads. A report cannot reconstruct missing bytes or replace a privately retained capture. Review artifacts privately before sharing; a count-only report is not an authentication transcript.

Run the offline regression suite with:

```sh
node --test tests/elmo-capture-review.test.mjs tests/elmo-historical-corpus.test.mjs
```

Only the corpus's three public RX examples are historical. Test session envelopes, fragments, joined packets and auth-like bytes are synthetic edge cases, not an Elmo exchange or packet-construction vectors. No production website assets or transport APIs change.
