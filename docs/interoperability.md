# Session format and future Python / H.E.R.B.I.E. interfaces

Current interchange format: sasori.session, schemaVersion 2. Backups use sasori.backup, schemaVersion 2. The [JSON schema](../schemas/session-v2.schema.json) is the machine-readable reference; browser runtime validation additionally enforces serialized size.

Session identifiers are local record IDs, not authentication tokens. Source is live, simulated, or imported. An importedAt timestamp separately marks restored/imported claims even when the original source field says live. No import grants a profile or command permission.

Required information: ID, profile, title, timestamps, outcome, notes, packet metadata, diagnostic events, observed services, statistics, and payload policy. Default portable records omit packet hex/text; backups always omit payloads. Restoring a backup creates copies with fresh IDs instead of overwriting experiments.

v1 migration fills empty service metadata, missing counters, notes/outcome, and a false payload policy. Unknown versions are rejected; nothing is guessed about their schema. A v1 IndexedDB sessions store is retained after copying valid records into v2.

## Future transport contract

A private local Python adapter using Bleak may emit the same event categories as BluetoothTransport: state, services, packet, error, warning, and info. It must preserve source and evidence labels, enforce budgets, and disconnect on cancellation. Device-specific protocol code stays separate from transport.

H.E.R.B.I.E. can later import these session envelopes for research context. A future command-request envelope must be a different schema with authenticated controller identity, explicit consent, reviewed capability, sequence/time/packet budgets, measured limits, and acknowledgement semantics. Session files are never executable scripts.

No Bluetooth Python controller, remote command endpoint, public code-execution interface, or authenticated remote management backend is deployed by this release. GitHub synchronization is optional future work and must use a server-side authenticated integration; never a token embedded in Pages JavaScript.

## Private desktop inspection of an exported record

```python
import json
from pathlib import Path
record = json.loads(Path("sasori-session.json").read_text())
if record.get("format") != "sasori.session" or record.get("schemaVersion") != 2:
    raise ValueError("Unsupported Sasori session")
print(record["source"], record["outcome"], record["stats"]["packets"])
```

This example reads a local file only. It performs no BLE connection, command replay, or full schema validation; production adapters should validate against the schema and runtime limits before using a record.
