// Configure the generated, version-pinned Capacitor SceneDelegate and root plist.
export function nativeConfiguration({ scene, plist }) {
  const configuredScene = scene.replaceAll('CAPBridgeViewController()', 'SasoriViewController()');
  if (!/rootViewController\s*=\s*SasoriViewController\(\)/.test(configuredScene))
    throw new Error('Unsupported native scene bootstrap');
  const cleaned = plist.replace(
    /<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>[\s\S]*?<\/string>/g,
    '',
  );
  const withoutMicrophone = cleaned.replace(
    /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[\s\S]*?<\/string>/g,
    '',
  );
  if (withoutMicrophone.includes('<key>NSMicrophoneUsageDescription</key>'))
    throw new Error('Unsupported native microphone permission entry');
  if (withoutMicrophone.includes('<key>NSBluetoothAlwaysUsageDescription</key>'))
    throw new Error('Unsupported native Bluetooth permission entry');
  const index = withoutMicrophone.lastIndexOf('</dict>');
  if (index < 0 || !withoutMicrophone.includes('<plist')) throw new Error('Unsupported native plist');
  const permission =
    '<key>NSBluetoothAlwaysUsageDescription</key><string>Sasori uses Bluetooth only when you choose a device to inspect or control through supported actions.</string>';
  const microphonePermission =
    '<key>NSMicrophoneUsageDescription</key><string>Sasori uses the microphone only when you start a local sound-detection experiment. Audio is not saved or uploaded.</string>';
  return {
    scene: configuredScene,
    plist:
      withoutMicrophone.slice(0, index) +
      permission +
      microphonePermission +
      withoutMicrophone.slice(index),
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
