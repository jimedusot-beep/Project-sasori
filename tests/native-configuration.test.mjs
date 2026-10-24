import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { nativeConfiguration } from '../native/ios/configure.mjs';

const scene =
  'class SceneDelegate { func connect() { window?.rootViewController = CAPBridgeViewController() } }';
const plist =
  '<?xml version="1.0"?><plist version="1.0"><dict><key>UIApplicationSceneManifest</key><dict><key>Nested</key><dict><key>NSBluetoothAlwaysUsageDescription</key><string>misplaced old description</string></dict></dict><key>CFBundleIdentifier</key><string>org.sasori.laboratory</string></dict></plist>';
test('native preparation installs the custom scene controller and places permissions at the plist root', () => {
  const result = nativeConfiguration({ scene, plist });
  assert.equal(
    result.scene,
    'class SceneDelegate { func connect() { window?.rootViewController = SasoriViewController() } }',
  );
  const parsed = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import plistlib,json,sys; print(json.dumps(plistlib.loads(sys.stdin.buffer.read())))',
      ],
      { input: result.plist, encoding: 'utf8' },
    ),
  );
  assert.match(parsed.NSBluetoothAlwaysUsageDescription, /survey/);
  assert.match(parsed.NSCameraUsageDescription, /camera/);
  assert.equal(
    parsed.UIApplicationSceneManifest.Nested.NSBluetoothAlwaysUsageDescription,
    undefined,
  );
  assert.equal(parsed.CFBundleIdentifier, 'org.sasori.laboratory');
  assert.deepEqual(nativeConfiguration(result), result);
});
test('unknown native scene templates fail preparation rather than silently shipping an unregistered bridge', () => {
  assert.throws(() => nativeConfiguration({ scene: 'unknown future bootstrap', plist }));
});
