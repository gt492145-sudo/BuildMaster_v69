import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var sessionManager: LiDARSessionManager
    @EnvironmentObject private var measurementStore: MeasurementStore

    @State private var showingRecords = false
    @State private var showingShareSheet = false
    @State private var showingCorrectionHistory = false
    @State private var showingAIAssistant = false
    @State private var showingRebarConfig = false
    @State private var showingVolumeScan = false
    @State private var aiGoalInput = ""
    @State private var aiAPIKeyInput = ""
    @State private var selectedStatusPage: StatusPage = .measure
    @State private var selectedControlPage: ControlPage = .measure
    private let minRecordScore = 85

    var body: some View {
        ZStack {
            ARViewContainer()
                .ignoresSafeArea()

            crosshair

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
        .sheet(isPresented: $showingAIAssistant) {
            aiAssistantView
        }
        .sheet(isPresented: $showingRebarConfig) {
            rebarConfigView
        }
        .sheet(isPresented: $showingVolumeScan) {
            volumeScanView
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
            Picker("狀態分頁", selection: $selectedStatusPage) {
                ForEach(StatusPage.allCases) { page in
                    Text(page.title).tag(page)
                }
            }
            .pickerStyle(.segmented)

            Group {
                switch selectedStatusPage {
                case .measure:
                    Text("QA 等級: \(sessionManager.qaLevelText)")
                        .font(.subheadline.bold())
                        .foregroundStyle(qaLevelColor(sessionManager.qaLevel))
                    Text("QA 模式: \(sessionManager.qaProfile.displayName)")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.85))
                    Text(sessionManager.highestModeLockEnabled ? "模式鎖定：最高等級" : "模式鎖定：關")
                        .font(.caption2)
                        .foregroundStyle(sessionManager.highestModeLockEnabled ? .yellow : .secondary)
                    Text("QA 分數: \(sessionManager.qaScore) / 100")
                        .font(.subheadline.bold())
                        .foregroundStyle(qaScoreColor(sessionManager.qaScore))
                    Text(sessionManager.rebarSpecText)
                        .font(.caption2)
                        .foregroundStyle(.cyan)
                    Text(qaHintText(sessionManager.qaScore))
                        .font(.footnote.bold())
                        .foregroundStyle(qaHintColor(sessionManager.qaScore))
                case .ai:
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
                case .system:
                    Text(sessionManager.aiAssistantSourceText)
                        .font(.caption2)
                        .foregroundStyle(.cyan)
                    Text(sessionManager.aiAssistantText)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.9))
                    Text(sessionManager.arPOCStatusText)
                        .font(.caption2.bold())
                        .foregroundStyle(.cyan)
                    Text(String(format: "體積估算：%.2f m³（%d 點）", sessionManager.volumeEstimateM3, sessionManager.volumeSampleCount))
                        .font(.caption2.bold())
                        .foregroundStyle(.mint)
                    Text(sessionManager.volumeStatusText)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                    Text("狀態: \(sessionManager.statusText)")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.42))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var bottomPanel: some View {
        VStack(spacing: 10) {
            Picker("功能分頁", selection: $selectedControlPage) {
                ForEach(ControlPage.allCases) { page in
                    Text(page.title).tag(page)
                }
            }
            .pickerStyle(.segmented)

            Group {
                switch selectedControlPage {
                case .measure:
                    Toggle(isOn: Binding(
                        get: { sessionManager.highestModeLockEnabled },
                        set: { sessionManager.setHighestModeLockEnabled($0) }
                    )) {
                        Text("最高等級鎖定（固定超嚴格）")
                            .font(.footnote.bold())
                    }
                    .tint(.yellow)

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
                    .disabled(sessionManager.highestModeLockEnabled)

                    Button("記錄量測") {
                        guard let distance = sessionManager.latestDistanceMeters else { return }
                        measurementStore.add(
                            distance: distance,
                            pitch: sessionManager.latestPitchDegrees,
                            roll: sessionManager.latestRollDegrees,
                            qaLevel: sessionManager.qaLevel,
                            qaProfile: sessionManager.qaProfile,
                            qaScore: sessionManager.qaScore
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(!canRecordMeasurement)

                    if !canRecordMeasurement {
                        Text("需達 \(minRecordScore) 分以上才能記錄（目前 \(sessionManager.qaScore) 分）")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }

                    Button("鋼筋透視參數") {
                        showingRebarConfig = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                case .ai:
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

                    Button("AI 助手版（現場建議）") {
                        showingAIAssistant = true
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)
                case .tools:
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

                    Button("3D 體積掃描儀") {
                        showingVolumeScan = true
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .frame(maxWidth: .infinity)
                }
            }
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
        sessionManager.latestDistanceMeters != nil && sessionManager.qaScore >= minRecordScore
    }

    private func deltaScoreColor(_ delta: Int) -> Color {
        if delta > 0 { return .green }
        if delta < 0 { return .red }
        return .secondary
    }

    private var aiAssistantView: some View {
        NavigationStack {
            Form {
                Section("分析目標（可選）") {
                    TextField("例如：穩定量測 2m 牆距", text: $aiGoalInput)
                    Button(sessionManager.aiAssistantBusy ? "分析中..." : "執行 AI 分析") {
                        sessionManager.runAIAssistant(userGoal: aiGoalInput)
                    }
                    .disabled(sessionManager.aiAssistantBusy)

                    Button("一鍵套用建議") {
                        sessionManager.applyAIAssistantRecommendation()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.indigo)
                    .disabled(sessionManager.aiAssistantBusy)
                }

                Section("雲端 AI（OpenAI，可選）") {
                    Toggle(isOn: Binding(
                        get: { sessionManager.aiCloudEnabled },
                        set: { sessionManager.setAICloudEnabled($0) }
                    )) {
                        Text("啟用雲端建議")
                    }

                    SecureField("貼上 OpenAI API Key（sk-...）", text: $aiAPIKeyInput)

                    HStack {
                        Button("儲存 Key") {
                            sessionManager.setOpenAIKey(aiAPIKeyInput)
                            aiAPIKeyInput = ""
                        }
                        .buttonStyle(.bordered)

                        Button("清除 Key") {
                            sessionManager.clearOpenAIKey()
                            aiAPIKeyInput = ""
                        }
                        .buttonStyle(.bordered)
                    }

                    Text(sessionManager.hasOpenAIKey ? "目前狀態：已設定 API Key" : "目前狀態：未設定 API Key")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("AI 建議輸出") {
                    Text(sessionManager.aiAssistantSourceText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(sessionManager.aiAssistantText)
                        .textSelection(.enabled)
                    Text(sessionManager.aiAssistantApplyResultText)
                        .font(.caption)
                        .foregroundStyle(.mint)
                }
            }
            .navigationTitle("AI 助手版")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("關閉") {
                        showingAIAssistant = false
                    }
                }
            }
        }
    }

    private var rebarConfigView: some View {
        NavigationStack {
            Form {
                Section("鋼筋配置") {
                    Stepper("主筋數：\(sessionManager.rebarMainBarCount)", value: Binding(
                        get: { sessionManager.rebarMainBarCount },
                        set: { sessionManager.setRebarMainBarCount($0) }
                    ), in: 2...12)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "箍筋間距：%.0f cm", sessionManager.rebarStirrupSpacingCm))
                        Slider(value: Binding(
                            get: { sessionManager.rebarStirrupSpacingCm },
                            set: { sessionManager.setRebarStirrupSpacingCm($0) }
                        ), in: 5...60, step: 1)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "保護層：%.1f cm", sessionManager.rebarCoverCm))
                        Slider(value: Binding(
                            get: { sessionManager.rebarCoverCm },
                            set: { sessionManager.setRebarCoverCm($0) }
                        ), in: 1...10, step: 0.5)
                    }
                }

                Section("AR 對位微調") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "平移 X：%.1f cm", sessionManager.overlayOffsetXcm))
                        Slider(value: Binding(
                            get: { sessionManager.overlayOffsetXcm },
                            set: { sessionManager.setOverlayOffsetXcm($0) }
                        ), in: -20...20, step: 0.5)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "平移 Y：%.1f cm", sessionManager.overlayOffsetYcm))
                        Slider(value: Binding(
                            get: { sessionManager.overlayOffsetYcm },
                            set: { sessionManager.setOverlayOffsetYcm($0) }
                        ), in: -20...20, step: 0.5)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "旋轉：%.0f°", sessionManager.overlayRotationDeg))
                        Slider(value: Binding(
                            get: { sessionManager.overlayRotationDeg },
                            set: { sessionManager.setOverlayRotationDeg($0) }
                        ), in: -30...30, step: 1)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "縮放：%.2f", sessionManager.overlayScale))
                        Slider(value: Binding(
                            get: { sessionManager.overlayScale },
                            set: { sessionManager.setOverlayScale($0) }
                        ), in: 0.5...2.5, step: 0.05)
                    }

                    Button("重置微調") {
                        sessionManager.resetOverlayAdjustment()
                    }
                }
            }
            .navigationTitle("鋼筋透視參數")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        showingRebarConfig = false
                    }
                }
            }
        }
    }

    private var volumeScanView: some View {
        NavigationStack {
            Form {
                Section("掃描區域設定") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "寬度：%.1f m", sessionManager.volumeAreaWidthMeters))
                        Slider(value: Binding(
                            get: { sessionManager.volumeAreaWidthMeters },
                            set: { sessionManager.setVolumeAreaWidthMeters($0) }
                        ), in: 0.2...20, step: 0.1)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "長度：%.1f m", sessionManager.volumeAreaLengthMeters))
                        Slider(value: Binding(
                            get: { sessionManager.volumeAreaLengthMeters },
                            set: { sessionManager.setVolumeAreaLengthMeters($0) }
                        ), in: 0.2...20, step: 0.1)
                    }

                    Stepper("取樣網格：\(sessionManager.volumeGridSize) x \(sessionManager.volumeGridSize)", value: Binding(
                        get: { sessionManager.volumeGridSize },
                        set: { sessionManager.setVolumeGridSize($0) }
                    ), in: 3...11)
                }

                Section("掃描與結果") {
                    Button("執行一次掃描") {
                        sessionManager.runVolumeScanOnce()
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)

                    Text(String(format: "估算體積：%.2f m³", sessionManager.volumeEstimateM3))
                        .font(.headline)
                    Text("取樣點數：\(sessionManager.volumeSampleCount)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(sessionManager.volumeStatusText)
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            .navigationTitle("3D 體積掃描儀")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        showingVolumeScan = false
                    }
                }
            }
        }
    }

    private enum StatusPage: String, CaseIterable, Identifiable {
        case measure
        case ai
        case system

        var id: String { rawValue }
        var title: String {
            switch self {
            case .measure: return "量測"
            case .ai: return "AI"
            case .system: return "系統"
            }
        }
    }

    private enum ControlPage: String, CaseIterable, Identifiable {
        case measure
        case ai
        case tools

        var id: String { rawValue }
        var title: String {
            switch self {
            case .measure: return "量測"
            case .ai: return "AI"
            case .tools: return "工具"
            }
        }
    }
}
