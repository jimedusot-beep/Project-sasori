import Foundation
import UIKit
import CoreBluetooth
import Capacitor

// Inspection and a separate fixed standard-control mode. No arbitrary write or firmware API.
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
        CAPPluginMethod(name: "readStandard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alertStandard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mipCommand", returnType: CAPPluginReturnPromise),
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
    private let batteryService = "0000180f-0000-1000-8000-00805f9b34fb"
    private let batteryLevel = "00002a19-0000-1000-8000-00805f9b34fb"
    private let alertService = "00001802-0000-1000-8000-00805f9b34fb"
    private let alertLevel = "00002a06-0000-1000-8000-00805f9b34fb"
    private let mipRxService = "0000ffe0-0000-1000-8000-00805f9b34fb"
    private let mipTxService = "0000ffe5-0000-1000-8000-00805f9b34fb"
    private let mipRx = "0000ffe4-0000-1000-8000-00805f9b34fb"
    private let mipTx = "0000ffe9-0000-1000-8000-00805f9b34fb"
    private var mipControls = false
    private var mipLedActive = false
    private var mipTimer: Timer?
    private var controlMode: Bool { standardControls || mipControls }
    private var standardControls = false
    private var standardServices: [String: CBService] = [:]
    private var rememberedId = ""
    private var alertTimer: Timer?
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
        alertTimer?.invalidate()
        alertTimer = nil
        watchdog?.invalidate()
        mipTimer?.invalidate()
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
    private func rejectOperation(_ message: String, _ code: String) {
        operationTimer?.invalidate()
        operationTimer = nil
        let call = pending
        pending = nil
        operation = ""
        call?.reject(message, code)
    }
    private func finish(_ reason: String) {
        if mipLedActive, let peripheral = active, peripheral.state == .connected, peripheral.canSendWriteWithoutResponse,
           let characteristic = standardServices[mipTxService]?.characteristics?.first(where: { uuid($0.uuid) == mipTx }) {
            peripheral.writeValue(Data([0x84, 0, 0, 0]), for: characteristic, type: .withoutResponse)
        }
        mipTimer?.invalidate()
        mipTimer = nil
        mipLedActive = false
        manager?.stopScan()
        scanning = false
        scanTimer?.invalidate()
        alertTimer?.invalidate()
        alertTimer = nil
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
        standardServices.removeAll()
        rememberedId = ""
        standardControls = false
        mipControls = false
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
        case "connection-failed", "unexpected", "service-discovery-failed", "alert-clear-failed", "characteristic-discovery-failed", "subscription-failed", "services-changed":
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
            self.standardControls = call.getBool("standardControls") == true
            self.mipControls = call.getBool("mipControls") == true
            if self.standardControls && self.mipControls || self.mipControls && service != self.mipRxService {
                self.rejectOperation("Choose one fixed device control family.", "NotSupportedError")
                return
            }
            if self.standardControls && service != self.informationService {
                self.rejectOperation("Standard controls use only the fixed SIG services.", "NotSupportedError")
                return
            }
            self.standardServices.removeAll()
            self.rememberedId = self.controlMode ? (call.getString("rememberedId") ?? "") : ""
            if self.rememberedId.count > 256 {
                self.rejectOperation("Invalid saved device reference.", "InvalidStateError")
                return
            }
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
        if controlMode, let id = UUID(uuidString: rememberedId),
           let known = manager.retrievePeripherals(withIdentifiers: [id]).first {
            selected = known
            resolve(["id": known.identifier.uuidString, "name": known.name ?? "Saved Bluetooth device"])
            return
        }
        scanning = true
        manager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        scanTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in self?.showPicker() }
    }
    private func showPicker() {
        manager?.stopScan()
        guard operation == "choose", let controller = bridge?.viewController,
              controller.presentedViewController == nil else { finish("selection-unavailable"); return }
        guard !peers.isEmpty else { finish("no-matching-devices"); return }
        let alert = UIAlertController(title: "Choose your device", message: mipControls ? "Choose your original WowWee MiP. This adapter uses only version/status queries and a bounded chest LED action." : standardControls ? "Sasori checks model information, battery, and optional standard alert controls." : "Sasori inspects only the sourced service in your selected profile.", preferredStyle: .actionSheet)
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
                  let requested = call.getString("uuid")?.lowercased(),
                  self.mipControls ? [self.mipRxService, self.mipTxService].contains(requested) : self.standardControls ? [self.informationService, self.batteryService, self.alertService].contains(requested) : requested == self.configuredService else {
                call.reject("Only the selected profile or fixed standard services are available.", "InvalidStateError"); return
            }
            guard self.begin(call, "service") else { return }
            self.configuredService = requested
            peripheral.discoverServices([CBUUID(string: requested)])
        }
    }
    @objc public func getCharacteristics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  let requested = call.getString("service")?.lowercased(),
                  let service = self.controlMode ? self.standardServices[requested] : self.inspectedService,
                  self.uuid(service.uuid) == requested,
                  self.controlMode || requested == self.configuredService else {
                call.reject("Inspect the selected service first.", "InvalidStateError"); return
            }
            guard self.begin(call, "characteristics") else { return }
            self.configuredService = requested
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }
    @objc public func readInformation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  !self.controlMode, self.configuredService == self.informationService,
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
    @objc public func readStandard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.standardControls, let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  let service = call.getString("service")?.lowercased(),
                  let requested = call.getString("uuid")?.lowercased(),
                  (service == self.informationService && self.informationFields.contains(requested)) ||
                  (service == self.batteryService && requested == self.batteryLevel),
                  let characteristic = self.standardServices[service]?.characteristics?.first(where: { self.uuid($0.uuid) == requested }),
                  characteristic.properties.contains(.read) else {
                call.reject("Only observed standard battery and model fields can be read.", "NotSupportedError"); return
            }
            guard self.begin(call, "read-information") else { return }
            self.informationRead = characteristic
            peripheral.readValue(for: characteristic)
        }
    }
    @objc public func alertStandard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.standardControls, self.pending == nil, let peripheral = self.active,
                  peripheral.state == .connected, peripheral.identifier.uuidString == call.getString("id"),
                  let level = call.getInt("level"), level == 0 || level == 1,
                  let characteristic = self.standardServices[self.alertService]?.characteristics?.first(where: { self.uuid($0.uuid) == self.alertLevel }),
                  characteristic.properties.contains(.writeWithoutResponse) else {
                call.reject("Only an observed standard no-alert / mild-alert control is available.", "NotSupportedError"); return
            }
            guard peripheral.canSendWriteWithoutResponse else {
                if level == 0 { self.finish("alert-clear-failed") }
                call.reject("The Bluetooth write queue is busy.", "NetworkError"); return
            }
            self.alertTimer?.invalidate()
            self.alertTimer = nil
            peripheral.writeValue(Data([UInt8(level)]), for: characteristic, type: .withoutResponse)
            if level == 1 {
                self.alertTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self, weak peripheral] _ in
                    guard let self = self, let peripheral = peripheral, self.active === peripheral, peripheral.state == .connected else { return }
                    if peripheral.canSendWriteWithoutResponse {
                        peripheral.writeValue(Data([0]), for: characteristic, type: .withoutResponse)
                        self.alertTimer = nil
                    } else { self.finish("alert-clear-failed") }
                }
            }
            call.resolve(["queued": true, "acknowledged": false])
        }
    }
    @objc public func mipCommand(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.mipControls, self.pending == nil, let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"),
                  let command = call.getString("command"),
                  let characteristic = self.standardServices[self.mipTxService]?.characteristics?.first(where: { self.uuid($0.uuid) == self.mipTx }),
                  characteristic.properties.contains(.writeWithoutResponse) else {
                call.reject("An observed MiP write channel is required.", "NotSupportedError"); return
            }
            let bytes: [UInt8]
            switch command {
            case "identify": bytes = [0x14]
            case "status": bytes = [0x79]
            case "alert": bytes = [0x84, 0, 0, 32]
            case "clear": bytes = [0x84, 0, 0, 0]
            default: call.reject("Unsupported MiP command.", "NotSupportedError"); return
            }
            guard peripheral.canSendWriteWithoutResponse else {
                if command == "clear" { self.finish("alert-clear-failed") }
                call.reject("The MiP Bluetooth queue is busy.", "NetworkError"); return
            }
            peripheral.writeValue(Data(bytes), for: characteristic, type: .withoutResponse)
            if command == "alert" || command == "clear" {
                self.mipTimer?.invalidate()
                self.mipLedActive = command == "alert"
                if self.mipLedActive {
                    self.mipTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self, weak peripheral] _ in
                        guard let self = self, let peripheral = peripheral, self.mipControls, self.active === peripheral, self.mipLedActive else { return }
                        if peripheral.state == .connected && peripheral.canSendWriteWithoutResponse {
                            peripheral.writeValue(Data([0x84, 0, 0, 0]), for: characteristic, type: .withoutResponse)
                            self.mipLedActive = false
                            self.mipTimer = nil
                        } else { self.finish("alert-clear-failed") }
                    }
                }
            }
            call.resolve(["queued": true, "acknowledged": false])
        }
    }
    @objc public func startNotifications(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let peripheral = self.active, peripheral.state == .connected,
                  peripheral.identifier.uuidString == call.getString("id"), !self.standardControls, self.subscribed == nil,
                  let characteristic = (self.mipControls ? self.standardServices[self.mipRxService] : self.inspectedService)?.characteristics?.first(where: { self.uuid($0.uuid) == call.getString("uuid") && (!self.mipControls || self.uuid($0.uuid) == self.mipRx) }),
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
        watchdog = Timer.scheduledTimer(withTimeInterval: controlMode ? 300 : 30, repeats: false) { [weak self] _ in self?.finish("native-deadline") }
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
        guard error == nil else { finish("service-discovery-failed"); return }
        guard let service = peripheral.services?.first(where: { uuid($0.uuid) == configuredService }) else {
            if controlMode { rejectOperation("Control-family service not exposed by this device.", "NotFoundError") }
            else { finish("service-not-found") }
            return
        }
        if controlMode { standardServices[uuid(service.uuid)] = service }
        else { inspectedService = service }
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
