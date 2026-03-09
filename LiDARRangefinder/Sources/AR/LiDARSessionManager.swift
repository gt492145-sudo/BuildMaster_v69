import ARKit
import Foundation
import Photos
import RealityKit
import UIKit

private enum AIQAIssueType {
    case none
    case noSurface
    case unstable
    case tilt
    case insufficientSamples
    case lowScore
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
    @Published var qaProfile: QATuningProfile = .standard
    @Published var qaScore: Int = 0
    @Published var aiDiagnosisText: String = "AI QA：初始化中"
    @Published var aiCorrectionText: String = "建議：請先鎖定量測目標"
    @Published var aiLastActionText: String = ""
    @Published var correctionHistory: [AICorrectionRecord] = []
    @Published var correctionTrendText: String = "AI 矯正趨勢：尚無資料"
    @Published var autoCorrectionEnabled: Bool = false
    @Published var autoCorrectionStatusText: String = "自動連續矯正：關"
    @Published var autoCorrectionStrategy: AIAutoCorrectionStrategy = .stableFirst

    private weak var arView: ARView?
    private var updateTimer: Timer?
    private var recentDistances: [Double] = []
    private let qaProfileStorageKey = "lidar_rangefinder_qa_profile"
    private let aiCorrectionStorageKey = "lidar_rangefinder_ai_corrections"
    private let autoCorrectionStrategyStorageKey = "lidar_rangefinder_auto_correction_strategy"
    private var aiIssue: AIQAIssueType = .none
    private var pendingCorrectionEvaluation: PendingCorrectionEvaluation?
    private var autoCorrectionRoundsDone = 0

    init() {
        if let raw = UserDefaults.standard.string(forKey: qaProfileStorageKey),
           let profile = QATuningProfile(rawValue: raw) {
            qaProfile = profile
        }
        if let raw = UserDefaults.standard.string(forKey: autoCorrectionStrategyStorageKey),
           let strategy = AIAutoCorrectionStrategy(rawValue: raw) {
            autoCorrectionStrategy = strategy
        }
        loadCorrectionHistory()
        refreshCorrectionTrend()
        refreshAutoCorrectionStatus()
    }

    deinit {
        updateTimer?.invalidate()
    }

    func attachARView(_ view: ARView) {
        arView = view
        configureSession(on: view)
        beginPolling()
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

    func setQAProfile(_ profile: QATuningProfile) {
        qaProfile = profile
        UserDefaults.standard.set(profile.rawValue, forKey: qaProfileStorageKey)
        refreshQALevel()
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

    func clearCorrectionHistory() {
        correctionHistory.removeAll()
        persistCorrectionHistory()
        refreshCorrectionTrend()
    }

    private func configureSession(on view: ARView) {
        guard ARWorldTrackingConfiguration.isSupported else {
            statusText = "此裝置不支援 ARWorldTracking"
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
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

        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        let results = arView.raycast(from: center, allowing: .estimatedPlane, alignment: .any)

        if let first = results.first {
            let world = first.worldTransform.columns.3
            let camera = frame.camera.transform.columns.3
            let dx = world.x - camera.x
            let dy = world.y - camera.y
            let dz = world.z - camera.z
            let distance = sqrt(dx * dx + dy * dy + dz * dz)
            latestDistanceMeters = Double(distance)
            distanceText = String(format: "%.2f m", distance)
            appendRecentDistance(Double(distance))
            statusText = "已鎖定目標"
        } else {
            latestDistanceMeters = nil
            distanceText = "-- m"
            recentDistances.removeAll()
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
        refreshQALevel()
    }

    private func radiansToDegrees(_ value: Double) -> Double {
        value * 180.0 / .pi
    }

    private func appendRecentDistance(_ value: Double) {
        recentDistances.append(value)
        if recentDistances.count > 8 {
            recentDistances.removeFirst(recentDistances.count - 8)
        }
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
            return (90, 4, 1)
        case .speedFirst:
            return (80, 2, 0)
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
}

private struct PendingCorrectionEvaluation {
    let issueSummary: String
    let actionSummary: String
    let beforeScore: Int
    let beforeLevel: QAPrecisionLevel
    let beforeProfile: QATuningProfile
    var remainingCycles: Int
}
