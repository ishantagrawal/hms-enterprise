import Capacitor
import CoreBluetooth
import UIKit

@objc(AttendanceBlePlugin)
public class AttendanceBlePlugin: CAPPlugin, CAPBridgedPlugin, CBPeripheralManagerDelegate {
    public let identifier = "AttendanceBlePlugin"
    public let jsName = "HardwareAuth"
    public let pluginMethods = [
        CAPPluginMethod(name: "startBleAdvertising", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBleAdvertising", returnType: CAPPluginReturnPromise)
    ]

    private var peripheralManager: CBPeripheralManager?
    private var pendingStartCall: CAPPluginCall?
    private var pendingServiceUUID: CBUUID?
    private var backgroundObserver: NSObjectProtocol?

    override public func load() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stopAdvertisingForBackground()
        }
    }

    deinit {
        if let backgroundObserver {
            NotificationCenter.default.removeObserver(backgroundObserver)
        }
        peripheralManager?.stopAdvertising()
    }

    @objc public func startBleAdvertising(_ call: CAPPluginCall) {
        guard let value = call.getString("uuid"), let uuid = UUID(uuidString: value) else {
            call.reject("A valid 128-bit attendance service UUID is required.")
            return
        }

        DispatchQueue.main.async {
            self.pendingStartCall?.reject("Attendance advertising was replaced by a newer request.")
            self.pendingStartCall = call
            self.pendingServiceUUID = CBUUID(string: uuid.uuidString)

            if self.peripheralManager == nil {
                self.peripheralManager = CBPeripheralManager(
                    delegate: self,
                    queue: .main,
                    options: [CBPeripheralManagerOptionShowPowerAlertKey: true]
                )
            } else if self.peripheralManager?.state == .poweredOn {
                self.beginAdvertising()
            } else {
                self.rejectIfBluetoothUnavailable()
            }
        }
    }

    @objc public func stopBleAdvertising(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.peripheralManager?.stopAdvertising()
            self.pendingServiceUUID = nil
            self.pendingStartCall?.reject("Attendance advertising was stopped.")
            self.pendingStartCall = nil
            call.resolve(["advertising": false])
        }
    }

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            if pendingStartCall != nil {
                beginAdvertising()
            }
        } else {
            rejectIfBluetoothUnavailable()
        }
    }

    public func peripheralManagerDidStartAdvertising(
        _ peripheral: CBPeripheralManager,
        error: Error?
    ) {
        guard let call = pendingStartCall else { return }
        pendingStartCall = nil

        if let error {
            pendingServiceUUID = nil
            call.reject("The attendance service UUID could not be advertised.", nil, error)
            return
        }
        call.resolve(["advertising": true])
    }

    private func beginAdvertising() {
        guard let peripheralManager, let serviceUUID = pendingServiceUUID else {
            pendingStartCall?.reject("The attendance service UUID is unavailable.")
            pendingStartCall = nil
            return
        }
        guard peripheralManager.state == .poweredOn else {
            rejectIfBluetoothUnavailable()
            return
        }

        peripheralManager.stopAdvertising()
        peripheralManager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID]
        ])
    }

    private func rejectIfBluetoothUnavailable() {
        guard let call = pendingStartCall, let peripheralManager else { return }
        switch peripheralManager.state {
        case .unauthorized:
            call.reject("Bluetooth permission is denied. Allow Bluetooth access in Settings.")
        case .unsupported:
            call.reject("This iPhone does not support Bluetooth peripheral advertising.")
        case .poweredOff:
            call.reject("Turn on Bluetooth to advertise attendance.")
        case .resetting, .unknown:
            return
        @unknown default:
            call.reject("Bluetooth is unavailable.")
        }
        if peripheralManager.state != .resetting && peripheralManager.state != .unknown {
            pendingStartCall = nil
            pendingServiceUUID = nil
        }
    }

    private func stopAdvertisingForBackground() {
        peripheralManager?.stopAdvertising()
        pendingStartCall?.reject("Attendance advertising requires the app to remain in the foreground.")
        pendingStartCall = nil
        pendingServiceUUID = nil
    }
}

class AttendanceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AttendanceBlePlugin())
    }
}
