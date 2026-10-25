# My Projects

Open [My Projects](https://jimedusot-beep.github.io/Project-sasori/projects.html) from
Simple Mode's Projects link. It is a read-only overview of existing local workspaces,
not a new combined project format. No account or automatic device connection is needed.

The overview shows saved Hub devices and routines, session results and descriptions,
Discovery observations, protocol traces, advanced control setups, inspection profiles,
custom Pocket IR profiles and action-validation records. Search titles, models and
short descriptions. Open a section's existing workspace to edit, run, export or restore.
Each section retains its original validation, limits and backup format.

## Dates and privacy

Sessions, traces, Discovery and action records show their stored timestamps. Older
setup/routine formats have no timestamp, so the overview says “Date not recorded”
instead of inventing one. Notebook note excerpts are shown locally; raw payloads,
Bluetooth device identifiers and connection authority are not part of the projection.
Raw audio recordings are not retained by the sound inspector. Keep originals separately.

## Backup and restore map

| Workspace           | What to export                                            | Restore destination                          |
| ------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Device Hub          | Hub backup: devices, routines and touch mappings          | Device Hub → Import backup                   |
| Research records    | Session/trace notebook backup, normally metadata only     | Research records → Import research file      |
| Discovery           | Discovery metadata backup, omitting raw values and audio  | Discovery → Import discovery backup          |
| Inspection profiles | Device-profile backup                                     | Devices in Research Lab → Import profiles    |
| Universal controls  | Control setups; separate trial reports for action records | Universal controls → matching import control |
| Pocket IR           | One custom profile at a time                              | Pocket Remote → custom-profile import        |

Backups are deliberately separate. A Hub backup does not contain Discovery, session
records, or Pocket IR profiles. A notebook backup includes saved traces but is not an
original WAV archive. Check the format/version and use the workspace that created the
file. Importing data does not establish device compatibility or physical effects.

Passwords and current authorization are omitted by the existing setup exporters;
connections may need credentials again. Free-form notes should be reviewed before
sharing. Raw trace exports have an explicit retention policy and should stay private.
The Projects overview does not add a new export that silently combines these formats.

## Missing data and recovery

Data belongs to the browser/application and site origin that saved it. Safari, Bluefy,
the native app, GitHub Pages and a local companion can have separate stores. Use a
matching export/import to move work; do not assume another store is empty or deleted.

When storage is unavailable, Projects explicitly reports temporary memory and does not
claim that zero items means the original work is gone. A corrupt workspace is marked
Unavailable while healthy sections remain readable. Invalid research records are
reported through the existing recovery path. Nothing is deleted or repaired here.

On restore failure, keep the original file and browser data. Follow the destination's
validation message; malformed bundles must not partially replace data. For a conflict,
export unsaved work if possible, reload the newest version, then retry. Clearing storage
is not a conflict-resolution step.

Automatic sync is not implemented. [Private sync design](private-sync-design.md)
specifies the separate security, conflict and recovery requirements.
