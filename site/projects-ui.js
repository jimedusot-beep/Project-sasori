import { ResearchStore } from './lib/storage.js?v=recognition-20261024';
import { readProjects, matchingProjectItems } from './lib/projects.js';
const $ = (id) => document.getElementById(id);
const node = (tag, text, className = '') => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};
const store = new ResearchStore();
let overview = null;
function render() {
  if (!overview) return;
  const query = $('project-search').value;
  $('project-sections').replaceChildren();
  for (const section of overview.sections) {
    const card = node('section', '', 'panel project-section');
    card.dataset.project = section.id;
    card.setAttribute('aria-labelledby', 'projects-' + section.id);
    const title = node('h2', section.title);
    title.id = 'projects-' + section.id;
    const count = node(
      'p',
      section.unavailable ? 'Unavailable' : section.count + ' saved',
      'project-count',
    );
    card.append(title, count, node('p', section.help));
    if (section.unavailable)
      card.append(
        node(
          'p',
          'This section could not be read. Existing data was left unchanged. Open its workspace for recovery guidance.',
          'notice',
        ),
      );
    else {
      const matches = matchingProjectItems(section, query);
      if (!section.count)
        card.append(
          node(
            'p',
            'Nothing saved here yet. Open this workspace to create or import matching work.',
            'hint',
          ),
        );
      else if (!matches.length) card.append(node('p', 'No matching items.', 'hint'));
      else {
        const details = node('details', '');
        details.append(
          node(
            'summary',
            'View ' + matches.length + ' saved item' + (matches.length === 1 ? '' : 's'),
          ),
        );
        const list = node('ul', '', 'project-items');
        for (const entry of matches.slice(0, 25)) {
          const row = node('li', '');
          row.append(node('h3', entry.title), node('p', entry.detail));
          const date = node(
            'p',
            entry.at ? new Date(entry.at).toLocaleString() : 'Date not recorded by this workspace',
            'hint',
          );
          row.append(date);
          const open = node('a', 'Open workspace to find this item', 'project-item-link');
          open.href = section.href;
          open.setAttribute(
            'aria-label',
            'Open ' + section.title + ' workspace for ' + entry.title,
          );
          row.append(open);
          list.append(row);
        }
        details.append(list);
        if (matches.length > 25)
          details.append(
            node('p', 'Showing 25 items. Open the workspace for the full list.', 'hint'),
          );
        card.append(details);
      }
    }
    const link = node('a', 'Open ' + section.title.toLowerCase() + ' ↗', 'project-link');
    link.href = section.href;
    card.append(link);
    $('project-sections').append(card);
  }
  $('project-summary').textContent =
    overview.sections.filter((s) => !s.unavailable).length +
    ' of ' +
    overview.sections.length +
    ' sections available. Refreshed ' +
    new Date().toLocaleTimeString() +
    '.';
  $('project-storage').textContent = overview.persistent
    ? 'Saved in this browser on ' + location.origin + '. No account required. No automatic sync.'
    : 'Saved storage is unavailable. This is temporary memory only; existing disk data may not be visible. Return to the original browser and site or use a backup.';
  $('project-warning').hidden = !overview.warning && !overview.invalidRecords;
  $('project-warning').textContent =
    overview.warning ||
    overview.invalidRecords +
      ' invalid research records were skipped. Open Research records to review recovery options; nothing was deleted.';
}
async function refresh() {
  $('project-refresh').disabled = true;
  $('project-summary').textContent = 'Reading local workspaces…';
  try {
    overview = await readProjects(store);
    render();
  } catch {
    $('project-summary').textContent =
      'Projects could not be read. Existing data was left unchanged. Use the workspace and backup links below.';
  } finally {
    $('project-refresh').disabled = false;
  }
}
$('project-refresh').addEventListener('click', refresh);
$('project-search').addEventListener('input', render);
await store.open();
await refresh();
