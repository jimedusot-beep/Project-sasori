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

export function nativeEntry(html) {
  const entries = [...html.matchAll(/<script type="module" src="app\.js(?:\?[^"]*)?"><\/script>/g)];
  if (entries.length !== 1) throw new Error('Expected exactly one laboratory entry module.');
  const entry = entries[0][0];
  if (html.includes('<script src="native.js"></script>'))
    throw new Error('Native bootstrap already present in source HTML.');
  return html.replace(entry, '<script src="native.js"></script>\n' + entry);
}
