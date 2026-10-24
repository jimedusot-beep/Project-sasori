import { Capacitor, registerPlugin } from '@capacitor/core';
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios')
  globalThis.SasoriNativeBluetooth = registerPlugin('SasoriBluetooth');
