import Foundation

enum QAPrecisionLevel: String, Codable {
    case normal = "NORMAL"
    case precise = "PRECISE"
    case pro = "PRO"

    var displayName: String {
        switch self {
        case .normal:
            return "一般"
        case .precise:
            return "精準"
        case .pro:
            return "Pro 精準"
        }
    }
}

enum QATuningProfile: String, Codable, CaseIterable, Identifiable {
    case standard = "STANDARD"
    case strict = "STRICT"
    case ultra = "ULTRA"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .standard:
            return "標準"
        case .strict:
            return "嚴格"
        case .ultra:
            return "超嚴格"
        }
    }
}

enum AIAutoCorrectionStrategy: String, Codable, CaseIterable, Identifiable {
    case stableFirst = "STABLE_FIRST"
    case speedFirst = "SPEED_FIRST"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .stableFirst:
            return "穩定優先"
        case .speedFirst:
            return "速度優先"
        }
    }
}

struct MeasurementRecord: Identifiable, Codable {
    let id: UUID
    let createdAt: Date
    let distanceMeters: Double
    let pitchDegrees: Double
    let rollDegrees: Double
    let qaLevel: QAPrecisionLevel
    let qaProfile: QATuningProfile
    let qaScore: Int
    let blueprintLocked: Bool
    let blueprintScore: Int
    let akiModeEnabled: Bool

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        distanceMeters: Double,
        pitchDegrees: Double,
        rollDegrees: Double,
        qaLevel: QAPrecisionLevel,
        qaProfile: QATuningProfile,
        qaScore: Int,
        blueprintLocked: Bool,
        blueprintScore: Int,
        akiModeEnabled: Bool
    ) {
        self.id = id
        self.createdAt = createdAt
        self.distanceMeters = distanceMeters
        self.pitchDegrees = pitchDegrees
        self.rollDegrees = rollDegrees
        self.qaLevel = qaLevel
        self.qaProfile = qaProfile
        self.qaScore = qaScore
        self.blueprintLocked = blueprintLocked
        self.blueprintScore = blueprintScore
        self.akiModeEnabled = akiModeEnabled
    }

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt
        case distanceMeters
        case pitchDegrees
        case rollDegrees
        case qaLevel
        case qaProfile
        case qaScore
        case blueprintLocked
        case blueprintScore
        case akiModeEnabled
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        distanceMeters = try container.decode(Double.self, forKey: .distanceMeters)
        pitchDegrees = try container.decode(Double.self, forKey: .pitchDegrees)
        rollDegrees = try container.decode(Double.self, forKey: .rollDegrees)
        qaLevel = try container.decodeIfPresent(QAPrecisionLevel.self, forKey: .qaLevel) ?? .normal
        qaProfile = try container.decodeIfPresent(QATuningProfile.self, forKey: .qaProfile) ?? .standard
        qaScore = try container.decodeIfPresent(Int.self, forKey: .qaScore) ?? 0
        blueprintLocked = try container.decodeIfPresent(Bool.self, forKey: .blueprintLocked) ?? false
        blueprintScore = try container.decodeIfPresent(Int.self, forKey: .blueprintScore) ?? 0
        akiModeEnabled = try container.decodeIfPresent(Bool.self, forKey: .akiModeEnabled) ?? true
    }
}

struct AICorrectionRecord: Identifiable, Codable {
    let id: UUID
    let createdAt: Date
    let issueSummary: String
    let actionSummary: String
    let beforeScore: Int
    let afterScore: Int
    let beforeLevel: QAPrecisionLevel
    let afterLevel: QAPrecisionLevel
    let beforeProfile: QATuningProfile
    let afterProfile: QATuningProfile

    var deltaScore: Int {
        afterScore - beforeScore
    }

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        issueSummary: String,
        actionSummary: String,
        beforeScore: Int,
        afterScore: Int,
        beforeLevel: QAPrecisionLevel,
        afterLevel: QAPrecisionLevel,
        beforeProfile: QATuningProfile,
        afterProfile: QATuningProfile
    ) {
        self.id = id
        self.createdAt = createdAt
        self.issueSummary = issueSummary
        self.actionSummary = actionSummary
        self.beforeScore = beforeScore
        self.afterScore = afterScore
        self.beforeLevel = beforeLevel
        self.afterLevel = afterLevel
        self.beforeProfile = beforeProfile
        self.afterProfile = afterProfile
    }
}
