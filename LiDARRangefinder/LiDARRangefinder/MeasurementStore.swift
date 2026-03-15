import Foundation
import SwiftUI
import Combine
import CryptoKit
import Security
@MainActor
final class MeasurementStore: ObservableObject {
    @Published private(set) var records: [MeasurementRecord] = []
    private let storageKey = "lidar_rangefinder_records"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let userDefaults = UserDefaults.standard
    private let iso8601Formatter = ISO8601DateFormatter()
    private let integritySigner = MeasurementIntegritySigner()

    init() {
        load()
    }

    func add(
        distance: Double,
        pitch: Double,
        roll: Double,
        qaLevel: QAPrecisionLevel,
        qaProfile: QATuningProfile,
        qaScore: Int
    ) {
        let record = MeasurementRecord(
            distanceMeters: distance,
            pitchDegrees: pitch,
            rollDegrees: roll,
            qaLevel: qaLevel,
            qaProfile: qaProfile,
            qaScore: qaScore
        )
        records.insert(sign(record), at: 0)
        persist()
    }

    func clearAll() {
        records.removeAll()
        persist()
    }

    func csvString() -> String {
        var rows = ["time,distance_m,pitch_deg,roll_deg,qa_level,qa_profile,qa_score"]
        for item in records {
            rows.append(
                "\(iso8601Formatter.string(from: item.createdAt)),\(item.distanceMeters),\(item.pitchDegrees),\(item.rollDegrees),\(item.qaLevel.rawValue),\(item.qaProfile.rawValue),\(item.qaScore)"
            )
        }
        return rows.joined(separator: "\n")
    }

    private func load() {
        guard let data = userDefaults.data(forKey: storageKey) else { return }
        do {
            let decoded = try decoder.decode([MeasurementRecord].self, from: data)
            var verifiedRecords: [MeasurementRecord] = []
            var shouldPersistMigration = false
            for item in decoded {
                if let signature = item.signature {
                    if integritySigner.verify(signature: signature, payload: item.integrityPayload) {
                        verifiedRecords.append(item)
                    } else {
                        // Drop tampered records instead of showing compromised data.
                        shouldPersistMigration = true
                    }
                } else {
                    // Legacy records are auto-migrated by attaching a signature.
                    verifiedRecords.append(sign(item))
                    shouldPersistMigration = true
                }
            }
            records = verifiedRecords
            if shouldPersistMigration {
                persist()
            }
        } catch {
            records = []
        }
    }

    private func persist() {
        do {
            let data = try encoder.encode(records)
            userDefaults.set(data, forKey: storageKey)
        } catch {
            // Ignore storage errors to keep app responsive.
        }
    }

    private func sign(_ record: MeasurementRecord) -> MeasurementRecord {
        let signature = integritySigner.sign(payload: record.integrityPayload)
        return record.withSignature(signature)
    }
}

private final class MeasurementIntegritySigner {
    private let keychainAccount = "lidar_rangefinder_measurement_hmac_key"
    private let fallbackDefaultsKey = "lidar_rangefinder_measurement_hmac_key_fallback"
    private let userDefaults = UserDefaults.standard

    private var keychainServiceName: String {
        (Bundle.main.bundleIdentifier ?? "buildmaster.lidar") + ".integrity"
    }

    func sign(payload: String) -> String {
        let keyData = loadOrCreateSigningKey()
        let key = SymmetricKey(data: keyData)
        let mac = HMAC<SHA256>.authenticationCode(for: Data(payload.utf8), using: key)
        return Data(mac).base64EncodedString()
    }

    func verify(signature: String, payload: String) -> Bool {
        sign(payload: payload) == signature
    }

    private func loadOrCreateSigningKey() -> Data {
        if let existing = readKeychainKey() {
            return existing
        }
        if let fallback = readFallbackKey() {
            _ = saveKeychainKey(fallback)
            return fallback
        }
        let generated = generateRandomKey()
        if !saveKeychainKey(generated) {
            userDefaults.set(generated.base64EncodedString(), forKey: fallbackDefaultsKey)
        } else {
            userDefaults.removeObject(forKey: fallbackDefaultsKey)
        }
        return generated
    }

    private func readFallbackKey() -> Data? {
        guard let encoded = userDefaults.string(forKey: fallbackDefaultsKey) else { return nil }
        return Data(base64Encoded: encoded)
    }

    private func generateRandomKey() -> Data {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        if status == errSecSuccess {
            return Data(bytes)
        }
        return Data(UUID().uuidString.utf8)
    }

    private func readKeychainKey() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainServiceName,
            kSecAttrAccount as String: keychainAccount,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data, !data.isEmpty else {
            return nil
        }
        return data
    }

    private func saveKeychainKey(_ data: Data) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainServiceName,
            kSecAttrAccount as String: keychainAccount
        ]
        let attrs: [String: Any] = [
            kSecValueData as String: data
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if updateStatus == errSecSuccess {
            return true
        }

        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        return addStatus == errSecSuccess
    }
}
