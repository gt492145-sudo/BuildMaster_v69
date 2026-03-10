import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var sessionManager: LiDARSessionManager
    @EnvironmentObject private var measurementStore: MeasurementStore

    @State private var showingRecords = false
    @State private var showingShareSheet = false
    @State private var showingCorrectionHistory = false
    private let minRecordScore = 60
    private let minBlueprintScoreForRecord = 65

    var body: some View {
        ZStack {
            ARViewContainer()
                .ignoresSafeArea()

            crosshair
            lockFrameOverlay

            VStack {
                topPanel
                Spacer()
                bottomPanel
            }
            .padding()
        }
        .sheet(isPresented: $showingRecords) {
            recordsView
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(items: [measurementStore.csvString()])
        }
        .sheet(isPresented: $showingCorrectionHistory) {
            correctionHistoryView
        }
    }

    private var crosshair: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.9), lineWidth: 2)
                .frame(width: 38, height: 38)
            Rectangle()
                .fill(.white.opacity(0.9))
                .frame(width: 1.5, height: 54)
            Rectangle()
                .fill(.white.opacity(0.9))
                .frame(width: 54, height: 1.5)
        }
    }

    private var topPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LiDAR 雷射測距鏡")
                .font(.headline)
                .foregroundStyle(.white)
            Text("距離: \(sessionManager.distanceText)")
                .font(.title2.bold())
                .foregroundStyle(.green)
            HStack {
                Text("Pitch: \(sessionManager.pitchText)")
                Text("Roll: \(sessionManager.rollText)")
            }
            .foregroundStyle(.white.opacity(0.9))
            Text(sessionManager.blueprintLockText)
                .font(.footnote.bold())
                .foregroundStyle(sessionManager.blueprintLocked ? .green : .yellow)
            Text("藍圖追蹤品質: \(sessionManager.blueprintTrackingScore) / 100")
                .font(.footnote.bold())
                .foregroundStyle(blueprintScoreColor(sessionManager.blueprintTrackingScore))
            Text(sessionManager.blueprintGuidanceText)
                .font(.caption)
                .foregroundStyle(.orange)
            Text(sessionManager.calibrationText)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("QA 等級: \(sessionManager.qaLevelText)")
                .font(.subheadline.bold())
                .foregroundStyle(qaLevelColor(sessionManager.qaLevel))
            Text("QA 模式: \(sessionManager.qaProfile.displayName)")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.85))
            Text("QA 分數: \(sessionManager.qaScore) / 100")
                .font(.subheadline.bold())
                .foregroundStyle(qaScoreColor(sessionManager.qaScore))
            Text(qaHintText(sessionManager.qaScore))
                .font(.footnote.bold())
                .foregroundStyle(qaHintColor(sessionManager.qaScore))
            Text(sessionManager.aiDiagnosisText)
                .font(.footnote.bold())
                .foregroundStyle(.white)
            Text(sessionManager.aiCorrectionText)
                .font(.caption)
                .foregroundStyle(.orange)
            if !sessionManager.aiLastActionText.isEmpty {
                Text(sessionManager.aiLastActionText)
                    .font(.caption2)
                    .foregroundStyle(.mint)
            }
            Text(sessionManager.correctionTrendText)
                .font(.caption2)
                .foregroundStyle(.cyan)
            Text(sessionManager.autoCorrectionStatusText)
                .font(.caption2)
                .foregroundStyle(sessionManager.autoCorrectionEnabled ? .mint : .secondary)
            Text("狀態: \(sessionManager.statusText)")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.42))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var bottomPanel: some View {
        VStack(spacing: 10) {
            Toggle(isOn: Binding(
                get: { sessionManager.akiModeEnabled },
                set: { sessionManager.setAkiModeEnabled($0) }
            )) {
                Text("阿基模式（藍圖標靶追蹤）")
                    .font(.footnote.bold())
            }
            .tint(.cyan)

            Picker("QA 模式", selection: Binding(
                get: { sessionManager.qaProfile },
                set: { sessionManager.setQAProfile($0) }
            )) {
                ForEach(QATuningProfile.allCases) { mode in
                    Text(mode.displayName).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .tint(.blue)

            Button("AI QA 一鍵矯正") {
                sessionManager.applyAIQACorrection()
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
            .disabled(!sessionManager.aiCanAutoCorrect)

            Button(sessionManager.autoCorrectionEnabled ? "停止自動連續矯正" : "啟動自動連續矯正") {
                sessionManager.toggleAutoCorrection()
            }
            .buttonStyle(.borderedProminent)
            .tint(sessionManager.autoCorrectionEnabled ? .red : .blue)
            .frame(maxWidth: .infinity)

            Picker("自動矯正策略", selection: Binding(
                get: { sessionManager.autoCorrectionStrategy },
                set: { sessionManager.setAutoCorrectionStrategy($0) }
            )) {
                ForEach(AIAutoCorrectionStrategy.allCases) { strategy in
                    Text(strategy.displayName).tag(strategy)
                }
            }
            .pickerStyle(.segmented)
            .tint(.indigo)

            Button("記錄量測") {
                guard let distance = sessionManager.latestDistanceMeters else { return }
                measurementStore.add(
                    distance: distance,
                    pitch: sessionManager.latestPitchDegrees,
                    roll: sessionManager.latestRollDegrees,
                    qaLevel: sessionManager.qaLevel,
                    qaProfile: sessionManager.qaProfile,
                    qaScore: sessionManager.qaScore,
                    blueprintLocked: sessionManager.blueprintLocked,
                    blueprintScore: sessionManager.blueprintTrackingScore,
                    akiModeEnabled: sessionManager.akiModeEnabled
                )
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
            .disabled(!canRecordMeasurement)

            if !canRecordMeasurement {
                Text(recordDisabledReason)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            Button("快速校準（重置追蹤）") {
                sessionManager.calibrateNow()
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)

            HStack(spacing: 10) {
                Button("截圖存相簿") {
                    sessionManager.capturePhotoToLibrary()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)

                Button("量測紀錄") {
                    showingRecords = true
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }

            Button("AI 矯正比對歷史") {
                showingCorrectionHistory = true
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
        }
        .padding(12)
        .background(.black.opacity(0.42))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var recordsView: some View {
        NavigationStack {
            List {
                ForEach(measurementStore.records) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.createdAt.formatted(date: .abbreviated, time: .standard))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(String(format: "距離 %.2f m", item.distanceMeters))
                        Text(String(format: "Pitch %.1f° | Roll %.1f°", item.pitchDegrees, item.rollDegrees))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text("QA: \(item.qaLevel.displayName)")
                            .font(.footnote.bold())
                            .foregroundStyle(qaLevelColor(item.qaLevel))
                        Text("模式: \(item.qaProfile.displayName)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text("分數: \(item.qaScore) / 100")
                            .font(.footnote)
                            .foregroundStyle(qaScoreColor(item.qaScore))
                        Text("標靶: \(item.blueprintLocked ? "已鎖定" : "未鎖定") | 標靶分數: \(item.blueprintScore) | 阿基模式: \(item.akiModeEnabled ? "開" : "關")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
            .navigationTitle("量測紀錄")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("清空") {
                        measurementStore.clearAll()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("匯出 CSV") {
                        showingShareSheet = true
                    }
                }
            }
        }
    }

    private var correctionHistoryView: some View {
        NavigationStack {
            List {
                if sessionManager.correctionHistory.isEmpty {
                    Text("尚無矯正比對資料")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sessionManager.correctionHistory) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.createdAt.formatted(date: .abbreviated, time: .standard))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(item.issueSummary)
                                .font(.footnote)
                            Text(item.actionSummary)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Text("分數: \(item.beforeScore) -> \(item.afterScore) (\(item.deltaScore >= 0 ? "+" : "")\(item.deltaScore))")
                                .font(.footnote.bold())
                                .foregroundStyle(deltaScoreColor(item.deltaScore))
                            Text("等級: \(item.beforeLevel.displayName) -> \(item.afterLevel.displayName) | 模式: \(item.beforeProfile.displayName) -> \(item.afterProfile.displayName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("AI 矯正比對")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("清空") {
                        sessionManager.clearCorrectionHistory()
                    }
                }
            }
        }
    }

    private func qaLevelColor(_ level: QAPrecisionLevel) -> Color {
        switch level {
        case .normal:
            return .yellow
        case .precise:
            return .mint
        case .pro:
            return .cyan
        }
    }

    private func qaScoreColor(_ score: Int) -> Color {
        if score >= 85 { return .cyan }
        if score >= 65 { return .mint }
        if score >= 40 { return .yellow }
        return .orange
    }

    private func qaHintText(_ score: Int) -> String {
        if score >= 85 { return "建議: 品質穩定，可採信" }
        if score >= 65 { return "建議: 精度良好，可進行記錄" }
        if score >= 40 { return "建議: 略有抖動，請保持手持穩定後重測" }
        return "建議: 分數偏低，請重新校準或調整姿態"
    }

    private func qaHintColor(_ score: Int) -> Color {
        if score >= 85 { return .green }
        if score >= 65 { return .mint }
        if score >= 40 { return .yellow }
        return .red
    }

    private var canRecordMeasurement: Bool {
        guard sessionManager.latestDistanceMeters != nil else { return false }
        guard sessionManager.qaScore >= minRecordScore else { return false }
        if sessionManager.akiModeEnabled {
            return sessionManager.blueprintTrackingScore >= minBlueprintScoreForRecord
        }
        return true
    }

    private func deltaScoreColor(_ delta: Int) -> Color {
        if delta > 0 { return .green }
        if delta < 0 { return .red }
        return .secondary
    }

    private func blueprintScoreColor(_ score: Int) -> Color {
        if score >= 85 { return .green }
        if score >= 65 { return .mint }
        if score >= 40 { return .yellow }
        return .red
    }

    private var recordDisabledReason: String {
        if sessionManager.latestDistanceMeters == nil {
            return "尚未量測到距離，請先鎖定可量測表面"
        }
        if sessionManager.qaScore < minRecordScore {
            return "需達 \(minRecordScore) 分以上才能記錄（目前 \(sessionManager.qaScore) 分）"
        }
        if sessionManager.akiModeEnabled && sessionManager.blueprintTrackingScore < minBlueprintScoreForRecord {
            return "阿基模式需標靶分數 >= \(minBlueprintScoreForRecord)（目前 \(sessionManager.blueprintTrackingScore)）"
        }
        return "目前條件不足，請重新量測"
    }

    private var lockFrameOverlay: some View {
        RoundedRectangle(cornerRadius: 10)
            .stroke(sessionManager.blueprintLocked ? .green : .yellow.opacity(0.85), lineWidth: 2)
            .frame(width: 210, height: 210)
            .opacity(sessionManager.akiModeEnabled ? 0.92 : 0)
    }
}
