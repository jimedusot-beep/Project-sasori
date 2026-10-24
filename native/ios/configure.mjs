// Transform the generated, version-pinned Capacitor scene and plist templates.
export function nativeConfiguration({ scene, plist }) {
  const configuredScene = scene.replaceAll('CAPBridgeViewController()', 'SasoriViewController()');
  if (!/rootViewController\s*=\s*SasoriViewController\(\)/.test(configuredScene))
    throw new Error('Unsupported native scene bootstrap');
  const cleaned = plist.replace(
    /<key>NS(?:BluetoothAlways|Camera)UsageDescription<\/key>\s*<string>[\s\S]*?<\/string>/g,
    '',
  );
  if (/<key>NS(?:BluetoothAlways|Camera)UsageDescription<\/key>/.test(cleaned))
    throw new Error('Unsupported native permission entry');
  const index = cleaned.lastIndexOf('</dict>');
  if (index < 0 || !cleaned.includes('<plist')) throw new Error('Unsupported native plist');
  const permissions =
    '<key>NSBluetoothAlwaysUsageDescription</key><string>Sasori uses Bluetooth for devices you select and for nearby advertisements when you start a survey.</string><key>NSCameraUsageDescription</key><string>Sasori uses the camera only when you start an optical inspection. Photos are saved only by your choice.</string>';
  return {
    scene: configuredScene,
    plist: cleaned.slice(0, index) + permissions + cleaned.slice(index),
  };
}
