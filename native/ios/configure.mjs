// Configure the generated, version-pinned Capacitor SceneDelegate and root plist.
export function nativeConfiguration({ scene, plist }) {
  const configuredScene = scene.replaceAll('CAPBridgeViewController()', 'SasoriViewController()');
  if (!/rootViewController\s*=\s*SasoriViewController\(\)/.test(configuredScene))
    throw new Error('Unsupported native scene bootstrap');
  const cleaned = plist.replace(
    /<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>[\s\S]*?<\/string>/g,
    '',
  );
  if (cleaned.includes('<key>NSBluetoothAlwaysUsageDescription</key>'))
    throw new Error('Unsupported native Bluetooth permission entry');
  const index = cleaned.lastIndexOf('</dict>');
  if (index < 0 || !cleaned.includes('<plist')) throw new Error('Unsupported native plist');
  const permission =
    '<key>NSBluetoothAlwaysUsageDescription</key><string>Sasori uses Bluetooth only when you choose a device to inspect or control through supported actions.</string>';
  return {
    scene: configuredScene,
    plist: cleaned.slice(0, index) + permission + cleaned.slice(index),
  };
}
