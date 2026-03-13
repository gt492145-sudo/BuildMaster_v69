import ARKit
import AVFoundation
import CoreImage
import CoreML
import Foundation
import Photos
import RealityKit
import Security
import Speech
import UIKit
import SwiftUI
import Combine
import Vision
private enum AIQAIssueType {
    case none
    case noSurface
    case unstable
    case tilt
    case insufficientSamples
    case lowScore
}

struct CrackFinding: Identifiable {
    let id = UUID()
    let box: CGRect
    let confidence: Double
    let lengthCm: Double
    let severity: String
}

struct QuantumTacticRecord: Identifiable, Codable {
    let id: UUID
    let createdAt: Date
    let source: String
    let command: String
    let beforeScore: Int
    let afterScore: Int
    let coreLevelAfter: Int
    let status: String

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        source: String,
        command: String,
        beforeScore: Int,
        afterScore: Int,
        coreLevelAfter: Int,
        status: String
    ) {
        self.id = id
        self.createdAt = createdAt
        self.source = source
        self.command = command
        self.beforeScore = beforeScore
        self.afterScore = afterScore
        self.coreLevelAfter = coreLevelAfter
        self.status = status
    }
}

private enum IFCElementKind: String, Codable {
    case wall
    case rebar
    case pipe
}

private struct IFCElementSpec: Codable {
    var type: IFCElementKind
    var width: Double?
    var height: Double?
    var depth: Double?
    var radius: Double?
    var length: Double?
    var x: Double?
    var y: Double?
    var z: Double?
    var rotationDeg: Double?
}

private struct IFCModelPayload: Codable {
    var projectName: String?
    var schemaVersion: String?
    var toleranceCm: Double?
    var elements: [IFCElementSpec]
}

struct TWDStakingPoint: Identifiable {
    let id = UUID()
    let name: String
    let localX: Double
    let localY: Double
    let localZ: Double
    let e: Double
    let n: Double
    let h: Double
}

enum HologramRenderMode: String, CaseIterable, Identifiable {
    case performance
    case showcase

    var id: String { rawValue }

    var title: String {
        switch self {
        case .performance:
            return "效能"
        case .showcase:
            return "展示"
        }
    }
}

enum FacadeRebuildMode: String, CaseIterable, Identifiable {
    case auto
    case lockPerformance
    case forceShowcase

    var id: String { rawValue }

    var title: String {
        switch self {
        case .auto:
            return "自動"
        case .lockPerformance:
            return "鎖定降載"
        case .forceShowcase:
            return "強制展示"
        }
    }
}

private struct LocalScheduleTask {
    let id: String
    let name: String
    let durationDays: Int
}

private struct FacadeHologramSnapshot {
    let anchorPosition: SIMD3<Float>?
    let scale: Float
    let yaw: Float
    let pitch: Float
    let roll: Float
    let renderMode: HologramRenderMode
}

private struct MultiViewSample {
    let image: UIImage
    let capturedAt: Date
}

@MainActor
final class LiDARSessionManager: ObservableObject {
    @Published var distanceText: String = "-- m"
    @Published var pitchText: String = "--°"
    @Published var rollText: String = "--°"
    @Published var statusText: String = "準備中"
    @Published var latestDistanceMeters: Double?
    @Published var latestPitchDegrees: Double = 0
    @Published var latestRollDegrees: Double = 0
    @Published var qaLevel: QAPrecisionLevel = .normal
    @Published var qaLevelText: String = "一般"
    @Published var qaProfile: QATuningProfile = .ultra
    @Published var qaScore: Int = 0
    @Published var aiDiagnosisText: String = "AI QA：初始化中"
    @Published var aiCorrectionText: String = "建議：請先鎖定量測目標"
    @Published var aiLastActionText: String = ""
    @Published var correctionHistory: [AICorrectionRecord] = []
    @Published var correctionTrendText: String = "AI 矯正趨勢：尚無資料"
    @Published var autoCorrectionEnabled: Bool = false
    @Published var autoCorrectionStatusText: String = "自動連續矯正：關"
    @Published var autoCorrectionStrategy: AIAutoCorrectionStrategy = .stableFirst
    @Published var aiAssistantText: String = "AI 助手：待命"
    @Published var aiAssistantSourceText: String = "來源：本地 AI"
    @Published var aiAssistantApplyResultText: String = "尚未套用建議"
    @Published var aiAssistantBusy: Bool = false
    @Published var aiCloudEnabled: Bool = false
    @Published var arPOCStatusText: String = "AR POC：等待影像錨點"
    @Published var arMismatchSummaryText: String = "AR 偏位檢核：待命"
    @Published var arMismatchAlerts: [String] = []
    @Published var highestModeLockEnabled: Bool = false
    @Published var rebarMainBarCount: Int = 4
    @Published var rebarStirrupSpacingCm: Double = 20
    @Published var rebarCoverCm: Double = 4
    @Published var overlayOffsetXcm: Double = 0
    @Published var overlayOffsetYcm: Double = 0
    @Published var overlayRotationDeg: Double = 0
    @Published var overlayScale: Double = 1
    @Published var rebarSpecText: String = "鋼筋規格：主筋 4｜箍筋 20cm｜保護層 4cm"
    @Published var volumeAreaWidthMeters: Double = 2.0
    @Published var volumeAreaLengthMeters: Double = 2.0
    @Published var volumeGridSize: Int = 5
    @Published var volumeAreaM2: Double = 4.0
    @Published var volumeEstimateM3: Double = 0
    @Published var volumeSampleCount: Int = 0
    @Published var volumeStatusText: String = "體積掃描：待命"
    @Published var volumeScanPreviewPoints: [SIMD2<Double>] = []
    @Published var blueprintInputImage: UIImage?
    @Published var blueprintUploadStatusText: String = "圖紙：尚未上傳"
    @Published var multiViewSampleCount: Int = 0
    @Published var multiViewStatusText: String = "多視角重建：尚未收集樣本"
    @Published var multiViewPackagePreviewLines: [String] = []
    @Published var ifcModelElementCount: Int = 0
    @Published var ifcModelSummaryText: String = "IFC 模型：尚未匯入"
    @Published var ifcShowWalls: Bool = true
    @Published var ifcShowRebars: Bool = true
    @Published var ifcShowPipes: Bool = true
    @Published var twd97BaseE: Double = 204000
    @Published var twd97BaseN: Double = 2_682_000
    @Published var twd97BaseH: Double = 0
    @Published var twd97RotationDeg: Double = 0
    @Published var twdStakingPoints: [TWDStakingPoint] = []
    @Published var twdStakingStatusText: String = "放樣：待命"
    @Published var twdStakingPreviewEnabled: Bool = false
    @Published var twdStakingPreviewStatusText: String = "放樣點顯示：關"
    @Published var blueprintQuickStakeStatusText: String = "圖紙快速放樣：待命"
    @Published var ifcSimulationEnabled: Bool = false
    @Published var ifcSimulationStatusText: String = "IFC 模擬：待命"
    @Published var facadeHologramEnabled: Bool = false
    @Published var facadeHologramStatusText: String = "立面全息：待命"
    @Published var facadeLifeModeEnabled: Bool = true
    @Published var facadeLifeModeStatusText: String = "生命感模式：開"
    @Published var hologramRenderMode: HologramRenderMode = .performance
    @Published var facadeRebuildMode: FacadeRebuildMode = .auto
    @Published var facadeSnapshotAvailable: Bool = false
    @Published var facadeQualityReportLines: [String] = []
    @Published var facadeRealismOverallScore: Int = 0
    @Published var facadeRealismTierText: String = "真實感：待命"
    @Published var facadeRealismBreakdownLines: [String] = []
    @Published var facadeRebuildReady: Bool = true
    @Published var facadeRebuildGuardText: String = "重建保護：就緒"
    @Published var ibmScheduleStatusText: String = "IBM 排程：待命"
    @Published var ibmSchedulePreviewLines: [String] = []
    @Published var meshVisualizationEnabled: Bool = false
    @Published var meshVisualizationStatusText: String = "網狀模式：關"
    @Published var crackInputImage: UIImage?
    @Published var crackFindings: [CrackFinding] = []
    @Published var crackStatusText: String = "裂縫檢測：待命"
    @Published var crackCalibrationCmPerPixel: Double = 0.08
    @Published var crackMaxLengthCm: Double = 0
    @Published var crackSeveritySummary: String = "無"
    @Published var quantumModeEnabled: Bool = false
    @Published var quantumCoreLevel: Int = 0
    @Published var quantumStatusText: String = "核心引擎：待命"
    @Published var quantumLastCommandText: String = ""
    @Published var quantumSuggestionText: String = "戰術建議：目前無需啟動"
    @Published var quantumVoiceListening: Bool = false
    @Published var quantumVoiceTranscript: String = ""
    @Published var quantumHistory: [QuantumTacticRecord] = []
    @Published var quantumIBMCloudEnabled: Bool = false
    @Published var quantumIBMProviderText: String = "雲端：本地模式"
    @Published var quantumIBMJobText: String = "IBM Job：尚未送出"
    @Published var quantumIBMResultText: String = "IBM Result：尚無資料"
    @Published var quantumIBMBackend: String = "ibm_kyiv"
    @Published var quantumIBMShots: Int = 128
    @Published var quantumFusionStatusText: String = "融合狀態：待命"
    @Published var highPrecisionContinuousModeEnabled: Bool = true
    @Published var highPrecisionStatusText: String = "高精度連續模式：待命"
    @Published var designTargetDistanceMeters: Double = 2.0
    @Published var deviationToleranceCm: Double = 3.0
    @Published var deviationValueCm: Double = 0
    @Published var deviationStatusText: String = "偏差檢核：待命"

    private weak var arView: ARView?
    private let ciContext = CIContext()
    private var updateTimer: Timer?
    private var isSessionSuspended = false
    private var recentDistances: [Double] = []
    private var recentRawDistances: [Double] = []
    private let qaProfileStorageKey = "lidar_rangefinder_qa_profile"
    private let aiCorrectionStorageKey = "lidar_rangefinder_ai_corrections"
    private let autoCorrectionStrategyStorageKey = "lidar_rangefinder_auto_correction_strategy"
    private let aiCloudEnabledStorageKey = "lidar_rangefinder_ai_cloud_enabled"
    private let aiOpenAIKeyStorageKey = "lidar_rangefinder_ai_openai_key"
    private let highestModeLockStorageKey = "lidar_rangefinder_highest_mode_lock"
    private let rebarMainBarCountStorageKey = "lidar_rangefinder_rebar_main_bar_count"
    private let rebarStirrupSpacingStorageKey = "lidar_rangefinder_rebar_stirrup_spacing_cm"
    private let rebarCoverStorageKey = "lidar_rangefinder_rebar_cover_cm"
    private let overlayOffsetXStorageKey = "lidar_rangefinder_overlay_offset_x_cm"
    private let overlayOffsetYStorageKey = "lidar_rangefinder_overlay_offset_y_cm"
    private let overlayRotationStorageKey = "lidar_rangefinder_overlay_rotation_deg"
    private let overlayScaleStorageKey = "lidar_rangefinder_overlay_scale"
    private let volumeAreaWidthStorageKey = "lidar_rangefinder_volume_area_width_m"
    private let volumeAreaLengthStorageKey = "lidar_rangefinder_volume_area_length_m"
    private let volumeGridSizeStorageKey = "lidar_rangefinder_volume_grid_size"
    private let crackCalibrationStorageKey = "lidar_rangefinder_crack_cm_per_pixel"
    private let quantumModeStorageKey = "lidar_rangefinder_quantum_mode_enabled"
    private let quantumHistoryStorageKey = "lidar_rangefinder_quantum_history"
    private let quantumIBMCloudEnabledStorageKey = "lidar_rangefinder_quantum_ibm_cloud_enabled"
    private let quantumIBMAPIKeyStorageKey = "lidar_rangefinder_quantum_ibm_api_key"
    private let quantumIBMBackendStorageKey = "lidar_rangefinder_quantum_ibm_backend"
    private let quantumIBMShotsStorageKey = "lidar_rangefinder_quantum_ibm_shots"
    private let highPrecisionContinuousModeStorageKey = "lidar_rangefinder_high_precision_continuous_mode"
    private let designTargetDistanceStorageKey = "lidar_rangefinder_design_target_distance_m"
    private let deviationToleranceStorageKey = "lidar_rangefinder_deviation_tolerance_cm"
    private let twd97BaseEStorageKey = "lidar_rangefinder_twd97_base_e"
    private let twd97BaseNStorageKey = "lidar_rangefinder_twd97_base_n"
    private let twd97BaseHStorageKey = "lidar_rangefinder_twd97_base_h"
    private let twd97RotationStorageKey = "lidar_rangefinder_twd97_rotation_deg"
    private let meshVisualizationStorageKey = "lidar_rangefinder_mesh_visualization_enabled"
    private let facadeLifeModeStorageKey = "lidar_rangefinder_facade_life_mode_enabled"
    private let hologramRenderModeStorageKey = "lidar_rangefinder_hologram_render_mode"
    private let facadeRebuildModeStorageKey = "lidar_rangefinder_facade_rebuild_mode"
    private var aiIssue: AIQAIssueType = .none
    private var pendingCorrectionEvaluation: PendingCorrectionEvaluation?
    private var autoCorrectionRoundsDone = 0
    private var overlayAnchorEntity: AnchorEntity?
    private var ifcSimulationAnchor: AnchorEntity?
    private var twdStakingPreviewAnchor: AnchorEntity?
    private var facadeHologramAnchor: AnchorEntity?
    private var facadeHologramRoot: Entity?
    private var facadeHologramScale: Float = 1.0
    private var facadeHologramYaw: Float = 0
    private var facadeHologramPitch: Float = 0
    private var facadeHologramRoll: Float = 0
    private var facadeLifePulseScale: Float = 1.0
    private var facadeLifeAnimationTimer: Timer?
    private var facadeLifeStartTime: TimeInterval = 0
    private var facadeScanBandEntity: ModelEntity?
    private var facadeCurrentHeight: Float = 1.4
    private var activeFacadeRenderMode: HologramRenderMode = .performance
    private var facadeAutoDowngradedForStability = false
    private var facadeSnapshotBeforeRebuild: FacadeHologramSnapshot?
    private var facadeRebuildCooldownTimer: Timer?
    private var facadeRebuildCooldownUntil: TimeInterval = 0
    private var facadeRebuildTapTimes: [TimeInterval] = []
    private var multiViewSamples: [MultiViewSample] = []
    private var cachedFacadeDepthVNModel: VNCoreMLModel?
    private var cachedFacadeDepthModelName: String?
    private var overlayImageName: String?
    private var ifcElements: [IFCElementSpec] = []
    private var overlayConfigSignature: String = ""
    private var overlayLostSince: TimeInterval?
    private var overlayLastUpdateTime: TimeInterval = 0
    private let overlayLostDebounceSec: TimeInterval = 0.4
    private let overlayUpdateIntervalSec: TimeInterval = 0.1
    private var lastQuantumTriggerImageName: String?
    private var lastQuantumTriggerAt: TimeInterval = 0
    private let quantumTriggerCooldownSec: TimeInterval = 10
    private var isBlueprintQuantumJobRunning = false
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-TW")) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    private var speechTask: SFSpeechRecognitionTask?
    private var speechTapInstalled = false

    init() {
        if let raw = UserDefaults.standard.string(forKey: qaProfileStorageKey),
           let profile = QATuningProfile(rawValue: raw) {
            qaProfile = profile
        } else {
            // Default to highest precision mode for first-time users.
            qaProfile = .ultra
            UserDefaults.standard.set(qaProfile.rawValue, forKey: qaProfileStorageKey)
        }
        if let raw = UserDefaults.standard.string(forKey: autoCorrectionStrategyStorageKey),
           let strategy = AIAutoCorrectionStrategy(rawValue: raw) {
            autoCorrectionStrategy = strategy
        }
        if UserDefaults.standard.object(forKey: aiCloudEnabledStorageKey) != nil {
            aiCloudEnabled = UserDefaults.standard.bool(forKey: aiCloudEnabledStorageKey)
        }
        if UserDefaults.standard.object(forKey: highestModeLockStorageKey) != nil {
            highestModeLockEnabled = UserDefaults.standard.bool(forKey: highestModeLockStorageKey)
        }
        if highestModeLockEnabled {
            qaProfile = .ultra
            UserDefaults.standard.set(qaProfile.rawValue, forKey: qaProfileStorageKey)
        }
        if UserDefaults.standard.object(forKey: rebarMainBarCountStorageKey) != nil {
            rebarMainBarCount = clampMainBarCount(UserDefaults.standard.integer(forKey: rebarMainBarCountStorageKey))
        }
        if UserDefaults.standard.object(forKey: rebarStirrupSpacingStorageKey) != nil {
            rebarStirrupSpacingCm = clampSpacing(UserDefaults.standard.double(forKey: rebarStirrupSpacingStorageKey))
        }
        if UserDefaults.standard.object(forKey: rebarCoverStorageKey) != nil {
            rebarCoverCm = clampCover(UserDefaults.standard.double(forKey: rebarCoverStorageKey))
        }
        if UserDefaults.standard.object(forKey: overlayOffsetXStorageKey) != nil {
            overlayOffsetXcm = UserDefaults.standard.double(forKey: overlayOffsetXStorageKey)
        }
        if UserDefaults.standard.object(forKey: overlayOffsetYStorageKey) != nil {
            overlayOffsetYcm = UserDefaults.standard.double(forKey: overlayOffsetYStorageKey)
        }
        if UserDefaults.standard.object(forKey: overlayRotationStorageKey) != nil {
            overlayRotationDeg = UserDefaults.standard.double(forKey: overlayRotationStorageKey)
        }
        if UserDefaults.standard.object(forKey: overlayScaleStorageKey) != nil {
            overlayScale = clampScale(UserDefaults.standard.double(forKey: overlayScaleStorageKey))
        }
        if UserDefaults.standard.object(forKey: volumeAreaWidthStorageKey) != nil {
            volumeAreaWidthMeters = clampVolumeDimension(UserDefaults.standard.double(forKey: volumeAreaWidthStorageKey))
        }
        if UserDefaults.standard.object(forKey: volumeAreaLengthStorageKey) != nil {
            volumeAreaLengthMeters = clampVolumeDimension(UserDefaults.standard.double(forKey: volumeAreaLengthStorageKey))
        }
        if UserDefaults.standard.object(forKey: volumeGridSizeStorageKey) != nil {
            volumeGridSize = clampGridSize(UserDefaults.standard.integer(forKey: volumeGridSizeStorageKey))
        }
        if UserDefaults.standard.object(forKey: crackCalibrationStorageKey) != nil {
            crackCalibrationCmPerPixel = clampCrackCalibration(UserDefaults.standard.double(forKey: crackCalibrationStorageKey))
        }
        if UserDefaults.standard.object(forKey: quantumModeStorageKey) != nil {
            quantumModeEnabled = UserDefaults.standard.bool(forKey: quantumModeStorageKey)
        }
        if UserDefaults.standard.object(forKey: quantumIBMCloudEnabledStorageKey) != nil {
            quantumIBMCloudEnabled = UserDefaults.standard.bool(forKey: quantumIBMCloudEnabledStorageKey)
        }
        if let backend = UserDefaults.standard.string(forKey: quantumIBMBackendStorageKey) {
            quantumIBMBackend = clampIBMBackend(backend)
        }
        if UserDefaults.standard.object(forKey: quantumIBMShotsStorageKey) != nil {
            quantumIBMShots = clampIBMShots(UserDefaults.standard.integer(forKey: quantumIBMShotsStorageKey))
        }
        if UserDefaults.standard.object(forKey: highPrecisionContinuousModeStorageKey) != nil {
            highPrecisionContinuousModeEnabled = UserDefaults.standard.bool(forKey: highPrecisionContinuousModeStorageKey)
        }
        if UserDefaults.standard.object(forKey: designTargetDistanceStorageKey) != nil {
            designTargetDistanceMeters = clampDesignTarget(UserDefaults.standard.double(forKey: designTargetDistanceStorageKey))
        }
        if UserDefaults.standard.object(forKey: deviationToleranceStorageKey) != nil {
            deviationToleranceCm = clampDeviationToleranceCm(UserDefaults.standard.double(forKey: deviationToleranceStorageKey))
        }
        if UserDefaults.standard.object(forKey: twd97BaseEStorageKey) != nil {
            twd97BaseE = UserDefaults.standard.double(forKey: twd97BaseEStorageKey)
        }
        if UserDefaults.standard.object(forKey: twd97BaseNStorageKey) != nil {
            twd97BaseN = UserDefaults.standard.double(forKey: twd97BaseNStorageKey)
        }
        if UserDefaults.standard.object(forKey: twd97BaseHStorageKey) != nil {
            twd97BaseH = UserDefaults.standard.double(forKey: twd97BaseHStorageKey)
        }
        if UserDefaults.standard.object(forKey: twd97RotationStorageKey) != nil {
            twd97RotationDeg = UserDefaults.standard.double(forKey: twd97RotationStorageKey)
        }
        // Keep startup visual style stable: always start from hologram-focused view.
        meshVisualizationEnabled = false
        UserDefaults.standard.set(false, forKey: meshVisualizationStorageKey)
        meshVisualizationStatusText = "網狀模式：關"
        if UserDefaults.standard.object(forKey: facadeLifeModeStorageKey) != nil {
            facadeLifeModeEnabled = UserDefaults.standard.bool(forKey: facadeLifeModeStorageKey)
        }
        facadeLifeModeStatusText = facadeLifeModeEnabled ? "生命感模式：開" : "生命感模式：關"
        if let raw = UserDefaults.standard.string(forKey: hologramRenderModeStorageKey),
           let mode = HologramRenderMode(rawValue: raw) {
            hologramRenderMode = mode
        }
        if let raw = UserDefaults.standard.string(forKey: facadeRebuildModeStorageKey),
           let mode = FacadeRebuildMode(rawValue: raw) {
            facadeRebuildMode = mode
        }
        if quantumModeEnabled {
            highestModeLockEnabled = true
            qaProfile = .ultra
            UserDefaults.standard.set(true, forKey: highestModeLockStorageKey)
            UserDefaults.standard.set(qaProfile.rawValue, forKey: qaProfileStorageKey)
            quantumStatusText = "核心引擎：戰術模式已啟用"
        }
        loadQuantumHistory()
        refreshVolumeAreaM2()
        refreshRebarSpecText()
        refreshQuantumProviderText()
        refreshDeviationStatus()
        loadCorrectionHistory()
        refreshCorrectionTrend()
        refreshAutoCorrectionStatus()
    }

    private var keychainServiceName: String {
        Bundle.main.bundleIdentifier ?? "buildmaster.lidar"
    }

    private func setSecureSecret(_ value: String, account: String) {
        let data = Data(value.utf8)
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainServiceName,
            kSecAttrAccount as String: account
        ]
        let updateAttrs: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(baseQuery as CFDictionary, updateAttrs as CFDictionary)
        if status == errSecSuccess { return }

        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        _ = SecItemAdd(addQuery as CFDictionary, nil)
    }

    private func getSecureSecret(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainServiceName,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let text = String(data: data, encoding: .utf8) else {
            return nil
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func clearSecureSecret(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainServiceName,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func readSecureSecretWithMigration(account: String, legacyUserDefaultsKey: String) -> String? {
        if let existing = getSecureSecret(account: account) {
            return existing
        }
        guard let legacy = UserDefaults.standard.string(forKey: legacyUserDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !legacy.isEmpty else {
            return nil
        }
        setSecureSecret(legacy, account: account)
        UserDefaults.standard.removeObject(forKey: legacyUserDefaultsKey)
        return legacy
    }

    deinit {
        updateTimer?.invalidate()
        facadeLifeAnimationTimer?.invalidate()
        facadeRebuildCooldownTimer?.invalidate()
    }

    func attachARView(_ view: ARView) {
        arView = view
        // Defer session setup to the next run loop cycle to avoid
        // "Publishing changes from within view updates" runtime warnings.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.configureSession(on: view)
            self.beginPolling()
            self.isSessionSuspended = false
        }
    }

    func suspendSessionForViewDisappearance() {
        guard !isSessionSuspended else { return }
        isSessionSuspended = true
        updateTimer?.invalidate()
        updateTimer = nil
        arView?.session.pause()
        statusText = "LiDAR 暫停中"
    }

    func resumeSessionIfNeeded() {
        guard let arView else { return }
        if !isSessionSuspended && updateTimer != nil {
            return
        }
        configureSession(on: arView)
        beginPolling()
        isSessionSuspended = false
    }

    func capturePhotoToLibrary() {
        guard let arView else { return }
        arView.snapshot(saveToHDR: false) { image in
            guard let image else { return }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { return }
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            }
        }
    }

    func placeConcreteBlock(atScreenPoint point: CGPoint) {
        guard let arView else { return }
        let result = arView
            .raycast(from: point, allowing: .estimatedPlane, alignment: .horizontal)
            .first ?? arView.raycast(from: point, allowing: .estimatedPlane, alignment: .any).first
        guard let firstResult = result else {
            volumeStatusText = "體積掃描：未命中平面，請對準地面後重試"
            return
        }

        let width: Float = 0.5
        let height: Float = 0.5
        let depth: Float = 0.5
        let footprintAreaM2 = width * depth
        let volumeM3 = width * height * depth

        let mesh = MeshResource.generateBox(size: [width, height, depth])
        let material = SimpleMaterial(
            color: UIColor.systemYellow.withAlphaComponent(0.55),
            roughness: 0.25,
            isMetallic: false
        )
        let concreteBlock = ModelEntity(mesh: mesh, materials: [material])
        concreteBlock.position = [0, height / 2, 0]

        let anchor = AnchorEntity(world: firstResult.worldTransform)
        anchor.addChild(concreteBlock)
        arView.scene.addAnchor(anchor)

        volumeAreaM2 = Double(footprintAreaM2)
        volumeEstimateM3 = Double(volumeM3)
        volumeSampleCount = 1
        volumeStatusText = String(
            format: "體積掃描：已放置模塊（面積 %.2f m²｜體積 %.2f m³）",
            footprintAreaM2,
            volumeM3
        )
    }

    func setQAProfile(_ profile: QATuningProfile) {
        if highestModeLockEnabled {
            qaProfile = .ultra
        } else {
            qaProfile = profile
        }
        UserDefaults.standard.set(qaProfile.rawValue, forKey: qaProfileStorageKey)
        refreshQALevel()
    }

    func setHighestModeLockEnabled(_ enabled: Bool) {
        highestModeLockEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: highestModeLockStorageKey)
        if !enabled && quantumModeEnabled {
            quantumModeEnabled = false
            UserDefaults.standard.set(false, forKey: quantumModeStorageKey)
            quantumStatusText = "核心引擎：已因解除最高鎖定而關閉"
            quantumCoreLevel = 0
        }
        if enabled {
            qaProfile = .ultra
            UserDefaults.standard.set(qaProfile.rawValue, forKey: qaProfileStorageKey)
            aiLastActionText = "最高等級鎖定：已啟用（固定超嚴格）"
            refreshQALevel()
        } else {
            aiLastActionText = "最高等級鎖定：已關閉（可手動切換模式）"
        }
    }

    func setRebarMainBarCount(_ value: Int) {
        rebarMainBarCount = clampMainBarCount(value)
        UserDefaults.standard.set(rebarMainBarCount, forKey: rebarMainBarCountStorageKey)
        refreshRebarSpecText()
        invalidateOverlayAnchor()
    }

    func setRebarStirrupSpacingCm(_ value: Double) {
        rebarStirrupSpacingCm = clampSpacing(value)
        UserDefaults.standard.set(rebarStirrupSpacingCm, forKey: rebarStirrupSpacingStorageKey)
        refreshRebarSpecText()
        invalidateOverlayAnchor()
    }

    func setRebarCoverCm(_ value: Double) {
        rebarCoverCm = clampCover(value)
        UserDefaults.standard.set(rebarCoverCm, forKey: rebarCoverStorageKey)
        refreshRebarSpecText()
        invalidateOverlayAnchor()
    }

    func setOverlayOffsetXcm(_ value: Double) {
        overlayOffsetXcm = value
        UserDefaults.standard.set(value, forKey: overlayOffsetXStorageKey)
        invalidateOverlayAnchor()
    }

    func setOverlayOffsetYcm(_ value: Double) {
        overlayOffsetYcm = value
        UserDefaults.standard.set(value, forKey: overlayOffsetYStorageKey)
        invalidateOverlayAnchor()
    }

    func setOverlayRotationDeg(_ value: Double) {
        overlayRotationDeg = value
        UserDefaults.standard.set(value, forKey: overlayRotationStorageKey)
        invalidateOverlayAnchor()
    }

    func setOverlayScale(_ value: Double) {
        overlayScale = clampScale(value)
        UserDefaults.standard.set(overlayScale, forKey: overlayScaleStorageKey)
        invalidateOverlayAnchor()
    }

    func resetOverlayAdjustment() {
        overlayOffsetXcm = 0
        overlayOffsetYcm = 0
        overlayRotationDeg = 0
        overlayScale = 1
        UserDefaults.standard.set(overlayOffsetXcm, forKey: overlayOffsetXStorageKey)
        UserDefaults.standard.set(overlayOffsetYcm, forKey: overlayOffsetYStorageKey)
        UserDefaults.standard.set(overlayRotationDeg, forKey: overlayRotationStorageKey)
        UserDefaults.standard.set(overlayScale, forKey: overlayScaleStorageKey)
        invalidateOverlayAnchor()
    }

    func setVolumeAreaWidthMeters(_ value: Double) {
        volumeAreaWidthMeters = clampVolumeDimension(value)
        UserDefaults.standard.set(volumeAreaWidthMeters, forKey: volumeAreaWidthStorageKey)
        refreshVolumeAreaM2()
    }

    func setVolumeAreaLengthMeters(_ value: Double) {
        volumeAreaLengthMeters = clampVolumeDimension(value)
        UserDefaults.standard.set(volumeAreaLengthMeters, forKey: volumeAreaLengthStorageKey)
        refreshVolumeAreaM2()
    }

    func setVolumeGridSize(_ value: Int) {
        volumeGridSize = clampGridSize(value)
        UserDefaults.standard.set(volumeGridSize, forKey: volumeGridSizeStorageKey)
    }

    func runVolumeScanOnce() {
        runVolumeScanOnce(allowRetry: true)
    }

    private func runVolumeScanOnce(allowRetry: Bool) {
        guard let arView, let frame = arView.session.currentFrame else {
            if allowRetry {
                volumeStatusText = "體積掃描：準備掃描中，稍候自動重試..."
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 240_000_000)
                    self?.runVolumeScanOnce(allowRetry: false)
                }
            } else {
                volumeStatusText = "體積掃描：AR 畫面尚未就緒"
            }
            return
        }

        let firstPass = collectVolumeSamples(arView: arView, frame: frame, gridSize: volumeGridSize)
        let secondPass = collectVolumeSamples(arView: arView, frame: frame, gridSize: volumeGridSize)
        let samples = firstPass.depths + secondPass.depths
        volumeScanPreviewPoints = firstPass.previewPoints + secondPass.previewPoints

        let minNeeded = max(12, volumeGridSize * 2)
        guard samples.count >= minNeeded else {
            if allowRetry {
                volumeStatusText = "體積掃描：取樣不足（\(samples.count) 點），補掃中..."
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 220_000_000)
                    self?.runVolumeScanOnce(allowRetry: false)
                }
                return
            }
            volumeSampleCount = samples.count
            if samples.count >= 4 {
                // Even with sparse points, return a rough estimate to avoid "no change" perception.
                let roughDepth = robustDepthEstimate(samples)
                refreshVolumeAreaM2()
                volumeEstimateM3 = max(0, volumeAreaM2 * roughDepth)
                volumeStatusText = String(
                    format: "體積掃描：點位偏少（%d 點，粗估深度 %.2fm）",
                    samples.count,
                    roughDepth
                )
            } else {
                volumeStatusText = "體積掃描：取樣不足（\(samples.count) 點），請對準平面重掃"
            }
            return
        }

        let depth = robustDepthEstimate(samples)
        refreshVolumeAreaM2()
        volumeEstimateM3 = max(0, volumeAreaM2 * depth)
        volumeSampleCount = samples.count
        volumeStatusText = String(
            format: "體積掃描：完成（%d 點，穩健深度 %.2fm）",
            samples.count,
            depth
        )
    }

    func setCrackInputImage(_ image: UIImage) {
        crackInputImage = image
        crackFindings = []
        crackMaxLengthCm = 0
        crackSeveritySummary = "待分析"
        crackStatusText = "裂縫檢測：已載入影像，請開始分析"
    }

    func setBlueprintInputImage(_ image: UIImage) {
        blueprintInputImage = image
        blueprintUploadStatusText = "圖紙已上傳：可進行 3D 牆體生成"
    }

    func appendCurrentBlueprintToMultiViewSet() {
        guard let image = blueprintInputImage else {
            multiViewStatusText = "多視角重建：請先上傳當前角度照片"
            return
        }
        if multiViewSamples.count >= 12 {
            _ = multiViewSamples.removeFirst()
        }
        multiViewSamples.append(MultiViewSample(image: image, capturedAt: Date()))
        multiViewSampleCount = multiViewSamples.count
        multiViewStatusText = "多視角重建：已加入樣本 \(multiViewSamples.count)/12"
    }

    func clearMultiViewSamples() {
        multiViewSamples = []
        multiViewSampleCount = 0
        multiViewPackagePreviewLines = []
        multiViewStatusText = "多視角重建：已清空樣本"
    }

    func buildMultiViewReconstructionPackage() {
        guard !multiViewSamples.isEmpty else {
            multiViewPackagePreviewLines = []
            multiViewStatusText = "多視角重建：至少需要 1 張樣本"
            return
        }

        let iso = ISO8601DateFormatter()
        let summaries: [[String: Any]] = multiViewSamples.enumerated().map { idx, sample in
            let w = max(1, Int((sample.image.size.width * sample.image.scale).rounded()))
            let h = max(1, Int((sample.image.size.height * sample.image.scale).rounded()))
            let ratio = Float(h) / Float(max(1, w))
            let orientation: String
            if ratio > 1.15 {
                orientation = "portrait"
            } else if ratio < 0.85 {
                orientation = "landscape"
            } else {
                orientation = "square-ish"
            }
            let map = makeFacadeDepthMap(from: sample.image, maxDimension: 64)
            let lumaBytes = map?.lumaBytes ?? []
            let avgLuma: Float
            if lumaBytes.isEmpty {
                avgLuma = 0.5
            } else {
                let sum = lumaBytes.reduce(0) { $0 + Int($1) }
                avgLuma = Float(sum) / Float(lumaBytes.count * 255)
            }
            return [
                "index": idx + 1,
                "captured_at": iso.string(from: sample.capturedAt),
                "width": w,
                "height": h,
                "orientation_hint": orientation,
                "avg_luma": Double(avgLuma),
                "depth_source": map?.depthSourceLabel ?? "單張影像（亮度+邊緣）"
            ]
        }

        let payload: [String: Any] = [
            "capture_id": UUID().uuidString,
            "created_at": iso.string(from: Date()),
            "sample_count": summaries.count,
            "samples": summaries
        ]

        if let json = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
           let text = String(data: json, encoding: .utf8) {
            var lines = text.split(separator: "\n").map(String.init)
            if lines.count > 18 {
                lines = Array(lines.prefix(18)) + ["... (省略，完整封包已在記憶體生成)"]
            }
            multiViewPackagePreviewLines = lines
        } else {
            multiViewPackagePreviewLines = ["封包生成失敗：JSON 序列化錯誤"]
        }

        multiViewStatusText = "多視角重建：封包已生成（\(summaries.count) 視角）"
    }

    func clearBlueprintInputImage() {
        blueprintInputImage = nil
        blueprintUploadStatusText = "圖紙：已清除"
    }

    func importIFCModelData(_ data: Data, fileName: String) {
        if fileName.lowercased().hasSuffix(".ifc") {
            do {
                let payload = try parseIFCTextPayload(from: data, fileName: fileName)
                applyImportedIFCPayload(payload)
            } catch {
                ifcModelSummaryText = "IFC 文字解析失敗：\(error.localizedDescription)"
                ifcModelElementCount = 0
                ifcElements = []
            }
            return
        }

        do {
            let payload = try decodeIFCPayload(from: data)
            applyImportedIFCPayload(payload)
        } catch {
            ifcModelSummaryText = "IFC 匯入失敗：\(error.localizedDescription)"
            ifcModelElementCount = 0
            ifcElements = []
        }
    }

    func setIFCShowWalls(_ enabled: Bool) {
        ifcShowWalls = enabled
        if ifcSimulationEnabled { regenerateIFCSimulationAnchor() }
    }

    func setIFCShowRebars(_ enabled: Bool) {
        ifcShowRebars = enabled
        if ifcSimulationEnabled { regenerateIFCSimulationAnchor() }
    }

    func setIFCShowPipes(_ enabled: Bool) {
        ifcShowPipes = enabled
        if ifcSimulationEnabled { regenerateIFCSimulationAnchor() }
    }

    func setMeshVisualizationEnabled(_ enabled: Bool) {
        meshVisualizationEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: meshVisualizationStorageKey)
        meshVisualizationStatusText = enabled ? "網狀模式：開" : "網狀模式：關"
        guard let arView else { return }
        if enabled {
            arView.debugOptions.insert(.showSceneUnderstanding)
        } else {
            arView.debugOptions.remove(.showSceneUnderstanding)
        }
    }

    func setFacadeLifeModeEnabled(_ enabled: Bool) {
        facadeLifeModeEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: facadeLifeModeStorageKey)
        facadeLifeModeStatusText = enabled ? "生命感模式：開" : "生命感模式：關"
        if enabled {
            startFacadeLifeAnimationIfNeeded()
            facadeHologramStatusText = facadeHologramEnabled
                ? "立面全息：生命感已啟用"
                : "立面全息：待命（生命感開）"
        } else {
            stopFacadeLifeAnimation()
            facadeHologramStatusText = facadeHologramEnabled
                ? "立面全息：生命感已關閉"
                : "立面全息：待命"
        }
    }

    func setHologramRenderMode(_ mode: HologramRenderMode) {
        hologramRenderMode = mode
        UserDefaults.standard.set(mode.rawValue, forKey: hologramRenderModeStorageKey)
        if !facadeHologramEnabled {
            activeFacadeRenderMode = mode
            facadeAutoDowngradedForStability = false
        }
        if facadeHologramEnabled {
            let modeText = activeFacadeRenderMode == .showcase ? "展示渲染模式" : "效能渲染模式"
            let safetyText = facadeAutoDowngradedForStability ? "（穩定保護已降載）" : ""
            facadeHologramStatusText = "立面全息：\(modeText)\(safetyText)"
        }
    }

    func setFacadeRebuildMode(_ mode: FacadeRebuildMode) {
        facadeRebuildMode = mode
        UserDefaults.standard.set(mode.rawValue, forKey: facadeRebuildModeStorageKey)
    }

    func applyOnSiteStableHologramPreset() {
        setHologramRenderMode(.performance)
        setFacadeRebuildMode(.lockPerformance)
        setFacadeLifeModeEnabled(true)
        setMeshVisualizationEnabled(false)
        facadeRebuildReady = true
        facadeRebuildGuardText = "重建保護：就緒（現場穩定模式）"
        facadeHologramStatusText = "立面全息：已套用現場穩定模式（效能＋鎖定降載＋生命感）"
    }

    func setTWD97BaseE(_ value: Double) {
        twd97BaseE = value
        UserDefaults.standard.set(value, forKey: twd97BaseEStorageKey)
    }

    func setTWD97BaseN(_ value: Double) {
        twd97BaseN = value
        UserDefaults.standard.set(value, forKey: twd97BaseNStorageKey)
    }

    func setTWD97BaseH(_ value: Double) {
        twd97BaseH = value
        UserDefaults.standard.set(value, forKey: twd97BaseHStorageKey)
    }

    func setTWD97RotationDeg(_ value: Double) {
        twd97RotationDeg = value
        UserDefaults.standard.set(value, forKey: twd97RotationStorageKey)
    }

    func toggleTWDStakingPreviewInAR() {
        if twdStakingPreviewEnabled {
            clearTWDStakingPreviewAnchor()
            return
        }
        guard !twdStakingPoints.isEmpty else {
            twdStakingPreviewStatusText = "放樣點顯示：請先生成放樣點"
            return
        }
        guard arView != nil else {
            twdStakingPreviewStatusText = "放樣點顯示：AR 尚未就緒"
            return
        }
        regenerateTWDStakingPreviewAnchor()
    }

    func generateTWDStakingPointsFromIFC() {
        guard !ifcElements.isEmpty else {
            twdStakingPoints = []
            twdStakingStatusText = "放樣：請先匯入 IFC/JSON"
            return
        }
        let rotation = twd97RotationDeg * .pi / 180.0
        let cosR = cos(rotation)
        let sinR = sin(rotation)
        var points: [TWDStakingPoint] = []

        for (index, element) in ifcElements.enumerated() {
            let localX = element.x ?? 0
            let localY = element.z ?? 0
            let localZ = element.y ?? 0

            let e = twd97BaseE + (localX * cosR - localY * sinR)
            let n = twd97BaseN + (localX * sinR + localY * cosR)
            let h = twd97BaseH + localZ
            let prefix: String
            switch element.type {
            case .wall: prefix = "W"
            case .rebar: prefix = "R"
            case .pipe: prefix = "P"
            }
            points.append(
                TWDStakingPoint(
                    name: "\(prefix)-\(index + 1)",
                    localX: localX,
                    localY: localY,
                    localZ: localZ,
                    e: e,
                    n: n,
                    h: h
                )
            )
        }

        twdStakingPoints = points
        twdStakingStatusText = "放樣：已生成 \(points.count) 點（TWD97）"
        if twdStakingPreviewEnabled {
            regenerateTWDStakingPreviewAnchor()
        }
    }

    func generateQuickStakingPointsFromBlueprint(planWidthMeters: Double, planHeightMeters: Double) {
        guard blueprintInputImage != nil else {
            blueprintQuickStakeStatusText = "圖紙快速放樣：請先上傳圖紙"
            return
        }
        let width = max(0.5, planWidthMeters)
        let height = max(0.5, planHeightMeters)
        let halfW = width / 2
        let halfH = height / 2

        // Quick mode preset: fire/electrical room focused staking points.
        let localPoints: [(String, Double, Double, Double)] = [
            // 消防水池四角（預設落在上半部）
            ("FP-01", -halfW * 0.22, halfH * 0.42, 0),
            ("FP-02", halfW * 0.22, halfH * 0.42, 0),
            ("FP-03", halfW * 0.22, halfH * 0.16, 0),
            ("FP-04", -halfW * 0.22, halfH * 0.16, 0),

            // 電信室門口與角點（中段左側）
            ("TR-01", -halfW * 0.20, -halfH * 0.02, 0),
            ("TR-02", -halfW * 0.06, -halfH * 0.10, 0),

            // 消防機房門口與角點（下段右側）
            ("MR-01", halfW * 0.20, -halfH * 0.44, 0),
            ("MR-02", halfW * 0.06, -halfH * 0.33, 0),

            // 無障礙梯前緣中心
            ("ST-01", halfW * 0.18, -halfH * 0.03, 0),

            // 全區基準中心點
            ("AX-01", 0, 0, 0)
        ]

        twdStakingPoints = localPoints.map { name, x, y, z in
            toTWDStakingPoint(name: name, localX: x, localY: y, localZ: z)
        }
        twdStakingStatusText = "放樣：已由圖紙快速生成 \(twdStakingPoints.count) 點（TWD97）"
        blueprintQuickStakeStatusText = String(format: "圖紙快速放樣：消防/機電 10 點（%.2fm × %.2fm）已轉換 TWD97", width, height)
        if twdStakingPreviewEnabled {
            regenerateTWDStakingPreviewAnchor()
        }
    }

    private func toTWDStakingPoint(name: String, localX: Double, localY: Double, localZ: Double) -> TWDStakingPoint {
        let rotation = twd97RotationDeg * .pi / 180.0
        let cosR = cos(rotation)
        let sinR = sin(rotation)
        let e = twd97BaseE + (localX * cosR - localY * sinR)
        let n = twd97BaseN + (localX * sinR + localY * cosR)
        let h = twd97BaseH + localZ
        return TWDStakingPoint(
            name: name,
            localX: localX,
            localY: localY,
            localZ: localZ,
            e: e,
            n: n,
            h: h
        )
    }

    private func regenerateTWDStakingPreviewAnchor() {
        guard let arView else { return }
        twdStakingPreviewAnchor?.removeFromParent()

        let anchor = AnchorEntity(world: matrix_identity_float4x4)
        if let cameraTransform = arView.session.currentFrame?.camera.transform {
            let forward = SIMD3<Float>(
                -cameraTransform.columns.2.x,
                -cameraTransform.columns.2.y,
                -cameraTransform.columns.2.z
            )
            let cameraPos = SIMD3<Float>(
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            )
            anchor.position = cameraPos + (forward * 1.3) + SIMD3<Float>(0, -0.18, 0)
        } else {
            anchor.position = [0, 0, -1.3]
        }

        let root = Entity()
        anchor.addChild(root)

        // Auto-fit staking cloud into visible AR area.
        let xs = twdStakingPoints.map(\.localX)
        let ys = twdStakingPoints.map(\.localY)
        let minX = xs.min() ?? -1
        let maxX = xs.max() ?? 1
        let minY = ys.min() ?? -1
        let maxY = ys.max() ?? 1
        let span = max(maxX - minX, maxY - minY)
        let scale = Float(span > 0 ? min(1.0, 2.0 / span) : 1.0)

        let markerMesh = MeshResource.generateSphere(radius: 0.028)
        let stemMesh = MeshResource.generateBox(size: [0.008, 0.14, 0.008])
        let markerMat = SimpleMaterial(color: .systemMint, roughness: 0.25, isMetallic: true)
        let stemMat = SimpleMaterial(color: UIColor.white.withAlphaComponent(0.85), roughness: 0.4, isMetallic: false)

        for (index, point) in twdStakingPoints.enumerated() {
            let px = Float((point.localX - ((minX + maxX) / 2.0)) * Double(scale))
            let pz = Float((point.localY - ((minY + maxY) / 2.0)) * Double(scale))
            let marker = ModelEntity(mesh: markerMesh, materials: [markerMat])
            marker.position = [px, 0.08, pz]
            root.addChild(marker)

            let stem = ModelEntity(mesh: stemMesh, materials: [stemMat])
            stem.position = [px, 0.01, pz]
            root.addChild(stem)

            if index == 0 {
                // Highlight first point as quick orientation reference.
                let refMesh = MeshResource.generateSphere(radius: 0.04)
                let refMat = SimpleMaterial(color: .systemYellow, roughness: 0.15, isMetallic: true)
                let ref = ModelEntity(mesh: refMesh, materials: [refMat])
                ref.position = [px, 0.16, pz]
                root.addChild(ref)
            }
        }

        arView.scene.addAnchor(anchor)
        twdStakingPreviewAnchor = anchor
        twdStakingPreviewEnabled = true
        twdStakingPreviewStatusText = "放樣點顯示：已開啟（\(twdStakingPoints.count) 點）"
    }

    private func clearTWDStakingPreviewAnchor() {
        twdStakingPreviewAnchor?.removeFromParent()
        twdStakingPreviewAnchor = nil
        twdStakingPreviewEnabled = false
        twdStakingPreviewStatusText = "放樣點顯示：關"
    }

    private struct FacadeDepthMap {
        let width: Int
        let height: Int
        let lumaBytes: [UInt8]
        let edgeBytes: [UInt8]
        let predictedDepthBytes: [UInt8]?
        let depthSourceLabel: String

        func sampleLuma(u: Float, v: Float) -> Float {
            guard width > 0, height > 0 else { return 0.5 }
            let uu = min(max(u, 0), 1)
            let vv = min(max(v, 0), 1)
            let x = min(width - 1, max(0, Int(uu * Float(width - 1))))
            let y = min(height - 1, max(0, Int(vv * Float(height - 1))))
            let idx = y * width + x
            guard idx >= 0, idx < lumaBytes.count else { return 0.5 }
            return Float(lumaBytes[idx]) / 255.0
        }

        func sampleDepth(u: Float, v: Float) -> Float {
            let luma = sampleLuma(u: u, v: v)
            guard width > 0, height > 0 else { return luma }
            let uu = min(max(u, 0), 1)
            let vv = min(max(v, 0), 1)
            let x = min(width - 1, max(0, Int(uu * Float(width - 1))))
            let y = min(height - 1, max(0, Int(vv * Float(height - 1))))
            let idx = y * width + x
            guard idx >= 0, idx < edgeBytes.count else { return luma }
            let edge = Float(edgeBytes[idx]) / 255.0
            if let predictedDepthBytes, idx < predictedDepthBytes.count {
                let predicted = Float(predictedDepthBytes[idx]) / 255.0
                // If a CoreML depth map is available, trust it as main geometry.
                return min(1, max(0, predicted * 0.9 + edge * 0.1))
            }

            // Week-1 depth estimate (single image): brightness base + edge relief boost.
            let baseDepth = luma
            let edgeRelief = edge * 0.35
            return min(1, max(0, baseDepth * 0.78 + edgeRelief))
        }
    }

    private func loadFacadeDepthVNModelIfAvailable() -> (model: VNCoreMLModel, name: String)? {
        if let cachedFacadeDepthVNModel, let cachedFacadeDepthModelName {
            return (cachedFacadeDepthVNModel, cachedFacadeDepthModelName)
        }
        let candidateNames = [
            "DepthEstimator",
            "DepthAnythingV2Small",
            "MiDaSDepthSmall"
        ]
        for name in candidateNames {
            guard let modelURL = Bundle.main.url(forResource: name, withExtension: "mlmodelc") else { continue }
            guard let mlModel = try? MLModel(contentsOf: modelURL) else { continue }
            guard let vnModel = try? VNCoreMLModel(for: mlModel) else { continue }
            cachedFacadeDepthVNModel = vnModel
            cachedFacadeDepthModelName = name
            return (vnModel, name)
        }
        return nil
    }

    private func computeSobelEdges(from bytes: [UInt8], width: Int, height: Int) -> [UInt8] {
        var edgeBytes = [UInt8](repeating: 0, count: width * height)
        guard width > 2, height > 2 else { return edgeBytes }
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let i00 = Int(bytes[(y - 1) * width + (x - 1)])
                let i01 = Int(bytes[(y - 1) * width + x])
                let i02 = Int(bytes[(y - 1) * width + (x + 1)])
                let i10 = Int(bytes[y * width + (x - 1)])
                let i12 = Int(bytes[y * width + (x + 1)])
                let i20 = Int(bytes[(y + 1) * width + (x - 1)])
                let i21 = Int(bytes[(y + 1) * width + x])
                let i22 = Int(bytes[(y + 1) * width + (x + 1)])

                let gx = (-i00 + i02) + (-2 * i10 + 2 * i12) + (-i20 + i22)
                let gy = (-i00 - 2 * i01 - i02) + (i20 + 2 * i21 + i22)
                let mag = min(255, Int(sqrt(Double(gx * gx + gy * gy)) * 0.25))
                edgeBytes[y * width + x] = UInt8(mag)
            }
        }
        return edgeBytes
    }

    private func makeDepthBytesFromModel(
        cgImage: CGImage,
        targetWidth: Int,
        targetHeight: Int
    ) -> (bytes: [UInt8], source: String)? {
        guard let modelInfo = loadFacadeDepthVNModelIfAvailable() else { return nil }
        var observedArray: MLMultiArray?
        let request = VNCoreMLRequest(model: modelInfo.model) { request, _ in
            let results = request.results ?? []
            for result in results {
                if let obs = result as? VNCoreMLFeatureValueObservation,
                   let array = obs.featureValue.multiArrayValue {
                    observedArray = array
                    return
                }
            }
        }
        request.imageCropAndScaleOption = .scaleFill
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        guard let array = observedArray else { return nil }

        let shape = array.shape.map { Int(truncating: $0) }
        guard shape.count >= 2 else { return nil }
        let depthHeight = max(1, shape[shape.count - 2])
        let depthWidth = max(1, shape[shape.count - 1])
        let prefix = Array(repeating: 0, count: max(0, shape.count - 2))
        var values = [Float](repeating: 0, count: depthWidth * depthHeight)
        var minV: Float = .greatestFiniteMagnitude
        var maxV: Float = -.greatestFiniteMagnitude

        for y in 0..<depthHeight {
            for x in 0..<depthWidth {
                let idxPath = prefix + [y, x]
                let number = array[idxPath.map { NSNumber(value: $0) }]
                let value = Float(truncating: number)
                values[y * depthWidth + x] = value
                minV = min(minV, value)
                maxV = max(maxV, value)
            }
        }
        let range = max(1e-6, maxV - minV)
        var bytes = [UInt8](repeating: 0, count: targetWidth * targetHeight)
        for y in 0..<targetHeight {
            for x in 0..<targetWidth {
                let srcX = min(depthWidth - 1, Int(Float(x) / Float(max(1, targetWidth - 1)) * Float(depthWidth - 1)))
                let srcY = min(depthHeight - 1, Int(Float(y) / Float(max(1, targetHeight - 1)) * Float(depthHeight - 1)))
                let v = values[srcY * depthWidth + srcX]
                let n = (v - minV) / range
                bytes[y * targetWidth + x] = UInt8(min(255, max(0, Int(n * 255.0))))
            }
        }
        return (bytes, "CoreML \(modelInfo.name)")
    }

    private func makeFacadeDepthMap(from image: UIImage, maxDimension: Int = 96) -> FacadeDepthMap? {
        guard let cgImage = image.cgImage else { return nil }
        let sourceWidth = cgImage.width
        let sourceHeight = cgImage.height
        guard sourceWidth > 0, sourceHeight > 0 else { return nil }

        let scale = min(1.0, Float(maxDimension) / Float(max(sourceWidth, sourceHeight)))
        let targetWidth = max(16, Int(Float(sourceWidth) * scale))
        let targetHeight = max(16, Int(Float(sourceHeight) * scale))
        var lumaBytes = [UInt8](repeating: 0, count: targetWidth * targetHeight)

        let colorSpace = CGColorSpaceCreateDeviceGray()
        let bytesPerRow = targetWidth
        guard let context = CGContext(
            data: &lumaBytes,
            width: targetWidth,
            height: targetHeight,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else {
            return nil
        }

        context.interpolationQuality = .medium
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
        let edgeBytes = computeSobelEdges(from: lumaBytes, width: targetWidth, height: targetHeight)
        let modelDepth = makeDepthBytesFromModel(cgImage: cgImage, targetWidth: targetWidth, targetHeight: targetHeight)

        return FacadeDepthMap(
            width: targetWidth,
            height: targetHeight,
            lumaBytes: lumaBytes,
            edgeBytes: edgeBytes,
            predictedDepthBytes: modelDepth?.bytes,
            depthSourceLabel: modelDepth?.source ?? "單張影像（亮度+邊緣）"
        )
    }

    private func buildFacadeHologramAnchor(
        image: UIImage,
        referenceTransform: simd_float4x4?,
        requestedRenderMode: HologramRenderMode? = nil,
        allowAutoDowngrade: Bool = true
    ) -> AnchorEntity {
        let anchor = AnchorEntity(world: matrix_identity_float4x4)
        if let cameraTransform = referenceTransform {
            let forward = SIMD3<Float>(
                -cameraTransform.columns.2.x,
                -cameraTransform.columns.2.y,
                -cameraTransform.columns.2.z
            )
            let cameraPos = SIMD3<Float>(
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            )
            anchor.position = cameraPos + (forward * 1.7) + SIMD3<Float>(0, -0.25, 0)
        } else {
            anchor.position = [0, 0, -1.7]
        }

        let root = Entity()
        facadeHologramRoot = root
        anchor.addChild(root)

        let imageRatio = max(0.35, min(2.2, Double(image.size.height / max(1, image.size.width))))
        let facadeWidth: Float = 1.9
        let facadeHeight: Float = Float(facadeWidth * Float(imageRatio))
        let depth: Float = 0.26
        facadeCurrentHeight = facadeHeight

        let bodyMesh = MeshResource.generateBox(size: [facadeWidth, facadeHeight, depth])
        let bodyMat = SimpleMaterial(color: UIColor.systemGray.withAlphaComponent(0.92), roughness: 0.42, isMetallic: false)
        let body = ModelEntity(mesh: bodyMesh, materials: [bodyMat])
        body.position = [0, facadeHeight / 2, 0]
        root.addChild(body)

        let selectedRenderMode = requestedRenderMode ?? hologramRenderMode
        let pixelWidth = max(1, Int((image.size.width * image.scale).rounded()))
        let pixelHeight = max(1, Int((image.size.height * image.scale).rounded()))
        let sourcePixels = Double(pixelWidth * pixelHeight)
        let shouldAutoDowngrade = allowAutoDowngrade && selectedRenderMode == .showcase && sourcePixels > 6_000_000
        let effectiveRenderMode: HologramRenderMode = shouldAutoDowngrade ? .performance : selectedRenderMode
        activeFacadeRenderMode = effectiveRenderMode
        facadeAutoDowngradedForStability = shouldAutoDowngrade

        // Adaptive tessellation by render mode.
        let cols: Int
        let rows: Int
        let lumaMaxDimension: Int
        switch effectiveRenderMode {
        case .performance:
            cols = max(6, min(10, Int((facadeWidth / 0.22).rounded())))
            rows = max(8, min(16, Int((facadeHeight / 0.2).rounded())))
            lumaMaxDimension = 64
        case .showcase:
            cols = max(8, min(13, Int((facadeWidth / 0.19).rounded())))
            rows = max(11, min(20, Int((facadeHeight / 0.17).rounded())))
            lumaMaxDimension = 84
        }
        let unitW = facadeWidth / Float(cols)
        let unitH = facadeHeight / Float(rows)
        let depthMap = makeFacadeDepthMap(from: image, maxDimension: lumaMaxDimension)

        let depthBuckets: [Float] = [0.012, 0.022, 0.034]
        let toneBuckets: [CGFloat] = [0.66, 0.77, 0.88]
        let tileMeshes = depthBuckets.map { bucket in
            MeshResource.generateBox(size: [unitW * 0.93, unitH * 0.9, bucket])
        }
        let tileMaterials = toneBuckets.map { tone -> SimpleMaterial in
            let color = UIColor(
                red: tone * 0.9,
                green: tone * 0.92,
                blue: tone * 0.95,
                alpha: 0.96
            )
            return SimpleMaterial(color: color, roughness: 0.4, isMetallic: false)
        }

        let windowMesh = MeshResource.generateBox(size: [unitW * 0.62, unitH * 0.56, 0.009])
        let windowMat = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.82), roughness: 0.12, isMetallic: true)
        let windowBudgetLimit = effectiveRenderMode == .showcase ? 180 : 120
        var windowBudget = windowBudgetLimit

        for row in 0..<rows {
            let y = unitH * (Float(row) + 0.5)
            for col in 0..<cols {
                let x = -facadeWidth / 2 + unitW * (Float(col) + 0.5)
                let u = (Float(col) + 0.5) / Float(cols)
                let v = 1 - (Float(row) + 0.5) / Float(rows)
                let luma = depthMap?.sampleLuma(u: u, v: v) ?? (0.5 + 0.2 * sinf(Float(col) * 0.7) * cosf(Float(row) * 0.35))
                let estimatedDepth = depthMap?.sampleDepth(u: u, v: v) ?? luma
                let clampedLuma = min(max(luma, 0), 1)
                let clampedDepth = min(max(estimatedDepth, 0), 1)

                // Use estimated depth for geometry; keep luma for tone.
                let recess = max(0, (0.48 - clampedDepth) * 0.095)
                let protrusion = max(0, (clampedDepth - 0.54) * 0.075)
                let tileDepth = 0.012 + protrusion
                let tileZ = depth / 2 + (tileDepth / 2) - recess

                let depthIndex = min(depthBuckets.count - 1, max(0, Int((tileDepth - 0.012) / 0.011)))
                let toneIndex = min(toneBuckets.count - 1, max(0, Int(clampedLuma * Float(toneBuckets.count))))
                let tile = ModelEntity(mesh: tileMeshes[depthIndex], materials: [tileMaterials[toneIndex]])
                tile.position = [x, y, tileZ]
                root.addChild(tile)

                if recess > 0.018, windowBudget > 0, ((row + col) % 2 == 0) {
                    let window = ModelEntity(mesh: windowMesh, materials: [windowMat])
                    window.position = [x, y, depth / 2 - recess - 0.006]
                    root.addChild(window)
                    windowBudget -= 1
                }
            }
        }
        let windowsPlaced = windowBudgetLimit - windowBudget

        // Structural fins and horizontal belts add stronger silhouette and real-world facade rhythm.
        let finCount = max(3, cols / 3)
        let finMesh = MeshResource.generateBox(size: [0.028, facadeHeight, depth * 1.08])
        let finMat = SimpleMaterial(color: UIColor.darkGray.withAlphaComponent(0.95), roughness: 0.44, isMetallic: false)
        for i in 1..<finCount {
            let x = -facadeWidth / 2 + facadeWidth * Float(i) / Float(finCount)
            let fin = ModelEntity(mesh: finMesh, materials: [finMat])
            fin.position = [x, facadeHeight / 2, depth / 2 + 0.022]
            root.addChild(fin)
        }

        let beltCount = max(4, rows / 4)
        let beltMesh = MeshResource.generateBox(size: [facadeWidth * 0.98, 0.018, depth * 1.05])
        let beltMat = SimpleMaterial(color: UIColor.white.withAlphaComponent(0.9), roughness: 0.3, isMetallic: false)
        for i in 1..<beltCount {
            let y = facadeHeight * Float(i) / Float(beltCount)
            let belt = ModelEntity(mesh: beltMesh, materials: [beltMat])
            belt.position = [0, y, depth / 2 + 0.012]
            root.addChild(belt)
        }

        // Add high-contrast outline frame so the facade silhouette stays readable on site.
        let edgeThickness: Float = 0.03
        let edgeMat = SimpleMaterial(color: UIColor.black.withAlphaComponent(0.85), roughness: 0.35, isMetallic: false)
        let sideEdgeMesh = MeshResource.generateBox(size: [edgeThickness, facadeHeight, depth * 1.04])
        let topBottomEdgeMesh = MeshResource.generateBox(size: [facadeWidth + edgeThickness, edgeThickness, depth * 1.04])
        for side: Float in [-1, 1] {
            let sideEdge = ModelEntity(mesh: sideEdgeMesh, materials: [edgeMat])
            sideEdge.position = [side * (facadeWidth / 2), facadeHeight / 2, 0]
            root.addChild(sideEdge)
        }
        let topEdge = ModelEntity(mesh: topBottomEdgeMesh, materials: [edgeMat])
        topEdge.position = [0, facadeHeight, 0]
        root.addChild(topEdge)
        let bottomEdge = ModelEntity(mesh: topBottomEdgeMesh, materials: [edgeMat])
        bottomEdge.position = [0, 0, 0]
        root.addChild(bottomEdge)

        let scanMesh = MeshResource.generateBox(size: [facadeWidth * 0.98, 0.06, 0.008])
        let scanMat = SimpleMaterial(color: UIColor.cyan.withAlphaComponent(0.42), roughness: 0.15, isMetallic: true)
        let scanBand = ModelEntity(mesh: scanMesh, materials: [scanMat])
        scanBand.position = [0, 0.08, depth / 2 + 0.04]
        root.addChild(scanBand)
        facadeScanBandEntity = scanBand

        facadeLifePulseScale = 1.0
        applyFacadeHologramTransform()
        startFacadeLifeAnimationIfNeeded()
        updateFacadeRealismDashboard(
            depthSourceLabel: depthMap?.depthSourceLabel ?? "單張影像（亮度+邊緣）",
            pixelWidth: pixelWidth,
            pixelHeight: pixelHeight,
            cols: cols,
            rows: rows,
            windowsPlaced: windowsPlaced,
            effectiveRenderMode: effectiveRenderMode,
            shouldAutoDowngrade: shouldAutoDowngrade
        )
        facadeQualityReportLines = [
            "模式：\(effectiveRenderMode == .showcase ? "展示" : "效能")",
            "穩定保護：\(shouldAutoDowngrade ? "已降載" : "未降載")",
            "深度估計：\(depthMap?.depthSourceLabel ?? "單張影像（亮度+邊緣）")",
            "影像解析：\(pixelWidth)x\(pixelHeight)",
            "格網密度：\(cols)x\(rows)（\(cols * rows) 塊）",
            "亮度取樣：\(lumaMaxDimension)",
            "窗格生成：\(windowsPlaced)",
            "真實感總分：\(facadeRealismOverallScore)/100（\(facadeRealismTierText.replacingOccurrences(of: "真實感評級：", with: ""))）"
        ]
        return anchor
    }

    private func applyFacadeHologramTransform() {
        guard let root = facadeHologramRoot else { return }
        root.scale = SIMD3<Float>(repeating: facadeHologramScale * facadeLifePulseScale)
        let yaw = simd_quatf(angle: facadeHologramYaw, axis: [0, 1, 0])
        let pitch = simd_quatf(angle: facadeHologramPitch, axis: [1, 0, 0])
        let roll = simd_quatf(angle: facadeHologramRoll, axis: [0, 0, 1])
        root.orientation = yaw * pitch * roll
    }

    private func startFacadeLifeAnimationIfNeeded() {
        guard facadeLifeModeEnabled, facadeHologramEnabled, facadeHologramRoot != nil else { return }
        if facadeLifeAnimationTimer != nil { return }
        facadeLifeStartTime = Date().timeIntervalSinceReferenceDate
        facadeLifeAnimationTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.tickFacadeLifeAnimation()
            }
        }
    }

    private func stopFacadeLifeAnimation() {
        facadeLifeAnimationTimer?.invalidate()
        facadeLifeAnimationTimer = nil
        facadeLifePulseScale = 1.0
        applyFacadeHologramTransform()
    }

    private func tickFacadeLifeAnimation() {
        guard facadeLifeModeEnabled, facadeHologramEnabled, facadeHologramRoot != nil else {
            stopFacadeLifeAnimation()
            return
        }
        let t = Float(Date().timeIntervalSinceReferenceDate - facadeLifeStartTime)
        let pulseAmplitude: Float = activeFacadeRenderMode == .showcase ? 0.016 : 0.012
        facadeLifePulseScale = 1.0 + pulseAmplitude * sinf(t * 1.8)
        applyFacadeHologramTransform()
        if let scanBand = facadeScanBandEntity {
            let travel = max(0.2, facadeCurrentHeight - 0.18)
            let y = 0.08 + ((sinf(t * 1.1) * 0.5 + 0.5) * travel)
            scanBand.position.y = y
            scanBand.position.z = 0.17 + 0.0012 * sinf(t * 2.4)
        }
    }

    private func updateFacadeRealismDashboard(
        depthSourceLabel: String,
        pixelWidth: Int,
        pixelHeight: Int,
        cols: Int,
        rows: Int,
        windowsPlaced: Int,
        effectiveRenderMode: HologramRenderMode,
        shouldAutoDowngrade: Bool
    ) {
        let depthScore: Int = {
            let source = depthSourceLabel.lowercased()
            var score = source.contains("model") || source.contains("depth") ? 90 : 72
            if pixelWidth * pixelHeight >= 2_000_000 { score += 4 }
            if cols * rows >= 800 { score += 4 }
            return max(0, min(100, score))
        }()

        let parallaxScore: Int = {
            var score = 70
            if facadeLifeModeEnabled { score += 12 }
            if effectiveRenderMode == .showcase { score += 9 }
            if !shouldAutoDowngrade { score += 6 }
            return max(0, min(100, score))
        }()

        let occlusionScore: Int = {
            var score = 58
            if ifcSimulationEnabled { score += 20 }
            if !ifcElements.isEmpty { score += 12 }
            if windowsPlaced >= 20 { score += 4 }
            return max(0, min(100, score))
        }()

        let lightingScore: Int = {
            var score = 64
            if facadeLifeModeEnabled { score += 14 }
            if effectiveRenderMode == .showcase { score += 10 }
            if !meshVisualizationEnabled { score += 4 }
            return max(0, min(100, score))
        }()

        let overall = Int(
            (Double(depthScore) * 0.36) +
            (Double(parallaxScore) * 0.26) +
            (Double(occlusionScore) * 0.20) +
            (Double(lightingScore) * 0.18)
        )
        facadeRealismOverallScore = max(0, min(100, overall))
        let tier: String
        switch facadeRealismOverallScore {
        case 90...:
            tier = "IMAX 近真實"
        case 80...:
            tier = "高真實感"
        case 70...:
            tier = "可用級真實感"
        default:
            tier = "建議再優化"
        }
        facadeRealismTierText = "真實感評級：\(tier)"
        facadeRealismBreakdownLines = [
            "整體真實感：\(facadeRealismOverallScore)/100",
            "深度重建：\(depthScore)/100",
            "角度連動：\(parallaxScore)/100",
            "空間遮擋：\(occlusionScore)/100",
            "光影融合：\(lightingScore)/100"
        ]
    }

    func adjustFacadeHologramScale(by factor: CGFloat) {
        guard facadeHologramEnabled, facadeHologramRoot != nil else { return }
        let safeFactor = max(0.6, min(1.6, Float(factor)))
        let maxScale: Float = activeFacadeRenderMode == .showcase ? 2.0 : 1.75
        facadeHologramScale = min(maxScale, max(0.45, facadeHologramScale * safeFactor))
        applyFacadeHologramTransform()
    }

    func rotateFacadeHologram(deltaYaw: Float, deltaPitch: Float) {
        guard facadeHologramEnabled, facadeHologramRoot != nil else { return }
        facadeHologramYaw += deltaYaw
        facadeHologramPitch = min(0.95, max(-0.95, facadeHologramPitch + deltaPitch))
        applyFacadeHologramTransform()
    }

    func rollFacadeHologram(deltaRoll: Float) {
        guard facadeHologramEnabled, facadeHologramRoot != nil else { return }
        facadeHologramRoll += deltaRoll
        applyFacadeHologramTransform()
    }

    func moveFacadeHologram(deltaScreenX: CGFloat, deltaScreenY: CGFloat) {
        guard facadeHologramEnabled, let anchor = facadeHologramAnchor, let arView else { return }
        guard let frame = arView.session.currentFrame else { return }
        let camera = frame.camera.transform
        let right = SIMD3<Float>(camera.columns.0.x, camera.columns.0.y, camera.columns.0.z)
        let up = SIMD3<Float>(camera.columns.1.x, camera.columns.1.y, camera.columns.1.z)
        let sensitivity: Float = 0.0012 * max(0.8, facadeHologramScale)
        let dx = Float(deltaScreenX) * sensitivity
        let dy = Float(deltaScreenY) * sensitivity
        anchor.position += right * dx
        anchor.position += up * -dy
    }

    func resetFacadeHologramTransform() {
        guard facadeHologramEnabled, facadeHologramRoot != nil else { return }
        facadeHologramScale = 1.0
        facadeHologramYaw = 0
        facadeHologramPitch = 0
        facadeHologramRoll = 0
        facadeLifePulseScale = 1.0
        if let arView, let anchor = facadeHologramAnchor, let cameraTransform = arView.session.currentFrame?.camera.transform {
            let forward = SIMD3<Float>(
                -cameraTransform.columns.2.x,
                -cameraTransform.columns.2.y,
                -cameraTransform.columns.2.z
            )
            let cameraPos = SIMD3<Float>(
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            )
            anchor.position = cameraPos + (forward * 1.7) + SIMD3<Float>(0, -0.25, 0)
        }
        applyFacadeHologramTransform()
        facadeHologramStatusText = "立面全息：已重置（前方可操作）"
    }

    private func clearFacadeHologramAnchor() {
        stopFacadeLifeAnimation()
        facadeRebuildCooldownTimer?.invalidate()
        facadeRebuildCooldownTimer = nil
        facadeRebuildCooldownUntil = 0
        facadeRebuildReady = true
        facadeRebuildGuardText = "重建保護：就緒"
        facadeHologramAnchor?.removeFromParent()
        facadeHologramAnchor = nil
        facadeHologramRoot = nil
        facadeScanBandEntity = nil
        facadeQualityReportLines = []
        facadeRealismOverallScore = 0
        facadeRealismTierText = "真實感：待命"
        facadeRealismBreakdownLines = []
        activeFacadeRenderMode = hologramRenderMode
        facadeAutoDowngradedForStability = false
        facadeHologramScale = 1.0
        facadeHologramYaw = 0
        facadeHologramPitch = 0
        facadeHologramRoll = 0
        facadeHologramEnabled = false
        facadeHologramStatusText = "立面全息：關"
    }

    private func beginFacadeRebuildCooldown(seconds: TimeInterval, reason: String) {
        let safeSeconds = max(0.6, seconds)
        facadeRebuildCooldownUntil = Date().timeIntervalSinceReferenceDate + safeSeconds
        facadeRebuildReady = false
        facadeRebuildCooldownTimer?.invalidate()
        facadeRebuildCooldownTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                let remaining = self.facadeRebuildCooldownUntil - Date().timeIntervalSinceReferenceDate
                if remaining <= 0 {
                    self.facadeRebuildCooldownTimer?.invalidate()
                    self.facadeRebuildCooldownTimer = nil
                    self.facadeRebuildCooldownUntil = 0
                    self.facadeRebuildReady = true
                    self.facadeRebuildGuardText = "重建保護：就緒"
                    return
                }
                self.facadeRebuildGuardText = "\(reason)（\(String(format: "%.1f", remaining)) 秒）"
            }
        }
    }

    private func canRunFacadeRebuild() -> Bool {
        let now = Date().timeIntervalSinceReferenceDate
        if now < facadeRebuildCooldownUntil {
            let remaining = facadeRebuildCooldownUntil - now
            facadeRebuildGuardText = "重建保護：冷卻中（\(String(format: "%.1f", max(0, remaining))) 秒）"
            facadeHologramStatusText = "立面全息：重建過快，請稍候"
            return false
        }
        facadeRebuildTapTimes.append(now)
        facadeRebuildTapTimes = facadeRebuildTapTimes.filter { now - $0 <= 6.0 }
        let rapidCount = facadeRebuildTapTimes.filter { now - $0 <= 2.5 }.count
        if rapidCount >= 3 {
            beginFacadeRebuildCooldown(seconds: 3.5, reason: "重建保護：偵測連點，暫停重建")
            facadeHologramStatusText = "立面全息：偵測連點，暫停重建以保穩定"
            return false
        }
        return true
    }

    func toggleIFCSimulationFromUploadedBlueprint() {
        if ifcSimulationEnabled {
            clearIFCSimulationAnchor()
            return
        }
        guard blueprintInputImage != nil || !ifcElements.isEmpty else {
            ifcSimulationStatusText = "IFC 模擬：請先匯入 IFC（若無 IFC 才用上傳圖）"
            return
        }
        guard let arView else {
            ifcSimulationStatusText = "IFC 模擬：AR 尚未就緒"
            return
        }
        let anchor = buildIFCSimulationAnchor(referenceTransform: arView.session.currentFrame?.camera.transform)
        arView.scene.addAnchor(anchor)
        ifcSimulationAnchor = anchor
        ifcSimulationEnabled = true
        if ifcElements.isEmpty, blueprintInputImage != nil {
            ifcSimulationStatusText = "IFC 模擬：已依上傳圖紙生成 3D（自動變化）"
        } else if ifcElements.isEmpty {
            ifcSimulationStatusText = "IFC 模擬：已生成牆體/鋼筋/水管（示意）"
        } else {
            ifcSimulationStatusText = "IFC 模擬：已套用 IFC 模型生成 3D"
        }
    }

    func toggleFacadeHologramFromBlueprint() {
        if facadeHologramEnabled {
            facadeSnapshotBeforeRebuild = nil
            facadeSnapshotAvailable = false
            clearFacadeHologramAnchor()
            return
        }
        guard let image = blueprintInputImage else {
            facadeHologramStatusText = "立面全息：請先上傳立面圖"
            return
        }
        guard let arView else {
            facadeHologramStatusText = "立面全息：AR 尚未就緒"
            return
        }
        let anchor = buildFacadeHologramAnchor(image: image, referenceTransform: arView.session.currentFrame?.camera.transform)
        arView.scene.addAnchor(anchor)
        facadeHologramAnchor = anchor
        facadeHologramEnabled = true
        let modeText = activeFacadeRenderMode == .showcase ? "展示" : "效能"
        let safetyText = facadeAutoDowngradedForStability ? "，穩定保護降載" : ""
        facadeHologramStatusText = facadeLifeModeEnabled
            ? "立面全息：已生成（\(modeText)模式、生命感）\(safetyText)"
            : "立面全息：已生成（\(modeText)模式，單指旋轉｜雙指縮放/平移/翻轉）\(safetyText)"
        startFacadeLifeAnimationIfNeeded()
    }

    func rebuildFacadeHologramPreservingPose() {
        guard facadeHologramEnabled else {
            facadeHologramStatusText = "立面全息：尚未生成，請先建立全息"
            return
        }
        guard canRunFacadeRebuild() else { return }
        guard let image = blueprintInputImage else {
            facadeHologramStatusText = "立面全息：缺少立面圖，無法重建"
            return
        }
        guard let arView else {
            facadeHologramStatusText = "立面全息：AR 尚未就緒"
            return
        }

        let savedAnchorPosition = facadeHologramAnchor?.position
        let savedScale = facadeHologramScale
        let savedYaw = facadeHologramYaw
        let savedPitch = facadeHologramPitch
        let savedRoll = facadeHologramRoll
        facadeSnapshotBeforeRebuild = FacadeHologramSnapshot(
            anchorPosition: savedAnchorPosition,
            scale: savedScale,
            yaw: savedYaw,
            pitch: savedPitch,
            roll: savedRoll,
            renderMode: activeFacadeRenderMode
        )
        facadeSnapshotAvailable = true
        let requestedRenderMode: HologramRenderMode?
        let allowAutoDowngrade: Bool
        switch facadeRebuildMode {
        case .auto:
            requestedRenderMode = nil
            allowAutoDowngrade = true
        case .lockPerformance:
            requestedRenderMode = .performance
            allowAutoDowngrade = false
        case .forceShowcase:
            requestedRenderMode = .showcase
            allowAutoDowngrade = false
        }

        clearFacadeHologramAnchor()
        facadeHologramScale = savedScale
        facadeHologramYaw = savedYaw
        facadeHologramPitch = savedPitch
        facadeHologramRoll = savedRoll

        let rebuiltAnchor = buildFacadeHologramAnchor(
            image: image,
            referenceTransform: arView.session.currentFrame?.camera.transform,
            requestedRenderMode: requestedRenderMode,
            allowAutoDowngrade: allowAutoDowngrade
        )
        if let savedAnchorPosition {
            rebuiltAnchor.position = savedAnchorPosition
        }
        arView.scene.addAnchor(rebuiltAnchor)
        facadeHologramAnchor = rebuiltAnchor
        facadeHologramEnabled = true
        applyFacadeHologramTransform()

        let modeText = activeFacadeRenderMode == .showcase ? "展示" : "效能"
        let rebuildModeText: String
        switch facadeRebuildMode {
        case .auto:
            rebuildModeText = "自動"
        case .lockPerformance:
            rebuildModeText = "鎖定降載"
        case .forceShowcase:
            rebuildModeText = "強制展示"
        }
        let safetyText = facadeAutoDowngradedForStability ? "，穩定保護降載" : ""
        facadeHologramStatusText = "立面全息：已重建（\(rebuildModeText)，保留姿態，\(modeText)模式）\(safetyText)"
        startFacadeLifeAnimationIfNeeded()
        beginFacadeRebuildCooldown(seconds: 1.2, reason: "重建保護：冷卻中")
    }

    func restoreFacadeHologramSnapshot() {
        guard let snapshot = facadeSnapshotBeforeRebuild else {
            facadeHologramStatusText = "立面全息：沒有可回復的快照"
            return
        }
        guard let image = blueprintInputImage else {
            facadeHologramStatusText = "立面全息：缺少立面圖，無法回復"
            return
        }
        guard let arView else {
            facadeHologramStatusText = "立面全息：AR 尚未就緒"
            return
        }

        clearFacadeHologramAnchor()
        facadeHologramScale = snapshot.scale
        facadeHologramYaw = snapshot.yaw
        facadeHologramPitch = snapshot.pitch
        facadeHologramRoll = snapshot.roll

        let restoredAnchor = buildFacadeHologramAnchor(
            image: image,
            referenceTransform: arView.session.currentFrame?.camera.transform,
            requestedRenderMode: snapshot.renderMode,
            allowAutoDowngrade: false
        )
        if let anchorPosition = snapshot.anchorPosition {
            restoredAnchor.position = anchorPosition
        }
        arView.scene.addAnchor(restoredAnchor)
        facadeHologramAnchor = restoredAnchor
        facadeHologramEnabled = true
        applyFacadeHologramTransform()
        facadeHologramStatusText = "立面全息：已回復到重建前快照"
        startFacadeLifeAnimationIfNeeded()

        facadeSnapshotBeforeRebuild = nil
        facadeSnapshotAvailable = false
    }

    func runLocalIBMScheduleSimulation() {
        ibmScheduleStatusText = "IBM 排程：模擬中..."
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd"

        let tasks: [LocalScheduleTask] = [
            .init(id: "T001", name: "放樣/定位", durationDays: 1),
            .init(id: "T002", name: "模板工程", durationDays: 2),
            .init(id: "T003", name: "鋼筋工程", durationDays: 2),
            .init(id: "T004", name: "機電預埋", durationDays: 2),
            .init(id: "T005", name: "混凝土澆置", durationDays: 1),
            .init(id: "T006", name: "養護與複測", durationDays: 3)
        ]

        var pointer = Calendar.current.startOfDay(for: Date())
        var lines: [String] = []
        for task in tasks {
            let start = pointer
            let finish = Calendar.current.date(byAdding: .day, value: max(1, task.durationDays) - 1, to: start) ?? start
            lines.append("[\(task.id)] \(task.name) \(formatter.string(from: start)) -> \(formatter.string(from: finish))")
            pointer = Calendar.current.date(byAdding: .day, value: max(1, task.durationDays), to: start) ?? pointer
        }

        if ifcModelElementCount > 0 {
            lines.insert("模型關聯：已載入 IFC 元件 \(ifcModelElementCount) 件", at: 0)
        } else {
            lines.insert("模型關聯：未載入 IFC，使用標準排程樣板", at: 0)
        }

        ibmSchedulePreviewLines = lines
        ibmScheduleStatusText = "IBM 排程：本地模擬完成（可作為現場執行順序）"
    }

    func runIBMCloudScheduleSimulation() async {
        guard quantumIBMCloudEnabled else {
            ibmScheduleStatusText = "IBM 排程：請先開啟 IBM Cloud API"
            return
        }
        guard let apiKey = readSecureSecretWithMigration(
            account: quantumIBMAPIKeyStorageKey,
            legacyUserDefaultsKey: quantumIBMAPIKeyStorageKey
        ) else {
            ibmScheduleStatusText = "IBM 排程：未設定 API Key"
            return
        }

        ibmScheduleStatusText = "IBM 排程：送到雲端中..."
        do {
            let jobID = try await submitIBMRuntimeJob(
                apiKey: apiKey,
                backend: quantumIBMBackend,
                shots: quantumIBMShots
            )
            let status = try await pollIBMRuntimeJobStatus(apiKey: apiKey, jobID: jobID)
            var resultLine = "結果：狀態 \(status)"
            if status == "completed" || status == "done" {
                let summary = try await fetchIBMRuntimeResultSummary(apiKey: apiKey, jobID: jobID)
                resultLine = "結果：\(summary)"
            }
            ibmSchedulePreviewLines = [
                "雲端 Job：\(jobID)",
                "Backend：\(quantumIBMBackend)｜Shots：\(quantumIBMShots)",
                resultLine
            ]
            ibmScheduleStatusText = "IBM 排程：雲端完成"
        } catch {
            ibmScheduleStatusText = "IBM 排程：雲端失敗（\(error.localizedDescription)）"
            ibmSchedulePreviewLines = ["雲端錯誤：\(error.localizedDescription)"]
        }
    }

    func setCrackCalibrationCmPerPixel(_ value: Double) {
        crackCalibrationCmPerPixel = clampCrackCalibration(value)
        UserDefaults.standard.set(crackCalibrationCmPerPixel, forKey: crackCalibrationStorageKey)
    }

    func refreshCrackPreviewFromCurrentFrame() {
        if let live = captureCurrentFrameForCrackDetection() {
            crackInputImage = live.image
            crackStatusText = "裂縫檢測：已更新鏡頭預覽，可直接執行分析"
        } else {
            crackStatusText = "裂縫檢測：鏡頭預覽尚未就緒，請稍後重試"
        }
    }

    func runCrackDetection() {
        let source: (image: UIImage, cgImage: CGImage, label: String)
        if let liveSource = captureCurrentFrameForCrackDetection() {
            source = (liveSource.image, liveSource.cgImage, "鏡頭即時")
        } else if let image = crackInputImage, let cgImage = image.cgImage {
            source = (image, cgImage, "備援照片")
        } else {
            crackStatusText = "裂縫檢測：鏡頭畫面未就緒，請先對準牆面裂縫"
            return
        }

        crackInputImage = source.image
        crackStatusText = "裂縫檢測：\(source.label)分析中..."
        let calibration = crackCalibrationCmPerPixel
        let cgImage = source.cgImage

        Task.detached(priority: .userInitiated) {
            let result = Self.detectCracks(cgImage: cgImage, calibrationCmPerPixel: calibration)
            await MainActor.run {
                switch result {
                case .success(let findings):
                    self.crackFindings = findings
                    self.crackMaxLengthCm = findings.map(\.lengthCm).max() ?? 0
                    self.crackSeveritySummary = self.summarizeSeverity(findings)
                    if findings.isEmpty {
                        self.crackStatusText = "裂縫檢測：未找到明顯裂縫"
                    } else {
                        self.crackStatusText = "裂縫檢測：完成（\(findings.count) 條疑似裂縫）"
                    }
                case .failure:
                    self.crackFindings = []
                    self.crackMaxLengthCm = 0
                    self.crackSeveritySummary = "無"
                    self.crackStatusText = "裂縫檢測：分析失敗，請提高照明後重試"
                }
            }
        }
    }

    private func captureCurrentFrameForCrackDetection() -> (image: UIImage, cgImage: CGImage)? {
        guard let frame = arView?.session.currentFrame else { return nil }
        let pixelBuffer = frame.capturedImage
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        guard let cgImage = ciContext.createCGImage(ciImage, from: rect) else { return nil }
        let uiImage = UIImage(cgImage: cgImage)
        return (uiImage, cgImage)
    }

    func activateQuantumMode(command: String, source: String = "manual") {
        var trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
        if source == "manual" && trimmed.isEmpty {
            // Allow manual button to work without requiring text input.
            trimmed = "核心引擎啟動"
        }
        quantumLastCommandText = trimmed
        guard isQuantumCommandValid(trimmed) else {
            quantumStatusText = "核心引擎：口令不符，請使用授權口令"
            return
        }
        quantumModeEnabled = true
        UserDefaults.standard.set(true, forKey: quantumModeStorageKey)
        if !highestModeLockEnabled {
            setHighestModeLockEnabled(true)
        }
        autoCorrectionEnabled = true
        autoCorrectionRoundsDone = 0
        refreshAutoCorrectionStatus()
        maybeRunAutoCorrection()
        refreshQuantumProviderText()
        if quantumIBMCloudEnabled && hasIBMQuantumAPIKey {
            quantumStatusText = "核心引擎：已啟用，IBM 雲端輔助上線"
            Task {
                await runIBMQuantumRuntimeJob()
            }
        } else if quantumIBMCloudEnabled {
            quantumStatusText = "核心引擎：已啟用，IBM Key 未設置，使用本地模式"
        } else {
            quantumStatusText = "核心引擎：已啟用，戰術增益上線"
        }
        refreshQuantumTelemetry()
        appendQuantumHistory(
            source: source,
            command: trimmed,
            beforeScore: qaScore,
            afterScore: qaScore,
            status: quantumStatusText
        )
    }

    func deactivateQuantumMode(source: String = "manual-off") {
        quantumModeEnabled = false
        UserDefaults.standard.set(false, forKey: quantumModeStorageKey)
        autoCorrectionEnabled = false
        autoCorrectionStatusText = "自動連續矯正：關"
        quantumCoreLevel = 0
        quantumStatusText = "核心引擎：已解除"
        stopQuantumVoiceCommand()
        appendQuantumHistory(
            source: source,
            command: "deactivate",
            beforeScore: qaScore,
            afterScore: qaScore,
            status: quantumStatusText
        )
    }

    func clearQuantumHistory() {
        quantumHistory.removeAll()
        persistQuantumHistory()
    }

    func runQuantumFusionAutopilot() {
        guard quantumModeEnabled else {
            quantumStatusText = "核心引擎：請先啟用後再執行融合補齊"
            return
        }

        var steps: [String] = []
        recalibrateTracking()
        steps.append("雷射重校準")

        runVolumeScanOnce()
        steps.append("B 體積掃描")

        if crackInputImage != nil || arView?.session.currentFrame != nil {
            runCrackDetection()
            steps.append("C 即時裂縫分析")
        } else {
            steps.append("C 待鏡頭")
        }

        if !arPOCStatusText.contains("已在") && !arPOCStatusText.contains("建立") {
            quantumSuggestionText = "戰術建議：請先完成 A 藍圖對位後再重跑融合"
            steps.append("A 待對位")
        }

        quantumStatusText = "核心引擎：融合補齊已執行（\(steps.joined(separator: "｜"))）"
        refreshQuantumTelemetry()
    }

    func setQuantumIBMCloudEnabled(_ enabled: Bool) {
        quantumIBMCloudEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: quantumIBMCloudEnabledStorageKey)
        refreshQuantumProviderText()
    }

    func setIBMQuantumAPIKey(_ key: String) {
        let sanitized = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if sanitized.isEmpty {
            clearSecureSecret(account: quantumIBMAPIKeyStorageKey)
            UserDefaults.standard.removeObject(forKey: quantumIBMAPIKeyStorageKey)
        } else {
            setSecureSecret(sanitized, account: quantumIBMAPIKeyStorageKey)
            UserDefaults.standard.removeObject(forKey: quantumIBMAPIKeyStorageKey)
        }
        refreshQuantumProviderText()
    }

    func clearIBMQuantumAPIKey() {
        clearSecureSecret(account: quantumIBMAPIKeyStorageKey)
        UserDefaults.standard.removeObject(forKey: quantumIBMAPIKeyStorageKey)
        refreshQuantumProviderText()
    }

    var hasIBMQuantumAPIKey: Bool {
        return readSecureSecretWithMigration(
            account: quantumIBMAPIKeyStorageKey,
            legacyUserDefaultsKey: quantumIBMAPIKeyStorageKey
        ) != nil
    }

    var availableIBMBackends: [String] {
        ["ibm_kyiv", "ibm_sherbrooke", "ibm_brisbane", "ibm_osaka"]
    }

    func setIBMBackend(_ backend: String) {
        quantumIBMBackend = clampIBMBackend(backend)
        UserDefaults.standard.set(quantumIBMBackend, forKey: quantumIBMBackendStorageKey)
    }

    func setIBMShots(_ shots: Int) {
        quantumIBMShots = clampIBMShots(shots)
        UserDefaults.standard.set(quantumIBMShots, forKey: quantumIBMShotsStorageKey)
    }

    func setHighPrecisionContinuousModeEnabled(_ enabled: Bool) {
        highPrecisionContinuousModeEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: highPrecisionContinuousModeStorageKey)
        highPrecisionStatusText = enabled ? "高精度連續模式：已啟用" : "高精度連續模式：已關閉"
    }

    func setDesignTargetDistanceMeters(_ value: Double) {
        designTargetDistanceMeters = clampDesignTarget(value)
        UserDefaults.standard.set(designTargetDistanceMeters, forKey: designTargetDistanceStorageKey)
        refreshDeviationStatus()
    }

    func setDeviationToleranceCm(_ value: Double) {
        deviationToleranceCm = clampDeviationToleranceCm(value)
        UserDefaults.standard.set(deviationToleranceCm, forKey: deviationToleranceStorageKey)
        refreshDeviationStatus()
    }

    func prepareDistanceForRecording() -> Double? {
        guard let rawDistance = latestDistanceMeters else {
            highPrecisionStatusText = "高精度連續模式：尚未鎖定量測距離"
            return nil
        }
        guard highPrecisionContinuousModeEnabled else {
            highPrecisionStatusText = "高精度連續模式：使用即時距離記錄"
            return rawDistance
        }

        guard let arView else {
            highPrecisionStatusText = "高精度連續模式：AR 畫面未就緒"
            return nil
        }

        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        var distances: [Double] = []
        for _ in 0..<3 {
            let results = arView.raycast(from: center, allowing: .estimatedPlane, alignment: .any)
            guard let first = results.first, let frame = arView.session.currentFrame else { continue }
            let world = first.worldTransform.columns.3
            let camera = frame.camera.transform.columns.3
            let dx = world.x - camera.x
            let dy = world.y - camera.y
            let dz = world.z - camera.z
            distances.append(Double(sqrt(dx * dx + dy * dy + dz * dz)))
        }

        guard distances.count == 3 else {
            highPrecisionStatusText = "高精度連續模式：3 次取樣不足，請穩定後重試"
            return nil
        }

        let median = medianValue(distances)
        let maxDeviation = distances.map { abs($0 - median) }.max() ?? 0
        if maxDeviation > 0.015 {
            highPrecisionStatusText = String(
                format: "高精度連續模式：波動偏高（±%.3fm），請重測",
                maxDeviation
            )
            return nil
        }

        latestDistanceMeters = median
        distanceText = String(format: "%.2f m", median)
        appendRecentDistance(median)
        highPrecisionStatusText = String(
            format: "高精度連續模式：已取中位數 %.2fm（3 次）",
            median
        )
        return median
    }

    func startQuantumVoiceCommand() {
        guard !quantumVoiceListening else { return }
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in
            Task { @MainActor in
                guard let self else { return }
                guard auth == .authorized else {
                    self.quantumStatusText = "核心引擎：語音權限未開啟"
                    return
                }
                await self.beginSpeechSession()
            }
        }
    }

    func stopQuantumVoiceCommand() {
        audioEngine.stop()
        if speechTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            speechTapInstalled = false
        }
        speechRequest?.endAudio()
        speechTask?.cancel()
        speechTask = nil
        speechRequest = nil
        let wasListening = quantumVoiceListening
        quantumVoiceListening = false
        if wasListening && quantumStatusText.contains("語音監聽中") {
            quantumStatusText = "核心引擎：語音監聽已停止"
        }
    }

    var aiCanAutoCorrect: Bool {
        aiIssue != .none
    }

    func applyAIQACorrection() {
        let beforeScore = qaScore
        let beforeLevel = qaLevel
        let beforeProfile = qaProfile
        let issueSnapshot = aiDiagnosisText
        var actionSummary = "AI QA：目前狀態良好，無需矯正"

        switch aiIssue {
        case .none:
            aiLastActionText = actionSummary
        case .noSurface:
            recalibrateTracking()
            actionSummary = "AI QA：已重置追蹤，請對準平面再量測"
            aiLastActionText = actionSummary
        case .unstable:
            if qaProfile != .standard {
                setQAProfile(.standard)
                actionSummary = "AI QA：已切換為標準模式，提升抗抖容忍"
                aiLastActionText = actionSummary
            } else {
                actionSummary = "AI QA：請固定手持 1 秒，降低抖動後再記錄"
                aiLastActionText = actionSummary
            }
        case .tilt:
            actionSummary = "AI QA：請調整裝置水平，讓 Pitch / Roll 接近 0°"
            aiLastActionText = actionSummary
        case .insufficientSamples:
            actionSummary = "AI QA：請保持準星穩定約 1 秒，補足樣本數"
            aiLastActionText = actionSummary
        case .lowScore:
            if qaProfile == .ultra {
                setQAProfile(.strict)
                actionSummary = "AI QA：已從超嚴格調整為嚴格模式"
                aiLastActionText = actionSummary
            } else if qaProfile == .strict {
                setQAProfile(.standard)
                actionSummary = "AI QA：已從嚴格調整為標準模式"
                aiLastActionText = actionSummary
            } else {
                recalibrateTracking()
                actionSummary = "AI QA：已重置追蹤，請重新對準量測目標"
                aiLastActionText = actionSummary
            }
        }

        pendingCorrectionEvaluation = PendingCorrectionEvaluation(
            issueSummary: issueSnapshot,
            actionSummary: actionSummary,
            beforeScore: beforeScore,
            beforeLevel: beforeLevel,
            beforeProfile: beforeProfile,
            remainingCycles: 6
        )
    }

    func toggleAutoCorrection() {
        autoCorrectionEnabled.toggle()
        autoCorrectionRoundsDone = 0
        if autoCorrectionEnabled {
            refreshAutoCorrectionStatus()
            maybeRunAutoCorrection()
        } else {
            autoCorrectionStatusText = "自動連續矯正：關"
        }
    }

    func setAutoCorrectionStrategy(_ strategy: AIAutoCorrectionStrategy) {
        autoCorrectionStrategy = strategy
        UserDefaults.standard.set(strategy.rawValue, forKey: autoCorrectionStrategyStorageKey)
        refreshAutoCorrectionStatus()
    }

    func setAICloudEnabled(_ enabled: Bool) {
        aiCloudEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: aiCloudEnabledStorageKey)
    }

    func setOpenAIKey(_ key: String) {
        let sanitized = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if sanitized.isEmpty {
            clearSecureSecret(account: aiOpenAIKeyStorageKey)
            UserDefaults.standard.removeObject(forKey: aiOpenAIKeyStorageKey)
        } else {
            setSecureSecret(sanitized, account: aiOpenAIKeyStorageKey)
            UserDefaults.standard.removeObject(forKey: aiOpenAIKeyStorageKey)
        }
    }

    func clearOpenAIKey() {
        clearSecureSecret(account: aiOpenAIKeyStorageKey)
        UserDefaults.standard.removeObject(forKey: aiOpenAIKeyStorageKey)
    }

    var hasOpenAIKey: Bool {
        return readSecureSecretWithMigration(
            account: aiOpenAIKeyStorageKey,
            legacyUserDefaultsKey: aiOpenAIKeyStorageKey
        ) != nil
    }

    func runAIAssistant(userGoal: String) {
        aiAssistantBusy = true
        aiAssistantText = "AI 助手：分析中..."

        let cloudKey = aiCloudEnabled
            ? readSecureSecretWithMigration(account: aiOpenAIKeyStorageKey, legacyUserDefaultsKey: aiOpenAIKeyStorageKey)
            : nil
        let context = AIAdvisorContext(
            distanceMeters: latestDistanceMeters,
            pitchDegrees: latestPitchDegrees,
            rollDegrees: latestRollDegrees,
            qaLevelText: qaLevelText,
            qaProfileText: qaProfile.displayName,
            qaScore: qaScore,
            aiDiagnosisText: aiDiagnosisText
        )

        Task {
            let result = await generateAIAdvice(context: context, userGoal: userGoal, openAIKey: cloudKey)
            aiAssistantText = result.text
            aiAssistantSourceText = "來源：\(result.source)"
            aiAssistantApplyResultText = "建議已更新，尚未套用"
            aiAssistantBusy = false
        }
    }

    func applyAIAssistantRecommendation() {
        var actions: [String] = []
        let text = aiAssistantText

        // Prefer explicit mode instructions if the AI output mentions one.
        if text.contains("超嚴格"), qaProfile != .ultra {
            setQAProfile(.ultra)
            actions.append("QA 模式切換為超嚴格")
        } else if text.contains("嚴格"), qaProfile != .strict {
            setQAProfile(.strict)
            actions.append("QA 模式切換為嚴格")
        } else if text.contains("標準"), qaProfile != .standard {
            setQAProfile(.standard)
            actions.append("QA 模式切換為標準")
        }

        if text.contains("校準") || text.contains("重置追蹤") {
            recalibrateTracking()
            actions.append("已重置追蹤")
        }

        if aiIssue != .none {
            applyAIQACorrection()
            actions.append("已執行 AI QA 一鍵矯正")
        } else if actions.isEmpty {
            if qaScore < 60 {
                applyAIQACorrection()
                actions.append("分數偏低，已執行 AI QA 一鍵矯正")
            } else {
                actions.append("目前品質穩定，無需自動調整")
            }
        }

        aiAssistantApplyResultText = "套用結果：\(actions.joined(separator: "、"))"
    }

    func clearCorrectionHistory() {
        correctionHistory.removeAll()
        persistCorrectionHistory()
        refreshCorrectionTrend()
    }

    func resetForTesting() {
        // Runtime measurement state
        latestDistanceMeters = nil
        distanceText = "-- m"
        statusText = "測試重置完成，請重新對準目標"
        recentDistances.removeAll()
        recentRawDistances.removeAll()

        // QA / deviation state
        qaLevel = .normal
        qaLevelText = qaLevel.displayName
        qaScore = 0
        aiIssue = .none
        aiDiagnosisText = "AI QA：測試重置完成"
        aiCorrectionText = "建議：請重新進行定比例與量測"
        aiLastActionText = ""
        highPrecisionStatusText = "高精度連續模式：待命"
        deviationValueCm = 0
        deviationStatusText = "偏差檢核：待命"

        // AR mismatch display state
        arPOCStatusText = "AR POC：等待影像錨點"
        arMismatchSummaryText = "AR 偏位檢核：待命"
        arMismatchAlerts = []
        overlayLostSince = nil
        overlayLastUpdateTime = 0

        // Volume scan state
        volumeEstimateM3 = 0
        volumeSampleCount = 0
        volumeScanPreviewPoints = []
        volumeStatusText = "體積掃描：待命"
        refreshVolumeAreaM2()

        // Uploaded blueprint state
        blueprintInputImage = nil
        blueprintUploadStatusText = "圖紙：尚未上傳"
        multiViewSamples = []
        multiViewSampleCount = 0
        multiViewStatusText = "多視角重建：尚未收集樣本"
        multiViewPackagePreviewLines = []
        ifcElements = []
        ifcModelElementCount = 0
        ifcModelSummaryText = "IFC 模型：尚未匯入"
        ifcShowWalls = true
        ifcShowRebars = true
        ifcShowPipes = true
        twdStakingPoints = []
        twdStakingStatusText = "放樣：待命"
        clearTWDStakingPreviewAnchor()
        twdStakingPreviewStatusText = "放樣點顯示：關"
        clearFacadeHologramAnchor()
        facadeHologramStatusText = "立面全息：待命"
        blueprintQuickStakeStatusText = "圖紙快速放樣：待命"
        clearIFCSimulationAnchor()
        ifcSimulationStatusText = "IFC 模擬：待命"

        // Crack detection state
        crackInputImage = nil
        crackFindings = []
        crackMaxLengthCm = 0
        crackSeveritySummary = "無"
        crackStatusText = "裂縫檢測：待命"

        // Quantum runtime state (keep user settings, clear runtime telemetry)
        quantumModeEnabled = false
        UserDefaults.standard.set(false, forKey: quantumModeStorageKey)
        stopQuantumVoiceCommand()
        quantumCoreLevel = 0
        quantumStatusText = "核心引擎：待命"
        quantumSuggestionText = "戰術建議：目前無需啟動"
        quantumFusionStatusText = "融合狀態：待命"
        quantumIBMJobText = "IBM Job：尚未送出"
        quantumIBMResultText = "IBM Result：尚無資料"
        quantumLastCommandText = ""
        quantumHistory.removeAll()
        persistQuantumHistory()
    }

    private func configureSession(on view: ARView) {
        guard ARWorldTrackingConfiguration.isSupported else {
            statusText = "此裝置不支援 ARWorldTracking"
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]
        // Try both group names for backward compatibility.
        let primaryReferenceImages = ARReferenceImage.referenceImages(
            inGroupNamed: "ARBlueprints",
            bundle: nil
        )
        let fallbackReferenceImages = ARReferenceImage.referenceImages(
            inGroupNamed: "ARBIueprints",
            bundle: nil
        )
        let referenceImages = primaryReferenceImages ?? fallbackReferenceImages
        if let images = referenceImages {
            configuration.detectionImages = images
            configuration.maximumNumberOfTrackedImages = 1
            print("✅ 阿基系統回報：成功掛載 AR 藍圖標靶！")
        } else {
            print("❌ 阿基系統警告：找不到 AR 藍圖標靶資源群組！")
        }
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
            if meshVisualizationEnabled {
                view.debugOptions.insert(.showSceneUnderstanding)
            } else {
                view.debugOptions.remove(.showSceneUnderstanding)
            }
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }

        view.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        statusText = "LiDAR 量測中"
    }

    private func beginPolling() {
        updateTimer?.invalidate()
        updateTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.updateMeasurement()
            }
        }
    }

    private func updateMeasurement() {
        guard let arView, let frame = arView.session.currentFrame else { return }
        updateARImagePOCOverlay(from: frame)

        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        let results = arView.raycast(from: center, allowing: .estimatedPlane, alignment: .any)

        if let first = results.first {
            let world = first.worldTransform.columns.3
            let camera = frame.camera.transform.columns.3
            let dx = world.x - camera.x
            let dy = world.y - camera.y
            let dz = world.z - camera.z
            let rawDistance = Double(sqrt(dx * dx + dy * dy + dz * dz))
            appendRawDistance(rawDistance)
            let distance = smoothedDistance(rawDistance)
            latestDistanceMeters = distance
            distanceText = String(format: "%.2f m", distance)
            appendRecentDistance(distance)
            statusText = "已鎖定目標"
        } else {
            latestDistanceMeters = nil
            distanceText = "-- m"
            recentDistances.removeAll()
            recentRawDistances.removeAll()
            qaLevel = .normal
            qaLevelText = qaLevel.displayName
            qaScore = 0
            statusText = "未偵測到可量測表面"
            aiIssue = .noSurface
            aiDiagnosisText = "AI QA：未偵測到可量測表面"
            aiCorrectionText = "建議：對準牆面/地面後點選 AI 矯正重置追蹤"
        }

        let euler = frame.camera.eulerAngles
        latestPitchDegrees = radiansToDegrees(Double(euler.x))
        latestRollDegrees = radiansToDegrees(Double(euler.z))
        pitchText = String(format: "%.1f°", latestPitchDegrees)
        rollText = String(format: "%.1f°", latestRollDegrees)
        refreshDeviationStatus()
        refreshQALevel()
        refreshQuantumTelemetry()
    }

    private func radiansToDegrees(_ value: Double) -> Double {
        value * 180.0 / .pi
    }

    private func updateARImagePOCOverlay(from frame: ARFrame) {
        guard let arView else { return }
        let now = Date().timeIntervalSinceReferenceDate
        guard let imageAnchor = frame.anchors.compactMap({ $0 as? ARImageAnchor }).first else {
            if overlayLostSince == nil {
                overlayLostSince = now
            }
            if let lostSince = overlayLostSince,
               now - lostSince >= overlayLostDebounceSec,
               overlayAnchorEntity != nil {
                overlayAnchorEntity?.removeFromParent()
                overlayAnchorEntity = nil
                overlayImageName = nil
                overlayConfigSignature = ""
                arPOCStatusText = "AR POC：影像暫時失鎖，等待重新對位"
                arMismatchSummaryText = "AR 偏位檢核：標靶失鎖"
                arMismatchAlerts = ["請重新對準藍圖標靶"]
            }
            return
        }
        overlayLostSince = nil

        let imageName = imageAnchor.referenceImage.name ?? "未命名圖紙"
        let signature = currentOverlaySignature(imageName: imageName)
        let needsRebuild = overlayAnchorEntity == nil || overlayImageName != imageName || overlayConfigSignature != signature
        if needsRebuild {
            overlayAnchorEntity?.removeFromParent()
            let anchor = buildPOCRebarAnchor(from: imageAnchor)
            arView.scene.addAnchor(anchor)
            overlayAnchorEntity = anchor
            overlayImageName = imageName
            overlayConfigSignature = signature
            overlayLastUpdateTime = now
            arPOCStatusText = "AR POC：已在 \(imageName) 上建立 3D 鋼筋/管線/牆面錨點"
            triggerQuantumRunOnBlueprintLockIfNeeded(imageName: imageName, now: now)
        } else if now - overlayLastUpdateTime < overlayUpdateIntervalSec {
            return
        } else {
            overlayLastUpdateTime = now
        }
        refreshARMismatchDiagnostics(from: imageAnchor)
    }

    private func triggerQuantumRunOnBlueprintLockIfNeeded(imageName: String, now: TimeInterval) {
        guard quantumModeEnabled, quantumIBMCloudEnabled, hasIBMQuantumAPIKey else { return }
        if isBlueprintQuantumJobRunning {
            quantumIBMJobText = "IBM Job：藍圖任務進行中，等待上一筆完成"
            return
        }
        if lastQuantumTriggerImageName == imageName, now - lastQuantumTriggerAt < quantumTriggerCooldownSec {
            return
        }
        if quantumIBMJobText.contains("送出中") {
            return
        }

        lastQuantumTriggerImageName = imageName
        lastQuantumTriggerAt = now
        isBlueprintQuantumJobRunning = true
        quantumIBMJobText = "IBM Job：藍圖 \(imageName) 鎖定，觸發最佳化..."
        Task { [weak self] in
            guard let self else { return }
            do {
                let summary = try await QuantumManager.shared.optimizeBlueprint(blueprintName: imageName)
                await MainActor.run {
                    self.isBlueprintQuantumJobRunning = false
                    self.quantumIBMJobText = "IBM Job：藍圖 \(imageName) 最佳化完成"
                    self.quantumIBMResultText = "IBM Result：\(summary)"
                    self.quantumStatusText = "核心引擎：藍圖鎖定已觸發最佳化"
                }
            } catch {
                await MainActor.run {
                    self.isBlueprintQuantumJobRunning = false
                    self.quantumIBMJobText = "IBM Job：藍圖 \(imageName) 最佳化失敗"
                    self.quantumIBMResultText = "IBM Result：\(error.localizedDescription)"
                    self.quantumStatusText = "核心引擎：藍圖最佳化失敗，已維持本地模式"
                }
            }
        }
    }

    private func buildPOCRebarAnchor(from imageAnchor: ARImageAnchor) -> AnchorEntity {
        let anchor = AnchorEntity(world: imageAnchor.transform)
        let root = Entity()
        let offsetX = Float(overlayOffsetXcm / 100.0)
        let offsetY = Float(overlayOffsetYcm / 100.0)
        let rotationRad = Float(overlayRotationDeg * .pi / 180.0)
        let scale = Float(overlayScale)
        root.position = [offsetX, offsetY, 0]
        root.orientation = simd_quatf(angle: rotationRad, axis: [0, 0, 1])
        root.scale = [scale, scale, scale]
        anchor.addChild(root)

        let imageWidth = max(0.12, Float(imageAnchor.referenceImage.physicalSize.width))
        let imageHeight = max(0.12, Float(imageAnchor.referenceImage.physicalSize.height))
        let coverMeters = Float(rebarCoverCm / 100.0)
        let usableWidth = max(0.04, imageWidth - coverMeters * 2)
        let usableHeight = max(0.04, imageHeight - coverMeters * 2)
        let barDepth: Float = 0.006
        let barThickness: Float = 0.004
        let zLift: Float = 0.012

        // Semi-transparent base plane for POC alignment feedback.
        let planeMesh = MeshResource.generatePlane(width: usableWidth, depth: usableHeight)
        let planeMat = SimpleMaterial(color: UIColor.systemTeal.withAlphaComponent(0.25), isMetallic: false)
        let plane = ModelEntity(mesh: planeMesh, materials: [planeMat])
        plane.position = [0, 0, 0.001]
        plane.orientation = simd_quatf(angle: .pi / 2, axis: [1, 0, 0])
        root.addChild(plane)

        // Virtual wall overlay for on-site alignment check.
        let wallMesh = MeshResource.generatePlane(width: usableWidth, depth: usableHeight * 0.95)
        let wallMat = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.22), isMetallic: false)
        let wall = ModelEntity(mesh: wallMesh, materials: [wallMat])
        wall.position = [0, 0, zLift + 0.002]
        wall.orientation = simd_quatf(angle: .pi / 2, axis: [1, 0, 0])
        root.addChild(wall)

        // High-visibility debug hologram block (user requested "red 3D box on blueprint").
        let blockWidth = min(usableWidth * 0.38, 0.10)
        let blockDepth = min(usableHeight * 0.38, 0.10)
        let blockHeight: Float = 0.05
        let blockMesh = MeshResource.generateBox(size: [blockWidth, blockHeight, blockDepth])
        let blockMaterial = SimpleMaterial(color: .systemRed, roughness: 0.08, isMetallic: true)
        let hologramBlock = ModelEntity(mesh: blockMesh, materials: [blockMaterial])
        hologramBlock.position = [0, 0, zLift + (blockHeight / 2) + 0.012]
        root.addChild(hologramBlock)

        // Virtual pipeline overlays (two lines) for deviation spotting.
        let pipeMesh = MeshResource.generateCylinder(height: usableWidth * 0.92, radius: 0.006)
        let pipeMatA = SimpleMaterial(color: .systemGreen, roughness: 0.15, isMetallic: true)
        let pipeMatB = SimpleMaterial(color: .systemYellow, roughness: 0.15, isMetallic: true)
        let pipeY = usableHeight * 0.24
        let pipeA = ModelEntity(mesh: pipeMesh, materials: [pipeMatA])
        pipeA.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
        pipeA.position = [0, pipeY, zLift + 0.01]
        root.addChild(pipeA)

        let pipeB = ModelEntity(mesh: pipeMesh, materials: [pipeMatB])
        pipeB.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
        pipeB.position = [0, -pipeY, zLift + 0.01]
        root.addChild(pipeB)

        // Vertical rebars.
        let verticalMesh = MeshResource.generateBox(
            width: barThickness,
            height: usableHeight,
            depth: barDepth
        )
        let verticalMat = SimpleMaterial(color: .systemRed, roughness: 0.2, isMetallic: true)
        let mainBarCount = max(2, rebarMainBarCount)
        for index in 0..<mainBarCount {
            let normalized = Float(index) / Float(max(1, mainBarCount - 1))
            let x = (-usableWidth / 2) + (usableWidth * normalized)
            let bar = ModelEntity(mesh: verticalMesh, materials: [verticalMat])
            bar.position = [x, 0, zLift]
            root.addChild(bar)
        }

        // Horizontal stirrups.
        let horizontalMesh = MeshResource.generateBox(
            width: usableWidth,
            height: barThickness,
            depth: barDepth
        )
        let horizontalMat = SimpleMaterial(color: .systemOrange, roughness: 0.25, isMetallic: true)
        let spacingMeters = Float(rebarStirrupSpacingCm / 100.0)
        let stirrupCount = max(2, Int((usableHeight / spacingMeters).rounded()) + 1)
        for index in 0..<stirrupCount {
            let normalized = Float(index) / Float(max(1, stirrupCount - 1))
            let y = (-usableHeight / 2) + (usableHeight * normalized)
            let stirrup = ModelEntity(mesh: horizontalMesh, materials: [horizontalMat])
            stirrup.position = [0, y, zLift]
            root.addChild(stirrup)
        }

        return anchor
    }

    private func buildIFCSimulationAnchor(referenceTransform: simd_float4x4?) -> AnchorEntity {
        let anchor = AnchorEntity(world: matrix_identity_float4x4)
        if let cameraTransform = referenceTransform {
            let forward = SIMD3<Float>(
                -cameraTransform.columns.2.x,
                -cameraTransform.columns.2.y,
                -cameraTransform.columns.2.z
            )
            let cameraPos = SIMD3<Float>(
                cameraTransform.columns.3.x,
                cameraTransform.columns.3.y,
                cameraTransform.columns.3.z
            )
            anchor.position = cameraPos + (forward * 1.2) + SIMD3<Float>(0, -0.18, 0)
        } else {
            anchor.position = [0, 0, -1.2]
        }

        let root = Entity()
        anchor.addChild(root)

        if ifcElements.isEmpty {
            // Fallback demo geometry when no IFC-JSON payload exists.
            addFallbackIFCEntities(to: root, blueprintImage: blueprintInputImage)
        } else {
            addIFCEntities(from: ifcElements, to: root)
        }
        root.scale = SIMD3<Float>(repeating: 1.08)

        return anchor
    }

    private func addFallbackIFCEntities(to root: Entity, blueprintImage: UIImage?) {
        guard ifcShowWalls || ifcShowRebars || ifcShowPipes else { return }
        let depthMap = blueprintImage.flatMap { makeFacadeDepthMap(from: $0, maxDimension: 72) }
        let avgLuma: Float = {
            guard let map = depthMap, !map.lumaBytes.isEmpty else { return 0.52 }
            let sum = map.lumaBytes.reduce(0) { $0 + Int($1) }
            return Float(sum) / Float(map.lumaBytes.count * 255)
        }()
        let contrast: Float = {
            guard let map = depthMap, !map.lumaBytes.isEmpty else { return 0.28 }
            let mean = avgLuma * 255
            let variance = map.lumaBytes.reduce(Float(0)) { partial, b in
                let d = Float(b) - mean
                return partial + d * d
            } / Float(map.lumaBytes.count * 255 * 255)
            return min(0.55, max(0.12, sqrt(variance)))
        }()
        let imageRatio: Float = {
            guard let size = blueprintImage?.size, size.width > 0 else { return 1.45 }
            return min(2.2, max(0.6, Float(size.height / size.width)))
        }()

        if ifcShowWalls {
            let wallWidth = min(2.1, max(1.15, 1.15 + imageRatio * 0.5))
            let wallHeight = min(3.3, max(2.2, 2.2 + (1 - avgLuma) * 1.1))
            let wallDepth = min(0.28, max(0.12, 0.12 + contrast * 0.22))
            let wallMesh = MeshResource.generateBox(size: [wallWidth, wallHeight, wallDepth])
            let wallMaterial = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.4), roughness: 0.24, isMetallic: false)
            let wallEntity = ModelEntity(mesh: wallMesh, materials: [wallMaterial])
            wallEntity.position = [0, wallHeight / 2, 0]
            root.addChild(wallEntity)
        }
        if ifcShowRebars {
            let rebarVerticalMesh = MeshResource.generateBox(size: [0.012, 2.45, 0.012])
            let rebarHorizontalMesh = MeshResource.generateBox(size: [1.42, 0.01, 0.01])
            let rebarMaterial = SimpleMaterial(color: .systemRed, roughness: 0.14, isMetallic: true)
            let stirrupMaterial = SimpleMaterial(color: .systemOrange, roughness: 0.2, isMetallic: true)
            let verticalCount = max(4, min(11, Int((contrast * 16).rounded())))
            let wallSpan: Float = min(1.9, max(1.1, 1.05 + imageRatio * 0.45))
            for index in 0..<verticalCount {
                let normalized = Float(index) / Float(max(1, verticalCount - 1))
                let x = -wallSpan / 2 + wallSpan * normalized
                let bar = ModelEntity(mesh: rebarVerticalMesh, materials: [rebarMaterial])
                bar.position = [x, 1.35, -0.02]
                root.addChild(bar)
            }
            let stirrupCount = max(7, min(14, Int((7 + (1 - avgLuma) * 8).rounded())))
            let stirrupSpacing = 2.2 / Float(max(1, stirrupCount))
            for index in 0..<stirrupCount {
                let y = 0.25 + Float(index) * stirrupSpacing
                let stirrup = ModelEntity(mesh: rebarHorizontalMesh, materials: [stirrupMaterial])
                stirrup.position = [0, y, -0.02]
                root.addChild(stirrup)
            }
        }
        if ifcShowPipes {
            let pipeLength = min(1.9, max(1.05, 1.0 + imageRatio * 0.42))
            let pipeRadius = min(0.05, max(0.024, 0.024 + contrast * 0.045))
            let pipeMesh = MeshResource.generateCylinder(height: pipeLength, radius: pipeRadius)
            let coldPipeMaterial = SimpleMaterial(color: .systemBlue, roughness: 0.12, isMetallic: true)
            let hotPipeMaterial = SimpleMaterial(color: .systemGreen, roughness: 0.12, isMetallic: true)
            let coldPipe = ModelEntity(mesh: pipeMesh, materials: [coldPipeMaterial])
            coldPipe.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
            let baseY = min(1.35, max(0.85, 0.85 + (1 - avgLuma) * 0.55))
            coldPipe.position = [0, baseY, 0.035]
            root.addChild(coldPipe)
            let hotPipe = ModelEntity(mesh: pipeMesh, materials: [hotPipeMaterial])
            hotPipe.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
            hotPipe.position = [0, baseY + 0.42, 0.035]
            root.addChild(hotPipe)
        }
    }

    private func addIFCEntities(from elements: [IFCElementSpec], to root: Entity) {
        for element in elements {
            switch element.type {
            case .wall where ifcShowWalls:
                let width = Float(max(0.05, element.width ?? 1.2))
                let height = Float(max(0.2, element.height ?? 2.8))
                let depth = Float(max(0.03, element.depth ?? 0.16))
                let mesh = MeshResource.generateBox(size: [width, height, depth])
                let material = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.4), roughness: 0.24, isMetallic: false)
                let entity = ModelEntity(mesh: mesh, materials: [material])
                applyIFCTransform(for: element, to: entity, defaultY: Double(height / 2))
                root.addChild(entity)
            case .rebar where ifcShowRebars:
                let width = Float(max(0.005, element.width ?? 0.012))
                let height = Float(max(0.1, element.height ?? (element.length ?? 1.2)))
                let depth = Float(max(0.005, element.depth ?? 0.012))
                let mesh = MeshResource.generateBox(size: [width, height, depth])
                let material = SimpleMaterial(color: .systemRed, roughness: 0.14, isMetallic: true)
                let entity = ModelEntity(mesh: mesh, materials: [material])
                applyIFCTransform(for: element, to: entity, defaultY: Double(height / 2))
                root.addChild(entity)
            case .pipe where ifcShowPipes:
                let radius = Float(max(0.003, element.radius ?? 0.03))
                let length = Float(max(0.05, element.length ?? element.width ?? 1.2))
                let mesh = MeshResource.generateCylinder(height: length, radius: radius)
                let material = SimpleMaterial(color: .systemGreen, roughness: 0.12, isMetallic: true)
                let entity = ModelEntity(mesh: mesh, materials: [material])
                entity.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
                applyIFCTransform(for: element, to: entity, defaultY: Double(element.y ?? 1.0))
                root.addChild(entity)
            default:
                continue
            }
        }
    }

    private func applyIFCTransform(for element: IFCElementSpec, to entity: ModelEntity, defaultY: Double) {
        let x = Float(element.x ?? 0)
        let y = Float(element.y ?? defaultY)
        let z = Float(element.z ?? 0)
        entity.position = [x, y, z]
        let rotation = Float((element.rotationDeg ?? 0) * .pi / 180.0)
        if rotation != 0 {
            entity.orientation *= simd_quatf(angle: rotation, axis: [0, 1, 0])
        }
    }

    private func regenerateIFCSimulationAnchor() {
        guard let arView else { return }
        ifcSimulationAnchor?.removeFromParent()
        let anchor = buildIFCSimulationAnchor(referenceTransform: arView.session.currentFrame?.camera.transform)
        arView.scene.addAnchor(anchor)
        ifcSimulationAnchor = anchor
        ifcSimulationEnabled = true
        ifcSimulationStatusText = "IFC 模擬：模型已更新"
    }

    private func decodeIFCPayload(from data: Data) throws -> IFCModelPayload {
        let decoder = JSONDecoder()
        if let direct = try? decoder.decode(IFCModelPayload.self, from: data) {
            return direct
        }
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dict = object as? [String: Any], let elementsRaw = dict["elements"] as? [[String: Any]] else {
            throw NSError(domain: "IFCImport", code: 1, userInfo: [NSLocalizedDescriptionKey: "JSON 格式不符合，缺少 elements"])
        }
        let mapped = elementsRaw.compactMap(mapIFCElementDictionary(_:))
        let projectDict = dict["project"] as? [String: Any]
        let qaDict = dict["qa"] as? [String: Any]
        return IFCModelPayload(
            projectName: parseIFCString(projectDict?["name"]) ?? parseIFCString(dict["projectName"]),
            schemaVersion: parseIFCString(dict["schema"]) ?? parseIFCString(dict["schemaVersion"]) ?? parseIFCString(projectDict?["schema"]),
            toleranceCm: parseIFCDouble(qaDict?["toleranceCm"]) ?? parseIFCDouble(dict["toleranceCm"]),
            elements: mapped
        )
    }

    private func parseIFCTextPayload(from data: Data, fileName: String) throws -> IFCModelPayload {
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .ascii) else {
            throw NSError(domain: "IFCImport", code: 2, userInfo: [NSLocalizedDescriptionKey: "IFC 文字編碼不可讀"])
        }
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var wallCount = 0
        var rebarCount = 0
        var pipeCount = 0
        for line in lines {
            let upper = line.uppercased()
            if upper.contains("IFCWALL") {
                wallCount += 1
            } else if upper.contains("IFCREINFORCINGBAR") {
                rebarCount += 1
            } else if upper.contains("IFCFLOWSEGMENT") || upper.contains("IFCPIPE") {
                pipeCount += 1
            }
        }

        // Fallback counts to keep model usable for sparse IFC variants.
        if wallCount == 0 && rebarCount == 0 && pipeCount == 0 {
            throw NSError(domain: "IFCImport", code: 3, userInfo: [NSLocalizedDescriptionKey: "未找到 IFCWall / IFCReinforcingBar / IFCFlowSegment"])
        }

        var elements: [IFCElementSpec] = []
        elements.append(contentsOf: generateDefaultIFCElements(type: .wall, count: wallCount))
        elements.append(contentsOf: generateDefaultIFCElements(type: .rebar, count: rebarCount))
        elements.append(contentsOf: generateDefaultIFCElements(type: .pipe, count: pipeCount))

        return IFCModelPayload(
            projectName: fileName,
            schemaVersion: "IFC-Text-v0",
            toleranceCm: nil,
            elements: elements
        )
    }

    private func generateDefaultIFCElements(type: IFCElementKind, count: Int) -> [IFCElementSpec] {
        guard count > 0 else { return [] }
        var specs: [IFCElementSpec] = []
        let columns = max(1, min(6, Int(sqrt(Double(count)).rounded(.up))))
        for index in 0..<count {
            let row = index / columns
            let col = index % columns
            let x = (Double(col) - Double(columns - 1) / 2.0) * 0.45
            let z = -Double(row) * 0.42
            switch type {
            case .wall:
                specs.append(IFCElementSpec(type: .wall, width: 1.2, height: 2.8, depth: 0.18, radius: nil, length: nil, x: x, y: 1.4, z: z, rotationDeg: 0))
            case .rebar:
                specs.append(IFCElementSpec(type: .rebar, width: 0.012, height: 2.5, depth: 0.012, radius: nil, length: nil, x: x, y: 1.25, z: z - 0.03, rotationDeg: 0))
            case .pipe:
                specs.append(IFCElementSpec(type: .pipe, width: nil, height: nil, depth: nil, radius: 0.025, length: 1.2, x: x, y: 1.0 + Double((index % 3)) * 0.25, z: z + 0.04, rotationDeg: 0))
            }
        }
        return specs
    }

    private func applyImportedIFCPayload(_ payload: IFCModelPayload) {
        let normalized = payload.elements.map { normalizeIFCElement($0) }
        if normalized.isEmpty {
            ifcModelSummaryText = "IFC 匯入失敗：未解析到可用元素"
            ifcModelElementCount = 0
            ifcElements = []
            return
        }
        ifcElements = normalized
        ifcModelElementCount = normalized.count
        let wallCount = normalized.filter { $0.type == .wall }.count
        let rebarCount = normalized.filter { $0.type == .rebar }.count
        let pipeCount = normalized.filter { $0.type == .pipe }.count
        let projectTitle = payload.projectName ?? "未命名工程"
        let schemaTag = payload.schemaVersion ?? "basic"
        if let tolerance = payload.toleranceCm, tolerance > 0 {
            ifcModelSummaryText = "IFC[\(schemaTag)] \(projectTitle)：牆 \(wallCount)｜鋼筋 \(rebarCount)｜水管 \(pipeCount)｜容差 ±\(Int(tolerance))cm"
        } else {
            ifcModelSummaryText = "IFC[\(schemaTag)] \(projectTitle)：牆 \(wallCount)｜鋼筋 \(rebarCount)｜水管 \(pipeCount)"
        }
        if ifcSimulationEnabled {
            regenerateIFCSimulationAnchor()
        }
    }

    private func mapIFCElementDictionary(_ dict: [String: Any]) -> IFCElementSpec? {
        let typeSource = parseIFCString(dict["type"]) ?? parseIFCString(dict["category"]) ?? parseIFCString(dict["kind"])
        guard let typeRaw = typeSource?.lowercased(),
              let type = mapIFCElementKind(from: typeRaw) else {
            return nil
        }
        let dimensions = dict["dimensions"] as? [String: Any]
        let transform = dict["transform"] as? [String: Any]
        let position = transform?["position"] as? [String: Any]
        let rotation = transform?["rotation"] as? [String: Any]
        return IFCElementSpec(
            type: type,
            width: parseIFCDouble(dict["width"]) ?? parseIFCDouble(dimensions?["width"]),
            height: parseIFCDouble(dict["height"]) ?? parseIFCDouble(dimensions?["height"]),
            depth: parseIFCDouble(dict["depth"]) ?? parseIFCDouble(dimensions?["depth"]),
            radius: parseIFCDouble(dict["radius"]) ?? parseIFCDouble(dimensions?["radius"]),
            length: parseIFCDouble(dict["length"]) ?? parseIFCDouble(dimensions?["length"]),
            x: parseIFCDouble(dict["x"]) ?? parseIFCDouble(position?["x"]),
            y: parseIFCDouble(dict["y"]) ?? parseIFCDouble(position?["y"]),
            z: parseIFCDouble(dict["z"]) ?? parseIFCDouble(position?["z"]),
            rotationDeg: parseIFCDouble(dict["rotationDeg"] ?? dict["rotation"]) ?? parseIFCDouble(rotation?["y"]) ?? parseIFCDouble(rotation?["yaw"])
        )
    }

    private func mapIFCElementKind(from raw: String) -> IFCElementKind? {
        switch raw {
        case "wall", "ifcwall", "ifcwallstandardcase":
            return .wall
        case "rebar", "ifcreinforcingbar", "reinforcement":
            return .rebar
        case "pipe", "ifcpipe", "ifcflowsegment", "ifcpipefitting":
            return .pipe
        default:
            return IFCElementKind(rawValue: raw)
        }
    }

    private func parseIFCDouble(_ raw: Any?) -> Double? {
        if let value = raw as? Double { return value }
        if let value = raw as? Int { return Double(value) }
        if let value = raw as? String { return Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) }
        return nil
    }

    private func parseIFCString(_ raw: Any?) -> String? {
        if let value = raw as? String {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return nil
    }

    private func normalizeIFCElement(_ element: IFCElementSpec) -> IFCElementSpec {
        IFCElementSpec(
            type: element.type,
            width: max(0.003, element.width ?? 0),
            height: max(0.003, element.height ?? 0),
            depth: max(0.003, element.depth ?? 0),
            radius: max(0.003, element.radius ?? 0),
            length: max(0.003, element.length ?? 0),
            x: element.x ?? 0,
            y: element.y ?? 0,
            z: element.z ?? 0,
            rotationDeg: element.rotationDeg ?? 0
        )
    }

    private func clearIFCSimulationAnchor() {
        ifcSimulationAnchor?.removeFromParent()
        ifcSimulationAnchor = nil
        ifcSimulationEnabled = false
        ifcSimulationStatusText = "IFC 模擬：已清除"
    }

    private func invalidateOverlayAnchor() {
        overlayConfigSignature = ""
    }

    private func currentOverlaySignature(imageName: String) -> String {
        [
            imageName,
            "\(rebarMainBarCount)",
            String(format: "%.2f", rebarStirrupSpacingCm),
            String(format: "%.2f", rebarCoverCm),
            String(format: "%.2f", overlayOffsetXcm),
            String(format: "%.2f", overlayOffsetYcm),
            String(format: "%.2f", overlayRotationDeg),
            String(format: "%.2f", overlayScale)
        ].joined(separator: "|")
    }

    private func refreshARMismatchDiagnostics(from imageAnchor: ARImageAnchor) {
        var alerts: [String] = []
        if !imageAnchor.isTracked {
            alerts.append("標靶追蹤不穩，請保持畫面完整且補光")
        }

        let absOffsetX = abs(overlayOffsetXcm)
        if absOffsetX > 4 {
            alerts.append(String(format: "管線疑似偏移：X 偏 %.1f cm", overlayOffsetXcm))
        }
        let absOffsetY = abs(overlayOffsetYcm)
        if absOffsetY > 4 {
            alerts.append(String(format: "管線疑似高程偏移：Y 偏 %.1f cm", overlayOffsetYcm))
        }
        let absRotate = abs(overlayRotationDeg)
        if absRotate > 4 {
            alerts.append(String(format: "牆面方向疑似偏差：旋轉 %.1f°", overlayRotationDeg))
        }

        let absDeltaCm = abs(deviationValueCm)
        if absDeltaCm > deviationToleranceCm {
            alerts.append(String(format: "牆面距離超差：%+.1f cm", deviationValueCm))
        }

        arMismatchAlerts = alerts
        if alerts.isEmpty {
            arMismatchSummaryText = "AR 偏位檢核：未檢出明顯偏位"
        } else {
            arMismatchSummaryText = "AR 偏位檢核：檢出 \(alerts.count) 項偏差"
        }
    }

    private func refreshRebarSpecText() {
        rebarSpecText = String(
            format: "鋼筋規格：主筋 %d｜箍筋 %.0fcm｜保護層 %.1fcm",
            rebarMainBarCount,
            rebarStirrupSpacingCm,
            rebarCoverCm
        )
    }

    private func collectVolumeSamples(
        arView: ARView,
        frame: ARFrame,
        gridSize: Int
    ) -> (depths: [Double], previewPoints: [SIMD2<Double>]) {
        let size = max(3, gridSize)
        let spread = min(arView.bounds.width, arView.bounds.height) * 0.28
        let centerX = arView.bounds.midX
        let centerY = arView.bounds.midY
        var depths: [Double] = []
        var previewPoints: [SIMD2<Double>] = []

        for row in 0..<size {
            for col in 0..<size {
                let nx = Double(col) / Double(max(1, size - 1))
                let ny = Double(row) / Double(max(1, size - 1))
                let x = centerX + CGFloat((nx - 0.5) * 2.0) * spread
                let y = centerY + CGFloat((ny - 0.5) * 2.0) * spread
                let p = CGPoint(x: x, y: y)
                let result = arView.raycast(from: p, allowing: .estimatedPlane, alignment: .any).first
                guard let result else { continue }
                let world = result.worldTransform.columns.3
                let camera = frame.camera.transform.columns.3
                let dx = world.x - camera.x
                let dy = world.y - camera.y
                let dz = world.z - camera.z
                let distance = Double(sqrt(dx * dx + dy * dy + dz * dz))
                depths.append(distance)
                let px = Double(max(0, min(1, x / max(1, arView.bounds.width))))
                let py = Double(max(0, min(1, y / max(1, arView.bounds.height))))
                previewPoints.append(SIMD2<Double>(px, py))
            }
        }
        return (depths, previewPoints)
    }

    private func robustDepthEstimate(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        let trim = max(0, Int(Double(sorted.count) * 0.15))
        let kept = sorted.dropFirst(trim).dropLast(trim)
        guard !kept.isEmpty else {
            return sorted.reduce(0, +) / Double(sorted.count)
        }
        return kept.reduce(0, +) / Double(kept.count)
    }

    private func refreshDeviationStatus() {
        guard let distance = latestDistanceMeters else {
            deviationValueCm = 0
            deviationStatusText = "偏差檢核：尚未鎖定實測距離"
            return
        }
        let deltaCm = (distance - designTargetDistanceMeters) * 100.0
        deviationValueCm = deltaCm
        let absDelta = abs(deltaCm)
        if absDelta <= deviationToleranceCm {
            deviationStatusText = String(
                format: "偏差檢核：合格（偏差 %+0.1f cm / 容差 ±%.1f cm）",
                deltaCm,
                deviationToleranceCm
            )
        } else if absDelta <= (deviationToleranceCm * 1.6) {
            deviationStatusText = String(
                format: "偏差檢核：接近超限（偏差 %+0.1f cm / 容差 ±%.1f cm）",
                deltaCm,
                deviationToleranceCm
            )
        } else {
            deviationStatusText = String(
                format: "偏差檢核：超限（偏差 %+0.1f cm / 容差 ±%.1f cm）",
                deltaCm,
                deviationToleranceCm
            )
        }
    }

    private func medianValue(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        if sorted.count % 2 == 1 {
            return sorted[mid]
        }
        return (sorted[mid - 1] + sorted[mid]) / 2.0
    }

    private func clampMainBarCount(_ value: Int) -> Int {
        min(12, max(2, value))
    }

    private func clampSpacing(_ value: Double) -> Double {
        min(60, max(5, value))
    }

    private func clampCover(_ value: Double) -> Double {
        min(10, max(1, value))
    }

    private func clampScale(_ value: Double) -> Double {
        min(2.5, max(0.5, value))
    }

    private func clampVolumeDimension(_ value: Double) -> Double {
        min(20.0, max(0.2, value))
    }

    private func clampGridSize(_ value: Int) -> Int {
        min(11, max(3, value))
    }

    private func clampCrackCalibration(_ value: Double) -> Double {
        min(1.0, max(0.005, value))
    }

    private func summarizeSeverity(_ findings: [CrackFinding]) -> String {
        if findings.contains(where: { $0.severity == "高" }) { return "高" }
        if findings.contains(where: { $0.severity == "中" }) { return "中" }
        if findings.contains(where: { $0.severity == "低" }) { return "低" }
        return "無"
    }

    private func isQuantumCommandValid(_ command: String) -> Bool {
        guard !command.isEmpty else { return false }
        let normalized = command.lowercased()
        let allowed = [
            "quantum core",
            "quantum on",
            "core engine",
            "核心引擎",
            "核心引擎啟動",
            "量子核心",
            "量子核心啟動",
            "戰術模式啟動"
        ]
        return allowed.contains(where: { normalized.contains($0.lowercased()) })
    }

    private func refreshQuantumTelemetry() {
        let hasLaserLock = latestDistanceMeters != nil
        let blueprintReady = arPOCStatusText.contains("已在") || arPOCStatusText.contains("建立")
        let volumeReady = volumeSampleCount >= max(6, volumeGridSize)
        let crackReady = crackInputImage != nil || arView?.session.currentFrame != nil
        let crackRiskPenalty: Int
        switch crackSeveritySummary {
        case "高":
            crackRiskPenalty = 20
        case "中":
            crackRiskPenalty = 10
        default:
            crackRiskPenalty = 0
        }

        let fusionParts = [
            "雷射\(hasLaserLock ? "OK" : "待鎖定")",
            "A藍圖\(blueprintReady ? "OK" : "待對位")",
            "B體積\(volumeReady ? "OK" : "待掃描")",
            "C裂縫\(crackReady ? "OK" : "待鏡頭")"
        ]
        quantumFusionStatusText = "融合狀態：\(fusionParts.joined(separator: "｜"))"

        if !quantumModeEnabled {
            quantumCoreLevel = 0
            refreshQuantumProviderText()
            if qaScore < 70 {
                quantumSuggestionText = "戰術建議：QA 偏低，建議啟動核心引擎"
            } else if crackSeveritySummary == "高" {
                quantumSuggestionText = "戰術建議：裂縫高風險，建議啟動核心引擎強化檢測"
            } else if !volumeReady {
                quantumSuggestionText = "戰術建議：可啟動核心引擎後執行體積掃描強化"
            } else {
                quantumSuggestionText = "戰術建議：目前無需啟動"
            }
            return
        }
        var score = Int((Double(qaScore) * 0.6).rounded())
        if hasLaserLock { score += 10 }
        if blueprintReady { score += 10 }
        if volumeReady { score += 10 }
        if crackReady { score += 5 }
        if autoCorrectionEnabled { score += 10 }
        score -= crackRiskPenalty
        score = max(0, min(100, score))
        quantumCoreLevel = score

        if score >= 85 {
            quantumStatusText = "核心引擎：火力全開（\(score)%）"
        } else if score >= 60 {
            quantumStatusText = "核心引擎：穩定作戰（\(score)%）"
        } else {
            quantumStatusText = "核心引擎：能量不足，請先校準（\(score)%）"
        }
        if !blueprintReady {
            quantumSuggestionText = "戰術建議：先完成 A 藍圖對位，提高融合穩定度"
        } else if !volumeReady {
            quantumSuggestionText = "戰術建議：執行 B 體積掃描，補齊融合資料"
        } else if !crackReady {
            quantumSuggestionText = "戰術建議：對準裂縫後執行 C 即時分析，完成三項融合"
        } else if crackSeveritySummary == "高" {
            quantumSuggestionText = "戰術建議：裂縫風險高，建議降低行進速度並重掃熱區"
        } else {
            quantumSuggestionText = "戰術建議：A/B/C 與雷射量測已融合，維持穩定掃描"
        }
    }

    private func refreshQuantumProviderText() {
        if quantumIBMCloudEnabled && hasIBMQuantumAPIKey {
            quantumIBMProviderText = "雲端：IBM Cloud API 已接入"
        } else if quantumIBMCloudEnabled {
            quantumIBMProviderText = "雲端：已啟用（未設定 API Key，將回退本地）"
        } else {
            quantumIBMProviderText = "雲端：本地模式"
        }
    }

    private func runIBMQuantumRuntimeJob() async {
        guard quantumIBMCloudEnabled else { return }
        guard let apiKey = readSecureSecretWithMigration(
            account: quantumIBMAPIKeyStorageKey,
            legacyUserDefaultsKey: quantumIBMAPIKeyStorageKey
        ) else {
            quantumIBMJobText = "IBM Job：未設定 API Key"
            quantumIBMResultText = "IBM Result：改用本地模式"
            return
        }

        quantumIBMJobText = "IBM Job：送出中..."
        quantumIBMResultText = "IBM Result：等待結果"

        do {
            let jobID = try await submitIBMRuntimeJob(
                apiKey: apiKey,
                backend: quantumIBMBackend,
                shots: quantumIBMShots
            )
            quantumIBMJobText = "IBM Job：\(jobID)"

            let status = try await pollIBMRuntimeJobStatus(apiKey: apiKey, jobID: jobID)
            if status == "completed" {
                let resultSummary = try await fetchIBMRuntimeResultSummary(apiKey: apiKey, jobID: jobID)
                quantumIBMResultText = "IBM Result：\(resultSummary)"
                quantumStatusText = quantumModeEnabled
                    ? "核心引擎：IBM Job 完成，雲端回饋已更新"
                    : "IBM 雲端：送件完成（未啟用核心也可送件）"
            } else {
                quantumIBMResultText = "IBM Result：Job 狀態 \(status)"
            }
        } catch {
            quantumIBMJobText = "IBM Job：送出失敗"
            quantumIBMResultText = "IBM Result：\(error.localizedDescription)"
            quantumStatusText = quantumModeEnabled
                ? "核心引擎：IBM 連線失敗，已回退本地模式"
                : "IBM 雲端：送件失敗，請檢查 Key/Backend"
        }
    }

    private func submitIBMRuntimeJob(apiKey: String, backend: String, shots: Int) async throws -> String {
        let url = URL(string: "https://api.quantum-computing.ibm.com/runtime/jobs")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": "sampler",
            "backend": backend,
            "params": [
                "pubs": [["circuit": "bell", "shots": shots]]
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200...299).contains(http.statusCode) else {
            throw buildIBMHTTPError(statusCode: http.statusCode, data: data)
        }
        let payload = try parseJSONDictionary(data)
        if let jobID = payload["id"] as? String, !jobID.isEmpty {
            return jobID
        }
        if let jobID = payload["job_id"] as? String, !jobID.isEmpty {
            return jobID
        }
        throw URLError(.cannotParseResponse)
    }

    private func pollIBMRuntimeJobStatus(apiKey: String, jobID: String) async throws -> String {
        let terminalStates: Set<String> = ["completed", "done", "failed", "cancelled", "error"]
        var lastStatus = "queued"

        for _ in 0..<8 {
            try await Task.sleep(nanoseconds: 1_200_000_000)
            let url = URL(string: "https://api.quantum-computing.ibm.com/runtime/jobs/\(jobID)")!
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }
            guard (200...299).contains(http.statusCode) else {
                throw buildIBMHTTPError(statusCode: http.statusCode, data: data)
            }
            let payload = try parseJSONDictionary(data)
            let status = ((payload["state"] as? String) ?? (payload["status"] as? String) ?? "queued").lowercased()
            lastStatus = status
            if terminalStates.contains(status) {
                return status
            }
        }
        return lastStatus
    }

    private func fetchIBMRuntimeResultSummary(apiKey: String, jobID: String) async throws -> String {
        let url = URL(string: "https://api.quantum-computing.ibm.com/runtime/jobs/\(jobID)/results")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200...299).contains(http.statusCode) else {
            throw buildIBMHTTPError(statusCode: http.statusCode, data: data)
        }
        if let payload = try? parseJSONDictionary(data) {
            if let quasi = payload["quasi_dists"] {
                return "quasi_dists=\(String(describing: quasi))"
            }
            if let result = payload["result"] {
                return String(describing: result)
            }
            return "keys=\(payload.keys.sorted().joined(separator: ","))"
        }
        let raw = String(data: data, encoding: .utf8) ?? "non-utf8"
        return String(raw.prefix(180))
    }

    private func parseJSONDictionary(_ data: Data) throws -> [String: Any] {
        let json = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = json as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }
        return dictionary
    }

    private func clampIBMBackend(_ backend: String) -> String {
        let allowed = availableIBMBackends
        return allowed.contains(backend) ? backend : "ibm_kyiv"
    }

    private func clampIBMShots(_ shots: Int) -> Int {
        min(4096, max(32, shots))
    }

    private func clampDesignTarget(_ value: Double) -> Double {
        min(20.0, max(0.2, value))
    }

    private func clampDeviationToleranceCm(_ value: Double) -> Double {
        min(20.0, max(0.5, value))
    }

    private func buildIBMHTTPError(statusCode: Int, data: Data) -> IBMRuntimeError {
        let message: String
        switch statusCode {
        case 401:
            message = "401 Unauthorized（API Key 無效或過期）"
        case 403:
            message = "403 Forbidden（帳號權限不足或未授權 Runtime）"
        case 429:
            message = "429 Too Many Requests（請求過多，稍後再試）"
        default:
            let body = String(data: data, encoding: .utf8) ?? "無法解析回應"
            message = "HTTP \(statusCode)：\(String(body.prefix(120)))"
        }
        return IBMRuntimeError(statusCode: statusCode, message: message)
    }

    private func beginSpeechSession() async {
        stopQuantumVoiceCommand()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        speechRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.speechRequest?.append(buffer)
        }
        speechTapInstalled = true

        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            quantumStatusText = "核心引擎：語音引擎啟動失敗"
            stopQuantumVoiceCommand()
            return
        }

        quantumVoiceListening = true
        quantumVoiceTranscript = ""
        quantumStatusText = "核心引擎：語音監聽中..."

        speechTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    let text = result.bestTranscription.formattedString
                    self.quantumVoiceTranscript = text
                    if result.isFinal {
                        self.activateQuantumMode(command: text, source: "voice")
                        self.stopQuantumVoiceCommand()
                    }
                }
                if error != nil {
                    self.quantumStatusText = "核心引擎：語音辨識中斷"
                    self.stopQuantumVoiceCommand()
                }
            }
        }
    }

    private func loadQuantumHistory() {
        guard let data = UserDefaults.standard.data(forKey: quantumHistoryStorageKey) else { return }
        if let decoded = try? JSONDecoder().decode([QuantumTacticRecord].self, from: data) {
            quantumHistory = decoded
        }
    }

    private func persistQuantumHistory() {
        if let data = try? JSONEncoder().encode(quantumHistory) {
            UserDefaults.standard.set(data, forKey: quantumHistoryStorageKey)
        }
    }

    private func appendQuantumHistory(
        source: String,
        command: String,
        beforeScore: Int,
        afterScore: Int,
        status: String
    ) {
        let item = QuantumTacticRecord(
            source: source,
            command: command,
            beforeScore: beforeScore,
            afterScore: afterScore,
            coreLevelAfter: quantumCoreLevel,
            status: status
        )
        quantumHistory.insert(item, at: 0)
        if quantumHistory.count > 30 {
            quantumHistory.removeLast(quantumHistory.count - 30)
        }
        persistQuantumHistory()
    }

    nonisolated private static func detectCracks(
        cgImage: CGImage,
        calibrationCmPerPixel: Double
    ) -> Result<[CrackFinding], Error> {
        let request = VNDetectContoursRequest()
        request.contrastAdjustment = 1.0
        request.detectsDarkOnLight = false
        request.maximumImageDimension = 1024

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            guard let observation = request.results?.first else {
                return .success([])
            }

            let imageW = Double(cgImage.width)
            let imageH = Double(cgImage.height)
            let diagonal = max(imageW, imageH)
            var candidates: [CrackFinding] = []

            for contour in flattenContours(from: observation.topLevelContours) {
                let box = contour.normalizedPath.boundingBox.standardized
                let area = box.width * box.height
                if area < 0.00008 { continue }
                let minSide = max(0.00001, min(box.width, box.height))
                let maxSide = max(box.width, box.height)
                let elongation = maxSide / minSide
                if elongation < 3.2 { continue }

                let lengthPx = maxSide * diagonal
                if lengthPx < 16 { continue }
                let lengthCm = lengthPx * calibrationCmPerPixel
                let severity: String
                if lengthCm >= 25 {
                    severity = "高"
                } else if lengthCm >= 8 {
                    severity = "中"
                } else {
                    severity = "低"
                }

                let confidence = min(0.99, max(0.2, (elongation / 10.0) + (lengthPx / 600.0)))
                candidates.append(
                    CrackFinding(
                        box: box,
                        confidence: confidence,
                        lengthCm: lengthCm,
                        severity: severity
                    )
                )
            }

            let findings = candidates
                .sorted { lhs, rhs in
                    if lhs.severity == rhs.severity {
                        return lhs.lengthCm > rhs.lengthCm
                    }
                    return severityRank(lhs.severity) > severityRank(rhs.severity)
                }
                .prefix(10)

            return .success(Array(findings))
        } catch {
            return .failure(error)
        }
    }

    nonisolated private static func flattenContours(from contours: [VNContour]) -> [VNContour] {
        var result: [VNContour] = []
        var queue = contours
        while !queue.isEmpty {
            let contour = queue.removeFirst()
            result.append(contour)
            queue.append(contentsOf: contour.childContours)
        }
        return result
    }

    nonisolated private static func severityRank(_ severity: String) -> Int {
        switch severity {
        case "高": return 3
        case "中": return 2
        case "低": return 1
        default: return 0
        }
    }

    private func refreshVolumeAreaM2() {
        volumeAreaM2 = max(0, volumeAreaWidthMeters * volumeAreaLengthMeters)
    }

    private func appendRecentDistance(_ value: Double) {
        recentDistances.append(value)
        if recentDistances.count > 8 {
            recentDistances.removeFirst(recentDistances.count - 8)
        }
    }

    private func appendRawDistance(_ value: Double) {
        recentRawDistances.append(value)
        if recentRawDistances.count > 7 {
            recentRawDistances.removeFirst(recentRawDistances.count - 7)
        }
    }

    private func smoothedDistance(_ fallback: Double) -> Double {
        guard !recentRawDistances.isEmpty else { return fallback }
        let sorted = recentRawDistances.sorted()
        let mid = sorted.count / 2
        if sorted.count % 2 == 1 {
            return sorted[mid]
        }
        return (sorted[mid - 1] + sorted[mid]) / 2.0
    }

    private func refreshQALevel() {
        guard latestDistanceMeters != nil else { return }
        let pitchAbs = abs(latestPitchDegrees)
        let rollAbs = abs(latestRollDegrees)
        let jitter = standardDeviation(recentDistances)
        let gate = gateForProfile(qaProfile)

        if recentDistances.count >= gate.proSamples &&
            jitter <= gate.proJitter &&
            pitchAbs <= gate.proAngle &&
            rollAbs <= gate.proAngle {
            qaLevel = .pro
        } else if recentDistances.count >= gate.preciseSamples &&
            jitter <= gate.preciseJitter &&
            pitchAbs <= gate.preciseAngle &&
            rollAbs <= gate.preciseAngle {
            qaLevel = .precise
        } else {
            qaLevel = .normal
        }
        qaLevelText = qaLevel.displayName
        qaScore = computeQAScore(
            jitter: jitter,
            pitchAbs: pitchAbs,
            rollAbs: rollAbs,
            profile: qaProfile
        )
        refreshAIDiagnosis(jitter: jitter, pitchAbs: pitchAbs, rollAbs: rollAbs, gate: gate)
        evaluatePendingCorrectionIfNeeded()
        maybeRunAutoCorrection()
    }

    private func standardDeviation(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let mean = values.reduce(0, +) / Double(values.count)
        let variance = values.reduce(0) { partial, value in
            let diff = value - mean
            return partial + diff * diff
        } / Double(values.count)
        return sqrt(variance)
    }

    private func computeQAScore(
        jitter: Double,
        pitchAbs: Double,
        rollAbs: Double,
        profile: QATuningProfile
    ) -> Int {
        let profileFactor: Double
        switch profile {
        case .standard:
            profileFactor = 1.0
        case .strict:
            profileFactor = 0.9
        case .ultra:
            profileFactor = 0.8
        }

        let jitterRef = max(0.006, 0.05 * profileFactor)
        let angleRef = max(1.2, 8.0 * profileFactor)
        let sampleScore = min(1.0, Double(recentDistances.count) / 8.0)
        let jitterScore = max(0.0, 1.0 - (jitter / jitterRef))
        let angleScore = max(0.0, 1.0 - ((pitchAbs + rollAbs) / (2.0 * angleRef)))

        let weighted = (sampleScore * 0.2) + (jitterScore * 0.5) + (angleScore * 0.3)
        let clamped = min(1.0, max(0.0, weighted))
        return Int((clamped * 100.0).rounded())
    }

    private func refreshAIDiagnosis(
        jitter: Double,
        pitchAbs: Double,
        rollAbs: Double,
        gate: (proSamples: Int, proJitter: Double, proAngle: Double, preciseSamples: Int, preciseJitter: Double, preciseAngle: Double)
    ) {
        if recentDistances.count < gate.preciseSamples {
            aiIssue = .insufficientSamples
            aiDiagnosisText = "AI QA：樣本不足（\(recentDistances.count)/\(gate.preciseSamples)）"
            aiCorrectionText = "建議：保持準星穩定 1 秒以上再記錄"
            return
        }

        if pitchAbs > gate.preciseAngle || rollAbs > gate.preciseAngle {
            aiIssue = .tilt
            aiDiagnosisText = String(format: "AI QA：角度偏差過大（P %.1f° / R %.1f°）", pitchAbs, rollAbs)
            aiCorrectionText = "建議：調整裝置水平，使 Pitch/Roll 降到 \(Int(gate.preciseAngle))° 內"
            return
        }

        if jitter > gate.preciseJitter {
            aiIssue = .unstable
            aiDiagnosisText = String(format: "AI QA：距離抖動偏高（σ=%.4f）", jitter)
            aiCorrectionText = "建議：降低手震或切換較寬鬆 QA 模式"
            return
        }

        if qaScore < 60 {
            aiIssue = .lowScore
            aiDiagnosisText = "AI QA：綜合分數偏低（\(qaScore)/100）"
            aiCorrectionText = "建議：點選 AI 矯正自動調整模式或重置追蹤"
            return
        }

        aiIssue = .none
        aiDiagnosisText = "AI QA：品質穩定"
        aiCorrectionText = "建議：可直接記錄與輸出 QA 報告"
    }

    private func gateForProfile(_ profile: QATuningProfile)
    -> (proSamples: Int, proJitter: Double, proAngle: Double, preciseSamples: Int, preciseJitter: Double, preciseAngle: Double) {
        switch profile {
        case .standard:
            return (5, 0.010, 2.0, 4, 0.030, 5.0)
        case .strict:
            return (6, 0.008, 1.8, 5, 0.022, 4.0)
        case .ultra:
            return (7, 0.006, 1.2, 6, 0.015, 2.5)
        }
    }

    private func recalibrateTracking() {
        guard let arView else { return }
        recentDistances.removeAll()
        recentRawDistances.removeAll()
        configureSession(on: arView)
    }

    private func evaluatePendingCorrectionIfNeeded() {
        guard var pending = pendingCorrectionEvaluation else { return }
        guard latestDistanceMeters != nil else { return }

        if pending.remainingCycles > 0 {
            pending.remainingCycles -= 1
            pendingCorrectionEvaluation = pending
            return
        }

        let record = AICorrectionRecord(
            issueSummary: pending.issueSummary,
            actionSummary: pending.actionSummary,
            beforeScore: pending.beforeScore,
            afterScore: qaScore,
            beforeLevel: pending.beforeLevel,
            afterLevel: qaLevel,
            beforeProfile: pending.beforeProfile,
            afterProfile: qaProfile
        )
        correctionHistory.insert(record, at: 0)
        if correctionHistory.count > 30 {
            correctionHistory.removeLast(correctionHistory.count - 30)
        }
        persistCorrectionHistory()
        refreshCorrectionTrend()
        pendingCorrectionEvaluation = nil

        if autoCorrectionEnabled {
            autoCorrectionRoundsDone += 1
            let config = autoCorrectionConfig
            if qaScore >= config.targetScore {
                autoCorrectionEnabled = false
                autoCorrectionStatusText = "自動連續矯正：達標停止（\(qaScore) 分）"
            } else if autoCorrectionRoundsDone >= config.maxRounds {
                autoCorrectionEnabled = false
                autoCorrectionStatusText = "自動連續矯正：達到上限停止（\(qaScore) 分）"
            } else if record.deltaScore <= config.minExpectedDelta {
                autoCorrectionEnabled = false
                autoCorrectionStatusText = "自動連續矯正：提升趨緩停止（Δ\(record.deltaScore)）"
            } else {
                autoCorrectionStatusText = "自動連續矯正：第 \(autoCorrectionRoundsDone) 輪後續矯正中"
            }
        }
    }

    private func refreshCorrectionTrend() {
        guard !correctionHistory.isEmpty else {
            correctionTrendText = "AI 矯正趨勢：尚無資料"
            return
        }
        let recent = Array(correctionHistory.prefix(5))
        let improved = recent.filter { $0.deltaScore > 0 }.count
        let avgDelta = Double(recent.map { $0.deltaScore }.reduce(0, +)) / Double(recent.count)
        correctionTrendText = String(
            format: "AI 矯正趨勢：近 %d 次提升 %d 次，平均 %+0.1f 分",
            recent.count,
            improved,
            avgDelta
        )
    }

    private func loadCorrectionHistory() {
        guard let data = UserDefaults.standard.data(forKey: aiCorrectionStorageKey) else { return }
        do {
            correctionHistory = try JSONDecoder().decode([AICorrectionRecord].self, from: data)
        } catch {
            correctionHistory = []
        }
    }

    private func persistCorrectionHistory() {
        do {
            let data = try JSONEncoder().encode(correctionHistory)
            UserDefaults.standard.set(data, forKey: aiCorrectionStorageKey)
        } catch {
            // Ignore persistence errors to keep the measuring flow smooth.
        }
    }

    private func maybeRunAutoCorrection() {
        guard autoCorrectionEnabled else { return }
        guard pendingCorrectionEvaluation == nil else { return }
        guard latestDistanceMeters != nil else { return }
        let config = autoCorrectionConfig
        guard aiIssue != .none else {
            autoCorrectionEnabled = false
            autoCorrectionStatusText = "自動連續矯正：品質穩定已停止"
            return
        }
        guard autoCorrectionRoundsDone < config.maxRounds else {
            autoCorrectionEnabled = false
            autoCorrectionStatusText = "自動連續矯正：已達上限停止"
            return
        }
        applyAIQACorrection()
    }

    private var autoCorrectionConfig: (targetScore: Int, maxRounds: Int, minExpectedDelta: Int) {
        switch autoCorrectionStrategy {
        case .stableFirst:
            return (95, 6, 1)
        case .speedFirst:
            return (85, 3, 0)
        }
    }

    private func refreshAutoCorrectionStatus() {
        if autoCorrectionEnabled {
            let config = autoCorrectionConfig
            autoCorrectionStatusText = "自動連續矯正：啟動（\(autoCorrectionStrategy.displayName)，目標 \(config.targetScore)+ 分）"
            return
        }
        autoCorrectionStatusText = "自動連續矯正：關（\(autoCorrectionStrategy.displayName)）"
    }

    private func generateAIAdvice(
        context: AIAdvisorContext,
        userGoal: String,
        openAIKey: String?
    ) async -> (text: String, source: String) {
        guard let key = openAIKey, !key.isEmpty else {
            return (localAIAdvice(context: context, userGoal: userGoal), "本地 AI")
        }

        do {
            let cloud = try await fetchOpenAIAdvice(context: context, userGoal: userGoal, apiKey: key)
            return (cloud, "雲端 AI")
        } catch {
            return (localAIAdvice(context: context, userGoal: userGoal), "本地 AI（雲端失敗已回退）")
        }
    }

    private func localAIAdvice(context: AIAdvisorContext, userGoal: String) -> String {
        var lines: [String] = []
        if !userGoal.isEmpty {
            lines.append("目標：\(userGoal)")
        }
        if context.distanceMeters == nil {
            lines.append("先對準牆面或地面，讓準星穩定 1 秒再取樣。")
        }
        if context.qaScore < 60 {
            lines.append("QA 偏低，建議先按一次 AI QA 矯正，並降低手部抖動。")
        } else if context.qaScore < 80 {
            lines.append("QA 可用，建議再穩定 1-2 秒可提升可信度。")
        } else {
            lines.append("QA 穩定，可進行正式記錄與匯出。")
        }
        let angleAbs = abs(context.pitchDegrees) + abs(context.rollDegrees)
        if angleAbs > 6 {
            lines.append("目前角度偏移較大，請讓 Pitch/Roll 接近 0°。")
        }
        lines.append("診斷：\(context.aiDiagnosisText)")
        return lines.joined(separator: "\n")
    }

    private func fetchOpenAIAdvice(
        context: AIAdvisorContext,
        userGoal: String,
        apiKey: String
    ) async throws -> String {
        let url = URL(string: "https://api.openai.com/v1/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let systemPrompt = "你是工地 LiDAR 量測 QA 助手。請用繁體中文，回覆 3-6 行可執行建議。"
        let userPrompt = """
        使用者目標: \(userGoal.isEmpty ? "未提供" : userGoal)
        距離: \(context.distanceMeters.map { String(format: "%.2f m", $0) } ?? "--")
        Pitch: \(String(format: "%.1f", context.pitchDegrees))°
        Roll: \(String(format: "%.1f", context.rollDegrees))°
        QA 等級: \(context.qaLevelText)
        QA 模式: \(context.qaProfileText)
        QA 分數: \(context.qaScore)
        診斷: \(context.aiDiagnosisText)
        請回覆下一步操作建議。
        """

        let body = ChatCompletionsRequest(
            model: "gpt-4o-mini",
            messages: [
                .init(role: "system", content: systemPrompt),
                .init(role: "user", content: userPrompt)
            ],
            temperature: 0.2
        )
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(ChatCompletionsResponse.self, from: data)
        let output = decoded.choices.first?.message.content.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if output.isEmpty {
            throw URLError(.cannotParseResponse)
        }
        return output
    }
}

private struct PendingCorrectionEvaluation {
    let issueSummary: String
    let actionSummary: String
    let beforeScore: Int
    let beforeLevel: QAPrecisionLevel
    let beforeProfile: QATuningProfile
    var remainingCycles: Int
}

private struct AIAdvisorContext {
    let distanceMeters: Double?
    let pitchDegrees: Double
    let rollDegrees: Double
    let qaLevelText: String
    let qaProfileText: String
    let qaScore: Int
    let aiDiagnosisText: String
}

private struct ChatCompletionsRequest: Encodable {
    let model: String
    let messages: [ChatMessage]
    let temperature: Double
}

private struct ChatMessage: Codable {
    let role: String
    let content: String
}

private struct ChatCompletionsResponse: Decodable {
    let choices: [Choice]

    struct Choice: Decodable {
        let message: ChatMessage
    }
}

private struct IBMRuntimeError: LocalizedError {
    let statusCode: Int
    let message: String

    var errorDescription: String? {
        "IBM Runtime 錯誤 \(statusCode)：\(message)"
    }
}
