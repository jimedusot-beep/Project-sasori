import Foundation
import Capacitor
import WebKit

class SasoriViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SasoriBluetoothPlugin())
        NSLog("Sasori native inspection bridge registered")
        #if targetEnvironment(simulator)
        verifyInterface()
        #endif
    }

    #if targetEnvironment(simulator)
    // Simulator-only readiness probe; never requests Bluetooth permission or scans.
    private func verifyInterface(attempt: Int = 0) {
        guard attempt < 120 else { NSLog("Sasori native interface readiness timed out"); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, let webView = self.webView else { return }
            webView.evaluateJavaScript("document.getElementById('hub-browser-title')?.textContent === 'Native iPhone Bluetooth ready' && window.Capacitor?.isPluginAvailable?.('SasoriBluetooth') === true") { [weak self] value, _ in
                if value as? Bool == true { NSLog("Sasori native interface ready") }
                else { self?.verifyInterface(attempt: attempt + 1) }
            }
        }
    }
    #endif
}
