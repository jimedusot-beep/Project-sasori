import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeConfiguration } from '../native/ios/configure.mjs';
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
  assert.ok(!result.plist.includes('NSCameraUsageDescription'));
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
