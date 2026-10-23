import Foundation
import UIKit
import CoreBluetooth
import Capacitor

// Inspection only. There is deliberately no characteristic-write or firmware API.
@objc(SasoriBluetoothPlugin)
public class SasoriBluetoothPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "SasoriBluetoothPlugin"
    public let jsName = "SasoriBluetooth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCharacteristics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readInformation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private var manager: CBCentralManager?
    private var peers: [CBPeripheral] = []
    private var selected: CBPeripheral?
    private var active: CBPeripheral?
    private var inspectedService: CBService?
    private var subscribed: CBCharacteristic?
    private var informationRead: CBCharacteristic?
    private let informationService = "0000180a-0000-1000-8000-00805f9b34fb"
    private let informationFields: Set<String> = [
        "00002a29-0000-1000-8000-00805f9b34fb", "00002a24-0000-1000-8000-00805f9b34fb",
        "00002a27-0000-1000-8000-00805f9b34fb", "00002a26-0000-1000-8000-00805f9b34fb",
        "00002a28-0000-1000-8000-00805f9b34fb"
    ]
    private var configuredService = ""
    private var prefix = ""
    private var showAll = false
    private var pending: CAPPluginCall?
    private var operation = ""
    private var operationTimer: Timer?
    private var scanTimer: Timer?
    private var watchdog: Timer?
    private var picker: UIAlertController?
    private var backgroundObserver: NSObjectProtocol?
    private var packetCount = 0
    private var scanning = false

    public override func load() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.finish("page-hidden") }
    }
    deinit {
        if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
        operationTimer?.invalidate()
        scanTimer?.invalidate()
        watchdog?.invalidate()
    }
    private func uuid(_ value: CBUUID) -> String {
        let text = value.uuidString.lowercased()
        if text.count == 4 { return "0000" + text + "-0000-1000-8000-00805f9b34fb" }
        if text.count == 8 { return text + "-0000-1000-8000-00805f9b34fb" }
        return text
    }
    private func validUUID(_ value: String) -> Bool {
        value.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options: .regularExpression) != nil &&
            !value.contains("-1212-efde-1523-785feabcd123")
    }
    private func begin(_ call: CAPPluginCall, _ kind: String, seconds: TimeInterval = 8) -> Bool {
        guard pending == nil else { call.reject("Another Bluetooth operation is active.", "InvalidStateError"); return false }
        pending = call
        operation = kind
        operationTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.finish("operation-timeout")
        }
        return true
    }
    private func resolve(_ data: [String: Any] = [:]) {
        operationTimer?.invalidate()
        operationTimer = nil
        let call = pending
        pending = nil
        operation = ""
        call?.resolve(data)
    }
    private func finish(_ reason: String) {
        manager?.stopScan()
        scanning = false
        scanTimer?.invalidate()
        watchdog?.invalidate()
        operationTimer?.invalidate()
        picker?.dismiss(animated: true)
        picker = nil
        let call = pending
        pending = nil
        operation = ""
        let peripheral = active ?? selected
        active = nil
        selected = nil
        inspectedService = nil
        subscribed = nil
        informationRead = nil
        peers.removeAll()
        let errorCode: String
        switch reason {
        case "operation-timeout", "native-deadline": errorCode = "TimeoutError"
        case "no-matching-devices", "service-not-found": errorCode = "NotFoundError"
        case "bluetooth-unavailable":
            if manager?.state == .unauthorized { errorCode = "SecurityError" }
            else if manager?.state == .unsupported { errorCode = "NotSupportedError" }
            else { errorCode = "InvalidStateError" }
        case "selection-unavailable": errorCode = "InvalidStateError"
        case "connection-failed", "unexpected", "characteristic-discovery-failed", "subscription-failed", "services-changed":
            errorCode = "NetworkError"
        case "invalid-notification": errorCode = "NotSupportedError"
        default: errorCode = "AbortError"
        }
        if let peripheral = peripheral {
            manager?.cancelPeripheralConnection(peripheral)
            notifyListeners("disconnected", data: ["id": peripheral.identifier.uuidString, "reason": reason, "errorCode": errorCode])
        }
        call?.reject("Bluetooth inspection ended: " + reason, errorCode)
    }
    @objc public func requestDevice(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.active == nil, self.selected == nil,
                  let service = call.getString("service")?.lowercased(), self.validUUID(service),
                  let prefix = call.getString("namePrefix"), prefix.count <= 60,
                  call.getBool("showAllDevices") == true || !prefix.trimmingCharacters(in: .whitespaces).isEmpty
            else { call.reject("Choose an identified service and a device name filter.", "InvalidStateError"); return }
            guard self.begin(call, "choose", seconds: 40) else { return }
            self.configuredService = service
            self.prefix = prefix
            self.showAll = call.getBool("showAllDevices") ?? false
            self.peers.removeAll()
            if self.manager == nil { self.manager = CBCentralManager(delegate: self, queue: .main) }
            else { self.startScanWhenReady() }
        }
    }
    private func startScanWhenReady() {
        guard operation == "choose", !scanning, let manager = manager else { return }
        if manager.state == .unknown || manager.state == .resetting { return }
        guard manager.state == .poweredOn else { finish("bluetooth-unavailable"); return }
        scanning = true
        manager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        scanTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in self?.showPicker() }
    }
    private func showPicker() {
        manager?.stopScan()
        guard operation == "choose", let controller = bridge?.viewController,
              controller.presentedViewController == nil else { finish("selection-unavailable"); return }
        guard !peers.isEmpty else { finish("no-matching-devices"); return }
        let alert = UIAlertController(title: "Choose your device", message: "Sasori inspects only the sourced service in your selected profile.", preferredStyle: .actionSheet)
        picker = alert
        for (index, peripheral) in peers.enumerated() {
            alert.addAction(UIAlertAction(title: String(index + 1) + " · " + (peripheral.name ?? "Unnamed device"), style: .default) { [weak self] _ in
                guard let self = self, self.operation == "choose" else { return }
                self.selected = peripheral
                self.picker = nil
                self.resolve(["id": peripheral.identifier.uuidString, "name": peripheral.name ?? "Selected BLE device"])
            })
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in self?.finish("selection-cancelled") })
        if let popover = alert.popoverPresentationController {
            popover.sourceView = controller.view
            popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
        }
        controller.present(alert, animated: true)
    }
    @objc public func connect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.selected, peripheral.identifier.uuidString == call.getString("id"),
                  self.manager?.state == .poweredOn, self.active == nil else {
                call.reject("Select your device again.", "InvalidStateError"); return
            }
            guard self.begin(call, "connect") else { return }
            self.active = peripheral
            peripheral.delegate = self
            self.packetCount = 0
            self.manager?.connect(peripheral)
        }
    }
    @objc public func getService(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  call.getString("uuid")?.lowercased() == self.configuredService else {
                call.reject("Only the selected profile service is available.", "InvalidStateError"); return
            }
            guard self.begin(call, "service") else { return }
            peripheral.discoverServices([CBUUID(string: self.configuredService)])
        }
    }
    @objc public func getCharacteristics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  let service = self.inspectedService,
                  call.getString("service")?.lowercased() == self.configuredService else {
                call.reject("Inspect the selected service first.", "InvalidStateError"); return
            }
            guard self.begin(call, "characteristics") else { return }
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }
    @objc public func readInformation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  self.configuredService == self.informationService,
                  let requested = call.getString("uuid")?.lowercased(), self.informationFields.contains(requested),
                  let characteristic = self.inspectedService?.characteristics?.first(where: { self.uuid($0.uuid) == requested }),
                  characteristic.properties.contains(.read) else {
                call.reject("Only observed model, manufacturer, and revision strings can be read.", "NotSupportedError"); return
            }
            guard self.begin(call, "read-information") else { return }
            self.informationRead = characteristic
            peripheral.readValue(for: characteristic)
        }
    }
    @objc public func startNotifications(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"), self.subscribed == nil,
                  let characteristic = self.inspectedService?.characteristics?.first(where: { self.uuid($0.uuid) == call.getString("uuid") }),
                  characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) else {
                call.reject("An observed Notify or Indicate endpoint is required.", "NotSupportedError"); return
            }
            guard self.begin(call, "subscribe") else { return }
            self.subscribed = characteristic
            peripheral.setNotifyValue(true, for: characteristic)
        }
    }
    @objc public func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.finish("user"); call.resolve() }
    }
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn { startScanWhenReady() }
        else if central.state != .unknown && central.state != .resetting { finish("bluetooth-unavailable") }
    }
    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard operation == "choose", peers.count < 30 else { return }
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? ""
        if (showAll || name.hasPrefix(prefix)) && !peers.contains(where: { $0.identifier == peripheral.identifier }) { peers.append(peripheral) }
    }
    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard active?.identifier == peripheral.identifier, operation == "connect" else { central.cancelPeripheralConnection(peripheral); return }
        watchdog = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in self?.finish("native-deadline") }
        resolve()
    }
    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        if active?.identifier == peripheral.identifier { finish("connection-failed") }
    }
    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if active?.identifier == peripheral.identifier { finish("unexpected") }
    }
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard active?.identifier == peripheral.identifier, operation == "service" else { return }
        guard error == nil, let service = peripheral.services?.first(where: { uuid($0.uuid) == configuredService }) else { finish("service-not-found"); return }
        inspectedService = service
        resolve(["uuid": uuid(service.uuid)])
    }
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard active?.identifier == peripheral.identifier, operation == "characteristics", uuid(service.uuid) == configuredService else { return }
        guard error == nil, let characteristics = service.characteristics, characteristics.count <= 128 else { finish("characteristic-discovery-failed"); return }
        resolve(["characteristics": characteristics.map { item -> [String: Any] in
            let properties: [(String, CBCharacteristicProperties)] = [("read", .read), ("write", .write), ("writeWithoutResponse", .writeWithoutResponse), ("notify", .notify), ("indicate", .indicate)]
            return ["uuid": uuid(item.uuid), "properties": properties.filter { item.properties.contains($0.1) }.map { $0.0 }]
        }])
    }
    public func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard active?.identifier == peripheral.identifier, operation == "subscribe", subscribed === characteristic else { return }
        if error != nil || !characteristic.isNotifying { finish("subscription-failed") }
        else { resolve() }
    }
    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if active?.identifier == peripheral.identifier, operation == "read-information", informationRead === characteristic {
            informationRead = nil
            guard error == nil, let value = characteristic.value, value.count <= 512 else {
                operationTimer?.invalidate()
                operationTimer = nil
                let call = pending
                pending = nil
                operation = ""
                call?.reject("Device information is unavailable or exceeds 512 bytes.", "NotSupportedError")
                return
            }
            resolve(["hex": value.map { String(format: "%02x", $0) }.joined()])
            return
        }
        guard active?.identifier == peripheral.identifier, subscribed === characteristic else { return }
        guard error == nil, let value = characteristic.value, value.count <= 4096 else { finish("invalid-notification"); return }
        packetCount += 1
        guard packetCount <= 500 else { finish("packet-limit"); return }
        notifyListeners("notification", data: ["id": peripheral.identifier.uuidString, "uuid": uuid(characteristic.uuid),
            "hex": value.map { String(format: "%02x", $0) }.joined()])
    }
    public func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
        if active?.identifier == peripheral.identifier { finish("services-changed") }
    }
    @objc public func shareFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let name = call.getString("name"),
                  name.range(of: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\\.(json|txt)$", options: .regularExpression) != nil,
                  let text = call.getString("text"), let data = text.data(using: .utf8), data.count <= 13 * 1024 * 1024,
                  let controller = self.bridge?.viewController, controller.presentedViewController == nil else {
                call.reject("Unsupported export or another dialog is open."); return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(name)
                try data.write(to: file, options: [.atomic, .completeFileProtection])
                let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                share.completionWithItemsHandler = { _, completed, _, _ in
                    try? FileManager.default.removeItem(at: directory)
                    call.resolve(["shared": completed])
                }
                if let popover = share.popoverPresentationController {
                    popover.sourceView = controller.view
                    popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                }
                controller.present(share, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("Export could not be prepared.")
            }
        }
    }
}
