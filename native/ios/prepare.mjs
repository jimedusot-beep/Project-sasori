import { access, cp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import xcode from 'xcode';
import { nativeConfiguration } from './configure.mjs';
const root = fileURLToPath(new URL('./', import.meta.url));
const cap = root + 'node_modules/@capacitor/cli/bin/capacitor';
try {
  await access(root + 'ios/App/App.xcodeproj/project.pbxproj');
} catch {
  execFileSync(process.execPath, [cap, 'add', 'ios', '--packagemanager', 'SPM'], {
    cwd: root,
    stdio: 'inherit',
  });
}
execFileSync(process.execPath, [cap, 'sync', 'ios'], { cwd: root, stdio: 'inherit' });
const project = xcode.project(root + 'ios/App/App.xcodeproj/project.pbxproj');
project.parseSync();
const groups = project.hash.project.objects.PBXGroup;
const appGroup = Object.keys(groups).find(
  (key) => !key.endsWith('_comment') && (groups[key].path === 'App' || groups[key].name === 'App'),
);
if (!appGroup) throw new Error('Generated App source group not found.');
for (const name of [
  'SasoriBluetoothPlugin.swift',
  'SasoriSurveyPlugin.swift',
  'SasoriViewController.swift',
]) {
  await cp(root + 'Sources/' + name, root + 'ios/App/App/' + name);
  if (!project.hasFile(name))
    project.addSourceFile(name, { target: project.getFirstTarget().uuid }, appGroup);
}
function removeUndefined(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || (key === 'explicitFileType' && value[key] === 'undefined'))
      delete value[key];
    else removeUndefined(value[key]);
  }
}
removeUndefined(project.hash);
project.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', '16.0');
await writeFile(root + 'ios/App/App.xcodeproj/project.pbxproj', project.writeSync());
const storyboard = root + 'ios/App/App/Base.lproj/Main.storyboard';
await writeFile(
  storyboard,
  (await readFile(storyboard, 'utf8')).replace(
    'customClass="CAPBridgeViewController" customModule="Capacitor"',
    'customClass="SasoriViewController" customModule="App"',
  ),
);
const plist = root + 'ios/App/App/Info.plist';
const scene = root + 'ios/App/App/SceneDelegate.swift';
const configured = nativeConfiguration({
  scene: await readFile(scene, 'utf8'),
  plist: await readFile(plist, 'utf8'),
});
await writeFile(scene, configured.scene);
await writeFile(plist, configured.plist);
console.log(
  'Prepared inspection-only iOS app. Open in Xcode to select your signing team and iPhone.',
);
