// Runs only inside trusted GitHub Actions; never shipped in the Pages directory.
const fs = require('node:fs');
module.exports = async function publishMetadata({ github, context }) {
  const { owner, repo } = context.repo;
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const tag = context.ref.startsWith('refs/tags/') ? context.ref.slice(10) : 'v' + version;
  let release = await github.rest.repos.getReleaseByTag({ owner, repo, tag }).catch((error) => {
    if (error.status !== 404) throw error;
    return null;
  });
  if (!release)
    release = await github.rest.repos.createRelease({
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
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
  });
  const publishedMilestones = [];
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
  ]) {
    const milestone =
      milestones.find((m) => m.title === item.title) ||
      (await github.rest.issues.createMilestone({ owner, repo, ...item })).data;
    publishedMilestones.push({
      number: milestone.number,
      title: milestone.title,
      url: milestone.html_url,
    });
    const expectedTitle = item.title.startsWith('M1')
      ? 'M1: Reproduce five safe Elmo inspections on iPhone and Bluefy'
      : 'M2: Establish an authorized authentication specification after repeatable inspection';
    const issue = issues.find((i) => !i.pull_request && i.title === expectedTitle);
    if (issue && !issue.milestone)
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        milestone: milestone.number,
      });
  }
  return { release: release.data.html_url, milestones: publishedMilestones };
};
