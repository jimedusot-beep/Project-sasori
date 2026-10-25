import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeConfiguration, nativeEntry } from '../native/ios/configure.mjs';
const scene = 'window?.rootViewController = CAPBridgeViewController()';
const plist =
  '<?xml version="1.0"?><plist version="1.0"><dict><key>Scene</key><dict><key>Name</key><string>main</string></dict><key>Other</key><string>keep</string></dict></plist>';

test('native startup uses the custom controller and permission belongs to the root dictionary', () => {
  const result = nativeConfiguration({ scene, plist });
  assert.ok(result.scene.includes('rootViewController = SasoriViewController()'));
  assert.ok(!result.scene.includes('CAPBridgeViewController()'));
  const rootPermission = result.plist.indexOf('<key>NSBluetoothAlwaysUsageDescription</key>');
  assert.ok(rootPermission > result.plist.indexOf('</dict>'));
  assert.ok(rootPermission < result.plist.lastIndexOf('</dict>'));
  assert.ok(result.plist.includes('<key>Other</key><string>keep</string>'));
  const cameraPermission = result.plist.indexOf('<key>NSCameraUsageDescription</key>');
  assert.ok(cameraPermission > result.plist.indexOf('</dict>'));
  assert.ok(cameraPermission < result.plist.lastIndexOf('</dict>'));
  const microphonePermission = result.plist.indexOf('<key>NSMicrophoneUsageDescription</key>');
  assert.ok(microphonePermission > result.plist.indexOf('</dict>'));
  assert.ok(microphonePermission < result.plist.lastIndexOf('</dict>'));
});
test('repeat generation moves old nested permission entries to root without duplicates', () => {
  const old = plist.replace(
    '</dict>',
    '<key>NSBluetoothAlwaysUsageDescription</key><string>old</string></dict>',
  );
  const first = nativeConfiguration({ scene, plist: old });
  const second = nativeConfiguration(first);
  assert.deepEqual(second, first);
  assert.equal(
    (second.plist.match(/<key>NSBluetoothAlwaysUsageDescription<\/key>/g) || []).length,
    1,
  );
  assert.ok(!second.plist.includes('<string>old</string>'));
  assert.equal((second.plist.match(/<key>NSMicrophoneUsageDescription<\/key>/g) || []).length, 1);
  assert.equal((second.plist.match(/<key>NSCameraUsageDescription<\/key>/g) || []).length, 1);
});
test('unsupported native templates fail rather than silently generating a generic bridge', () => {
  assert.throws(() => nativeConfiguration({ scene: 'unknown scene template', plist }), /bootstrap/);
  assert.throws(() => nativeConfiguration({ scene, plist: 'unknown plist' }), /plist/);
  assert.throws(
    () =>
      nativeConfiguration({
        scene,
        plist: plist.replace(
          '</dict>',
          '<key>NSBluetoothAlwaysUsageDescription</key><true/></dict>',
        ),
      }),
    /permission/,
  );
});

test('native bootstrap precedes the current versioned app entry and preserves its query', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const built = nativeEntry(html);
  const entry = html.match(/src="app\.js[^"]*"/)?.[0];
  assert.ok(entry);
  assert.ok(built.indexOf('src="native.js"') < built.indexOf(entry));
  assert.ok(built.includes(entry));
  assert.equal((built.match(/src="native.js"/g) || []).length, 1);
});
test('native packaging refuses missing or duplicate entry modules instead of shipping without bootstrap', () => {
  const entry = '<script type="module" src="app.js"></script>';
  assert.ok(nativeEntry(entry).includes('src="native.js"'));
  for (const html of [
    '',
    '<script src="other.js"></script>',
    entry + entry,
    '<script src="native.js"></script>' + entry,
  ])
    assert.throws(() => nativeEntry(html));
});
