import Foundation
import Capacitor

class SasoriViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SasoriBluetoothPlugin())
        NSLog("Sasori native inspection bridge registered")
    }
}
