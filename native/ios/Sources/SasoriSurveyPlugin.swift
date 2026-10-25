import Foundation
import UIKit
import CoreBluetooth
import Capacitor

// Advertisement observations only. This plugin never connects to a peripheral.
@objc(SasoriSurveyPlugin)
public class SasoriSurveyPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate {
    public let identifier = "SasoriSurveyPlugin"
    public let jsName = "SasoriSurvey"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startSurvey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSurvey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSurvey", returnType: CAPPluginReturnPromise)
    ]
    private struct Observation {
        var alias: String
        var rssi: Int
        var minRssi: Int
        var maxRssi: Int
        var samples: Int
        var history: [[String: Int]]
        var name: String
        var services: [String]
    }
    private var manager: CBCentralManager?
    private var state = "idle"
    private var reason = ""
    private var sessionId = ""
    private var started = ProcessInfo.processInfo.systemUptime
    private var ended: TimeInterval?
    private var timer: Timer?
    private var backgroundObserver: NSObjectProtocol?
    private var observations: [UUID: Observation] = [:]
    private var count = 0
    public override func load() {
        backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.finish("page-hidden")
        }
    }
    deinit {
        timer?.invalidate()
        manager?.stopScan()
        if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
    }
    private func elapsed() -> Int {
        return max(0, Int(((ended ?? ProcessInfo.processInfo.systemUptime) - started) * 1000))
    }
    @discardableResult private func enforceDeadline() -> Bool {
        if (state == "starting" || state == "scanning") && ProcessInfo.processInfo.systemUptime - started >= 30 {
            finish("deadline")
            return true
        }
        return false
    }
    private func snapshot() -> [String: Any] {
        let devices: [[String: Any]] = observations.values.sorted { $0.alias < $1.alias }.map {
            ["alias": $0.alias, "rssi": $0.rssi, "minRssi": $0.minRssi, "maxRssi": $0.maxRssi, "samples": $0.samples, "history": $0.history, "name": $0.name, "services": $0.services]
        }
        return ["sessionId": sessionId, "state": state, "reason": reason, "durationMs": elapsed(), "devices": devices]
    }
    private func finish(_ value: String) {
        guard state == "starting" || state == "scanning" else { return }
        manager?.stopScan()
        timer?.invalidate()
        timer = nil
        ended = ProcessInfo.processInfo.systemUptime
        state = "stopped"
        reason = value
    }
    @objc public func startSurvey(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Survey unavailable."); return }
            guard self.state != "starting" && self.state != "scanning" else { call.reject("Survey already active."); return }
            guard let token = call.getString("sessionId"), UUID(uuidString: token) != nil else { call.reject("Invalid session."); return }
            self.sessionId = token
            self.observations.removeAll()
            self.count = 0
            self.started = ProcessInfo.processInfo.systemUptime
            self.ended = nil
            self.state = "starting"
            self.reason = ""
            let deadline = Timer(timeInterval: 30, repeats: false) { [weak self] _ in self?.finish("deadline") }
            self.timer = deadline
            RunLoop.main.add(deadline, forMode: .common)
            if let central = self.manager { self.centralManagerDidUpdateState(central) }
            else { self.manager = CBCentralManager(delegate: self, queue: .main) }
            call.resolve(self.snapshot())
        }
    }
    @objc public func getSurvey(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, call.getString("sessionId") == self.sessionId else { call.reject("Expired survey."); return }
            self.enforceDeadline()
            call.resolve(self.snapshot())
        }
    }
    @objc public func stopSurvey(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            if call.getString("sessionId") == self.sessionId { self.finish("user") }
            call.resolve()
        }
    }
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard !enforceDeadline() else { return }
        if central.state == .poweredOn && state == "starting" {
            state = "scanning"
            central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        } else if central.state != .poweredOn && central.state != .unknown && central.state != .resetting {
            finish("bluetooth-unavailable")
        }
    }
    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard !enforceDeadline() else { return }
        guard state == "scanning", RSSI.intValue >= -127, RSSI.intValue <= 0 else { return }
        let now = elapsed(), value = RSSI.intValue
        if observations[peripheral.identifier] == nil {
            guard observations.count < 60 else { finish("observation-limit"); return }
            observations[peripheral.identifier] = Observation(alias: "signal-\(observations.count + 1)", rssi: value, minRssi: value, maxRssi: value, samples: 0, history: [], name: "", services: [])
        }
        guard var entry = observations[peripheral.identifier] else { return }
        entry.rssi = value
        entry.minRssi = min(entry.minRssi, value)
        entry.maxRssi = max(entry.maxRssi, value)
        entry.samples += 1
        if let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String { entry.name = String(name.prefix(60)) }
        if let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] { entry.services = Array(services.prefix(12)).map { $0.uuidString.lowercased() } }
        if now - (entry.history.last?["elapsedMs"] ?? -500) >= 500 {
            entry.history.append(["elapsedMs": now, "rssi": value])
            if entry.history.count > 12 { entry.history.removeFirst() }
        }
        observations[peripheral.identifier] = entry
        count += 1
        if count >= 2000 { finish("observation-limit") }
    }
}
