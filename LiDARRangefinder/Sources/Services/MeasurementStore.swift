import Foundation

@MainActor
final class MeasurementStore: ObservableObject {
    @Published private(set) var records: [MeasurementRecord] = []

    private let storageKey = "lidar_rangefinder_records"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        load()
    }

    func add(
        distance: Double,
        pitch: Double,
        roll: Double,
        qaLevel: QAPrecisionLevel,
        qaProfile: QATuningProfile,
        qaScore: Int,
        blueprintLocked: Bool,
        blueprintScore: Int,
        akiModeEnabled: Bool
    ) {
        let record = MeasurementRecord(
            distanceMeters: distance,
            pitchDegrees: pitch,
            rollDegrees: roll,
            qaLevel: qaLevel,
            qaProfile: qaProfile,
            qaScore: qaScore,
            blueprintLocked: blueprintLocked,
            blueprintScore: blueprintScore,
            akiModeEnabled: akiModeEnabled
        )
        records.insert(record, at: 0)
        persist()
    }

    func clearAll() {
        records.removeAll()
        persist()
    }

    func csvString() -> String {
        var rows = ["time,distance_m,pitch_deg,roll_deg,qa_level,qa_profile,qa_score,blueprint_locked,blueprint_score,aki_mode"]
        let formatter = ISO8601DateFormatter()
        for item in records {
            rows.append(
                "\(formatter.string(from: item.createdAt)),\(item.distanceMeters),\(item.pitchDegrees),\(item.rollDegrees),\(item.qaLevel.rawValue),\(item.qaProfile.rawValue),\(item.qaScore),\(item.blueprintLocked),\(item.blueprintScore),\(item.akiModeEnabled)"
            )
        }
        return rows.joined(separator: "\n")
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }
        do {
            records = try decoder.decode([MeasurementRecord].self, from: data)
        } catch {
            records = []
        }
    }

    private func persist() {
        do {
            let data = try encoder.encode(records)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            // Ignore storage errors to keep app responsive.
        }
    }
}
