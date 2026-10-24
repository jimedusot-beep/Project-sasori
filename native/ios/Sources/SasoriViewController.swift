import Foundation
import Capacitor
import WebKit

class SasoriViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SasoriBluetoothPlugin())
        bridge?.registerPluginInstance(SasoriSurveyPlugin())
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
            webView.evaluateJavaScript("document.getElementById('hub-browser-title')?.textContent === 'Native iPhone Bluetooth ready'") { [weak self] value, _ in
                if value as? Bool == true {
                    NSLog("Sasori native interface ready")
                    webView.evaluateJavaScript("window.location.href = 'privacy.html'") { [weak self] _, _ in
                        self?.verifyPrivacyInterface()
                    }
                } else { self?.verifyInterface(attempt: attempt + 1) }
            }
        }
    }
    private func verifyPrivacyInterface(attempt: Int = 0) {
        guard attempt < 120 else { NSLog("Sasori native privacy readiness timed out"); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, let webView = self.webView else { return }
            webView.evaluateJavaScript("document.getElementById('ble-status')?.textContent.includes('Native advertisement survey available') === true && window.Capacitor?.isPluginAvailable('SasoriSurvey') === true") { [weak self] value, _ in
                if value as? Bool == true { NSLog("Sasori native privacy interface ready") }
                else { self?.verifyPrivacyInterface(attempt: attempt + 1) }
            }
        }
    }
    #endif
}
