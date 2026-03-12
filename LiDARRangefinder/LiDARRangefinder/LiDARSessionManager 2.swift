import ARKit
import AVFoundation
import CoreImage
import Foundation
import Photos
import RealityKit
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
    private var aiIssue: AIQAIssueType = .none
    private var pendingCorrectionEvaluation: PendingCorrectionEvaluation?
    private var autoCorrectionRoundsDone = 0
    private var overlayAnchorEntity: AnchorEntity?
    private var ifcSimulationAnchor: AnchorEntity?
    private var twdStakingPreviewAnchor: AnchorEntity?
    private var facadeHologramAnchor: AnchorEntity?
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

    deinit {
        updateTimer?.invalidate()
    }

    func attachARView(_ view: ARView) {
        arView = view
        // Defer session setup to the next run loop cycle to avoid
        // "Publishing changes from within view updates" runtime warnings.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.configureSession(on: view)
            self.beginPolling()
        }
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

    private func buildFacadeHologramAnchor(image: UIImage, referenceTransform: simd_float4x4?) -> AnchorEntity {
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
        anchor.addChild(root)

        let imageRatio = max(0.35, min(2.2, Double(image.size.height / max(1, image.size.width))))
        let facadeWidth: Float = 1.55
        let facadeHeight: Float = Float(facadeWidth * Float(imageRatio))
        let depth: Float = 0.12

        let bodyMesh = MeshResource.generateBox(size: [facadeWidth, facadeHeight, depth])
        let bodyMat = SimpleMaterial(color: UIColor.systemCyan.withAlphaComponent(0.22), roughness: 0.25, isMetallic: true)
        let body = ModelEntity(mesh: bodyMesh, materials: [bodyMat])
        body.position = [0, facadeHeight / 2, 0]
        root.addChild(body)

        // Generate floor slabs based on facade ratio.
        let floorCount = max(6, min(16, Int((facadeHeight / 0.22).rounded())))
        let slabMesh = MeshResource.generateBox(size: [facadeWidth * 0.96, 0.007, depth * 1.02])
        let slabMat = SimpleMaterial(color: UIColor.white.withAlphaComponent(0.55), roughness: 0.4, isMetallic: false)
        for i in 1..<floorCount {
            let y = (facadeHeight / Float(floorCount)) * Float(i)
            let slab = ModelEntity(mesh: slabMesh, materials: [slabMat])
            slab.position = [0, y, 0.002]
            root.addChild(slab)
        }

        // Window arrays left/right.
        let windowRows = max(5, floorCount - 2)
        let windowMesh = MeshResource.generateBox(size: [0.11, 0.085, 0.01])
        let windowMat = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.72), roughness: 0.1, isMetallic: true)
        for row in 0..<windowRows {
            let y = 0.12 + (facadeHeight - 0.28) * Float(row) / Float(max(1, windowRows - 1))
            for col in -2...2 where col != 0 {
                let x = Float(col) * 0.22
                let window = ModelEntity(mesh: windowMesh, materials: [windowMat])
                window.position = [x, y, depth / 2 + 0.008]
                root.addChild(window)
            }
        }

        // Central core / stair block.
        let coreMesh = MeshResource.generateBox(size: [0.32, facadeHeight * 0.96, depth * 1.1])
        let coreMat = SimpleMaterial(color: UIColor.systemRed.withAlphaComponent(0.25), roughness: 0.2, isMetallic: true)
        let core = ModelEntity(mesh: coreMesh, materials: [coreMat])
        core.position = [0, facadeHeight * 0.48, 0]
        root.addChild(core)

        return anchor
    }

    private func clearFacadeHologramAnchor() {
        facadeHologramAnchor?.removeFromParent()
        facadeHologramAnchor = nil
        facadeHologramEnabled = false
        facadeHologramStatusText = "立面全息：關"
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
        ifcSimulationStatusText = ifcElements.isEmpty
            ? "IFC 模擬：已生成牆體/鋼筋/水管（示意）"
            : "IFC 模擬：已套用 IFC 模型生成 3D"
    }

    func toggleFacadeHologramFromBlueprint() {
        if facadeHologramEnabled {
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
        facadeHologramStatusText = "立面全息：已生成 3D 建築立面"
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
        UserDefaults.standard.set(sanitized, forKey: quantumIBMAPIKeyStorageKey)
        refreshQuantumProviderText()
    }

    func clearIBMQuantumAPIKey() {
        UserDefaults.standard.removeObject(forKey: quantumIBMAPIKeyStorageKey)
        refreshQuantumProviderText()
    }

    var hasIBMQuantumAPIKey: Bool {
        guard let raw = UserDefaults.standard.string(forKey: quantumIBMAPIKeyStorageKey) else { return false }
        return !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
        UserDefaults.standard.set(sanitized, forKey: aiOpenAIKeyStorageKey)
    }

    func clearOpenAIKey() {
        UserDefaults.standard.removeObject(forKey: aiOpenAIKeyStorageKey)
    }

    var hasOpenAIKey: Bool {
        guard let raw = UserDefaults.standard.string(forKey: aiOpenAIKeyStorageKey) else { return false }
        return !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func runAIAssistant(userGoal: String) {
        aiAssistantBusy = true
        aiAssistantText = "AI 助手：分析中..."

        let cloudKey = aiCloudEnabled ? UserDefaults.standard.string(forKey: aiOpenAIKeyStorageKey) : nil
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
            #if DEBUG
            view.debugOptions.insert(.showSceneUnderstanding)
            #else
            view.debugOptions.remove(.showSceneUnderstanding)
            #endif
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
            addFallbackIFCEntities(to: root)
        } else {
            addIFCEntities(from: ifcElements, to: root)
        }

        return anchor
    }

    private func addFallbackIFCEntities(to root: Entity) {
        guard ifcShowWalls || ifcShowRebars || ifcShowPipes else { return }
        if ifcShowWalls {
            let wallMesh = MeshResource.generateBox(size: [1.6, 2.7, 0.16])
            let wallMaterial = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.22), roughness: 0.35, isMetallic: false)
            let wallEntity = ModelEntity(mesh: wallMesh, materials: [wallMaterial])
            wallEntity.position = [0, 1.35, 0]
            root.addChild(wallEntity)
        }
        if ifcShowRebars {
            let rebarVerticalMesh = MeshResource.generateBox(size: [0.012, 2.45, 0.012])
            let rebarHorizontalMesh = MeshResource.generateBox(size: [1.42, 0.01, 0.01])
            let rebarMaterial = SimpleMaterial(color: .systemRed, roughness: 0.2, isMetallic: true)
            let stirrupMaterial = SimpleMaterial(color: .systemOrange, roughness: 0.25, isMetallic: true)
            for index in 0..<6 {
                let x = -0.7 + Float(index) * 0.28
                let bar = ModelEntity(mesh: rebarVerticalMesh, materials: [rebarMaterial])
                bar.position = [x, 1.35, -0.02]
                root.addChild(bar)
            }
            for index in 0..<10 {
                let y = 0.2 + Float(index) * 0.25
                let stirrup = ModelEntity(mesh: rebarHorizontalMesh, materials: [stirrupMaterial])
                stirrup.position = [0, y, -0.02]
                root.addChild(stirrup)
            }
        }
        if ifcShowPipes {
            let pipeMesh = MeshResource.generateCylinder(height: 1.35, radius: 0.03)
            let coldPipeMaterial = SimpleMaterial(color: .systemBlue, roughness: 0.15, isMetallic: true)
            let hotPipeMaterial = SimpleMaterial(color: .systemGreen, roughness: 0.15, isMetallic: true)
            let coldPipe = ModelEntity(mesh: pipeMesh, materials: [coldPipeMaterial])
            coldPipe.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
            coldPipe.position = [0, 0.95, 0.035]
            root.addChild(coldPipe)
            let hotPipe = ModelEntity(mesh: pipeMesh, materials: [hotPipeMaterial])
            hotPipe.orientation = simd_quatf(angle: .pi / 2, axis: [0, 0, 1])
            hotPipe.position = [0, 1.45, 0.035]
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
                let material = SimpleMaterial(color: UIColor.systemBlue.withAlphaComponent(0.22), roughness: 0.35, isMetallic: false)
                let entity = ModelEntity(mesh: mesh, materials: [material])
                applyIFCTransform(for: element, to: entity, defaultY: Double(height / 2))
                root.addChild(entity)
            case .rebar where ifcShowRebars:
                let width = Float(max(0.005, element.width ?? 0.012))
                let height = Float(max(0.1, element.height ?? (element.length ?? 1.2)))
                let depth = Float(max(0.005, element.depth ?? 0.012))
                let mesh = MeshResource.generateBox(size: [width, height, depth])
                let material = SimpleMaterial(color: .systemRed, roughness: 0.2, isMetallic: true)
                let entity = ModelEntity(mesh: mesh, materials: [material])
                applyIFCTransform(for: element, to: entity, defaultY: Double(height / 2))
                root.addChild(entity)
            case .pipe where ifcShowPipes:
                let radius = Float(max(0.003, element.radius ?? 0.03))
                let length = Float(max(0.05, element.length ?? element.width ?? 1.2))
                let mesh = MeshResource.generateCylinder(height: length, radius: radius)
                let material = SimpleMaterial(color: .systemGreen, roughness: 0.15, isMetallic: true)
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
        guard quantumModeEnabled, quantumIBMCloudEnabled else { return }
        guard let apiKey = UserDefaults.standard.string(forKey: quantumIBMAPIKeyStorageKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines), !apiKey.isEmpty else {
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
                quantumStatusText = "核心引擎：IBM Job 完成，雲端回饋已更新"
            } else {
                quantumIBMResultText = "IBM Result：Job 狀態 \(status)"
            }
        } catch {
            quantumIBMJobText = "IBM Job：送出失敗"
            quantumIBMResultText = "IBM Result：\(error.localizedDescription)"
            quantumStatusText = "核心引擎：IBM 連線失敗，已回退本地模式"
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
