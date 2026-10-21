// Runs only inside trusted GitHub Actions; never shipped in the Pages directory.
const fs = require('node:fs');
module.exports = async function publishMetadata({ github, context }) {
  const { owner, repo } = context.repo;
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const tag = context.ref.startsWith('refs/tags/') ? context.ref.slice(10) : 'v' + version;
  const existing = await github.rest.repos.getReleaseByTag({ owner, repo, tag }).catch((error) => {
    if (error.status !== 404) throw error;
    return null;
  });
  if (!existing)
    await github.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tag,
      target_commitish: context.payload.workflow_run?.head_sha || context.sha,
      name: 'Project Sasori ' + tag,
      body: fs.readFileSync('docs/release-notes.md', 'utf8'),
      prerelease: true,
    });
  const milestones = await github.paginate(github.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
  });
  for (const item of [
    {
      title: 'M1 · Repeatable Elmo inspection',
      description:
        'Complete five authorized 15-second inspections on the real iPhone/Bluefy/Elmo combination, plus manual and background stops. Record UUIDs, properties, notifications, and disconnect reasons. No authentication or motor writes.',
    },
    {
      title: 'M2 · Evidence-backed authentication',
      description:
        'After M1, obtain a documented handshake and authorized private observations. Define consent, local-only credential handling, finite traffic budgets, and independently testable outcomes before live authentication.',
    },
  ])
    if (!milestones.some((m) => m.title === item.title))
      await github.rest.issues.createMilestone({ owner, repo, ...item });
};
