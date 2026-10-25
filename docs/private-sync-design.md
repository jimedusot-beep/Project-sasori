# Private cross-device sync — proposed design, not implemented

Local use must continue without an account. Optional authenticated sync would be a
separate opt-in service; manual JSON backups and the Projects overview are not sync.
No provider, bucket or account has been provisioned by this design.

## Data and authorization

- Preserve each existing format as a typed, versioned object; never silently combine
  independent notebooks or increase local data limits.
- Bind ownership to a server-verified authenticated identity. Check ownership on every
  read, write, list, attachment and delete, including authorization-negative tests.
- Keep live credentials, active connection leases and Bluetooth access authority out
  of sync. Restored setups never initiate a device connection or command.
- Make raw capture/audio sync a separate explicit choice. Recordings need a real
  attachment lifecycle; the current sound inspector does not retain original audio.

## Encryption and recovery

- Require TLS and private per-owner storage. Use authenticated encryption for stored
  objects and attachments; keep keys outside public repositories and client bundles.
- Decide and document whether encryption is client-held/end-to-end or server-managed
  before implementation. Client-held encryption requires explicit key recovery,
  key rotation, lost-device revocation and a clear explanation of unrecoverable loss.
- Authenticate object type, schema version and revision alongside ciphertext. Reject
  corrupted, wrong-owner or incompatible objects before changing local data.

## Conflicts, deletion and offline behavior

- Use server-assigned revisions and conditional writes, not blind last-write-wins.
  Preserve both competing edits and show an explicit conflict-resolution choice.
- Use an idempotent, bounded offline queue. Expired authentication pauses sync without
  deleting local work; retry never duplicates records or executes hardware actions.
- Use versioned deletion tombstones and a defined retention/recovery window so an
  old offline device cannot resurrect a deletion. Deleting an account must cover
  objects, attachments, queued writes and eventual backup-retention policy.
- Validate full incoming objects and schema migrations before atomic local writes.
  Refuse unsupported versions and preserve the previous readable copy.

## Release gate

Test two signed-in devices, a different user, expired/revoked sessions, simultaneous
edits, offline deletion/reconnect, duplicate retries, quota limits, corrupted encrypted
objects, interrupted attachment uploads and recovery from a clean browser profile.
Independent authorization and restoration checks precede any claim that sync works.
The user must be able to export portable local backups and disable sync.
