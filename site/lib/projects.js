// Read-only projection of existing stores. It never creates a unified storage format.
export async function readProjects(store) {
  const sources = [
    ['hub', () => store.getHubData()],
    ['controls', () => store.getControlSetups()],
    ['toys', () => store.listToys()],
    ['records', () => store.list()],
    ['discovery', () => store.listDiscoveries()],
    ['pocket', () => store.getPocketData()],
    ['trials', () => store.getActionTrials()],
  ];
  const settled = await Promise.allSettled(sources.map(([, read]) => Promise.resolve().then(read)));
  const values = new Map(),
    unavailable = new Set();
  settled.forEach((result, index) => {
    const key = sources[index][0];
    if (result.status === 'fulfilled') values.set(key, result.value);
    else unavailable.add(key);
  });
  const item = (title, detail = '', at = null) => ({ title, detail, at });
  const records = values.get('records') || [];
  const section = (id, source, title, href, help, rows) => ({
    id,
    title,
    href,
    help,
    unavailable: unavailable.has(source),
    items: rows,
    count: unavailable.has(source) ? null : rows.length,
  });
  const hub = values.get('hub'),
    controls = values.get('controls'),
    pocket = values.get('pocket');
  return {
    persistent: store.persistent,
    warning: store.warning,
    invalidRecords: store.corrupt?.length || 0,
    sections: [
      section(
        'devices',
        'hub',
        'Saved devices',
        'hub.html',
        'Remembered device setups and touch mappings.',
        (hub?.setups || []).map((r) => item(r.label, r.familyId)),
      ),
      section(
        'routines',
        'hub',
        'Saved routines',
        'hub.html#automations',
        'Manually started routines for a selected device family.',
        (hub?.routines || []).map((r) =>
          item(r.name, r.familyId + ' · ' + r.steps.length + ' steps'),
        ),
      ),
      section(
        'sessions',
        'records',
        'Experiments and results',
        'index.html#sessions',
        'Session notes, connection receipts and saved results. Protocol traces are listed separately below.',
        records
          .filter((r) => !r.protocolTrace)
          .map((r) =>
            item(
              r.title,
              r.source + ' · ' + r.outcome + (r.notes ? ' · ' + r.notes.slice(0, 160) : ''),
              r.startedAt,
            ),
          ),
      ),
      section(
        'discoveries',
        'discovery',
        'Discovery observations',
        'index.html#discovery',
        'Saved capture summaries; original recordings are not retained by the sound inspector.',
        (values.get('discovery') || []).map((r) =>
          item(
            r.label,
            r.deviceModel +
              ' · ' +
              r.evidence +
              (r.payloadsIncluded ? ' · private raw values retained' : ' · metadata only'),
            r.createdAt,
          ),
        ),
      ),
      section(
        'traces',
        'records',
        'Protocol trace notebooks',
        'index.html#recorder',
        'Saved trace notebooks share the Research records budget and backup.',
        records
          .filter((r) => r.protocolTrace)
          .map((r) =>
            item(
              r.title,
              r.protocolTrace.transport +
                (r.protocolTrace.payloadsIncluded
                  ? ' · private raw bytes retained'
                  : ' · metadata only'),
              r.startedAt,
            ),
          ),
      ),
      section(
        'controls',
        'controls',
        'Advanced control setups',
        'index.html#universal',
        'Existing standard BLE, MiP and Furby setup records.',
        (controls?.targets || []).map((r) => item(r.label, r.adapterId)),
      ),
      section(
        'inspection',
        'toys',
        'Inspection profiles',
        'index.html#toys',
        'Sourced UUID profiles for the Research Lab.',
        (values.get('toys') || []).map((r) =>
          item(r.label, 'Inspection settings; not a verified command adapter'),
        ),
      ),
      section(
        'remotes',
        'pocket',
        'Custom Pocket IR profiles',
        'pocket-ir.html',
        'Custom owner-built IR bridge profiles; built-in starters are not counted as saved work.',
        (pocket?.profiles || []).map((r) =>
          item(r.name, r.buttons.length + ' configured buttons · hardware verification required'),
        ),
      ),
      section(
        'trials',
        'trials',
        'Action validation records',
        'index.html#universal',
        'Software outcomes and owner observations remain distinct.',
        (values.get('trials') || []).map((r) =>
          item(r.label || r.intent, r.model + ' · ' + r.source + ' · ' + r.outcome, r.startedAt),
        ),
      ),
    ],
  };
}
export function matchingProjectItems(section, query) {
  const needle = query.trim().toLowerCase();
  return section.items.filter((r) =>
    [r.title, r.detail, section.title].join(' ').toLowerCase().includes(needle),
  );
}
