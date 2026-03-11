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
    @State private var showingCrackInspector = false
    @State private var showingQuantumMode = false
    @State private var quantumCommandInput = ""
    @State private var ibmQuantumAPIKeyInput = ""
    @State private var aiGoalInput = ""
    @State private var aiAPIKeyInput = ""
    @State private var selectedMainPage: MainPage = .page1
    @State private var selectedStatusPage: StatusPage = .measure
    @State private var selectedControlPage: ControlPage = .measure
    @State private var isTopPanelExpanded = false
    @State private var isTacticalMenuOpen = false
    @State private var tacticalMenuDragOffset: CGFloat = 0
    private let minRecordScore = 85
    private let tacticalMenuWidth: CGFloat = 230

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ARViewContainer()
                    .ignoresSafeArea()

                crosshair

                VStack {
                    mainPagePicker
                    topPanel
                    Spacer()
                    bottomPanel
                }
                .padding()

                tacticalMenuDrawer(viewportHeight: proxy.size.height)
            }
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
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackgroundInteraction(.enabled)
        }
        .sheet(isPresented: $showingCrackInspector) {
            crackInspectorView
        }
        .sheet(isPresented: $showingQuantumMode) {
            quantumModeView
        }
        .onChange(of: selectedMainPage) {
            switch selectedMainPage {
            case .page1:
                selectedStatusPage = .measure
                selectedControlPage = .measure
            case .page2:
                selectedStatusPage = .system
                selectedControlPage = .tools
            }
        }
    }

    private var mainPagePicker: some View {
        Picker("畫面分頁", selection: $selectedMainPage) {
            ForEach(MainPage.allCases) { page in
                Text(page.title).tag(page)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 2)
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
            HStack {
                Text("LiDAR 雷射測距鏡")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Button(isTopPanelExpanded ? "收合" : "展開") {
                    isTopPanelExpanded.toggle()
                }
                .buttonStyle(.bordered)
                .tint(.cyan)
                .font(.caption2.bold())
            }
            ScrollView(showsIndicators: isTopPanelExpanded) {
                VStack(alignment: .leading, spacing: 8) {
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
                            Text(String(format: "設計距離：%.2f m｜偏差：%+.1f cm", sessionManager.designTargetDistanceMeters, sessionManager.deviationValueCm))
                                .font(.caption2.bold())
                                .foregroundStyle(abs(sessionManager.deviationValueCm) <= sessionManager.deviationToleranceCm ? .green : .orange)
                            Text(sessionManager.deviationStatusText)
                                .font(.caption2)
                                .foregroundStyle(abs(sessionManager.deviationValueCm) <= sessionManager.deviationToleranceCm ? .mint : .red)
                            deviationGaugeView
                            Text(qaHintText(sessionManager.qaScore))
                                .font(.footnote.bold())
                                .foregroundStyle(qaHintColor(sessionManager.qaScore))
                        case .ai:
                            Text(sessionManager.aiDiagnosisText)
                                .font(.footnote.bold())
                                .foregroundStyle(.white)
                            Text(sessionManager.aiCorrectionText)
                                .font(.caption2)
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
                            Text(sessionManager.arMismatchSummaryText)
                                .font(.caption2.bold())
                                .foregroundStyle(sessionManager.arMismatchAlerts.isEmpty ? .green : .red)
                            if !sessionManager.arMismatchAlerts.isEmpty {
                                ForEach(sessionManager.arMismatchAlerts.prefix(3), id: \.self) { alert in
                                    Text("• \(alert)")
                                        .font(.caption2)
                                        .foregroundStyle(.orange)
                                }
                            }
                            Text(String(format: "掃描面積：%.2f m²", sessionManager.volumeAreaM2))
                                .font(.caption2.bold())
                                .foregroundStyle(.mint)
                            Text(String(format: "體積估算：%.2f m³（%d 點）", sessionManager.volumeEstimateM3, sessionManager.volumeSampleCount))
                                .font(.caption2.bold())
                                .foregroundStyle(.mint)
                            Text(sessionManager.volumeStatusText)
                                .font(.caption2)
                                .foregroundStyle(.orange)
                            Text(String(format: "裂縫最長：%.1f cm｜等級：%@", sessionManager.crackMaxLengthCm, sessionManager.crackSeveritySummary))
                                .font(.caption2.bold())
                                .foregroundStyle(.red)
                            Text(sessionManager.crackStatusText)
                                .font(.caption2)
                                .foregroundStyle(.orange)
                            Text(sessionManager.quantumStatusText)
                                .font(.caption2.bold())
                                .foregroundStyle(.purple)
                            Text("核心引擎等級：\(sessionManager.quantumCoreLevel)%")
                                .font(.caption2)
                                .foregroundStyle(.purple.opacity(0.9))
                            Text(sessionManager.quantumSuggestionText)
                                .font(.caption2)
                                .foregroundStyle(.yellow)
                            Text("狀態: \(sessionManager.statusText)")
                                .font(.footnote)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }
            }
        }
        .frame(maxHeight: isTopPanelExpanded ? 320 : 150, alignment: .top)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: .cyan.opacity(0.25), radius: 12, x: 0, y: 6)
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
                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "設計距離：%.2f m", sessionManager.designTargetDistanceMeters))
                        Slider(value: Binding(
                            get: { sessionManager.designTargetDistanceMeters },
                            set: { sessionManager.setDesignTargetDistanceMeters($0) }
                        ), in: 0.2...20, step: 0.05)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "偏差容差：±%.1f cm", sessionManager.deviationToleranceCm))
                        Slider(value: Binding(
                            get: { sessionManager.deviationToleranceCm },
                            set: { sessionManager.setDeviationToleranceCm($0) }
                        ), in: 0.5...20, step: 0.5)
                    }

                    Toggle(isOn: Binding(
                        get: { sessionManager.highPrecisionContinuousModeEnabled },
                        set: { sessionManager.setHighPrecisionContinuousModeEnabled($0) }
                    )) {
                        Text("高精度連續模式（記錄前 3 次取中位數）")
                            .font(.footnote.bold())
                    }
                    .tint(.green)

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
                        performRecordMeasurement()
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(!canRecordMeasurement)

                    if !canRecordMeasurement {
                        Text(recordBlockReasonText)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    Text(sessionManager.highPrecisionStatusText)
                        .font(.caption2)
                        .foregroundStyle(.mint)

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

                    Button("AI 裂縫抓漏") {
                        showingCrackInspector = true
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .frame(maxWidth: .infinity)

                    Button(sessionManager.quantumModeEnabled ? "核心引擎（運行中）" : "核心引擎戰術模式") {
                        showingQuantumMode = true
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: .cyan.opacity(0.25), radius: 12, x: 0, y: 6)
    }

    private func tacticalMenuDrawer(viewportHeight: CGFloat) -> some View {
        HStack(spacing: 0) {
            Spacer()

            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    isTacticalMenuOpen.toggle()
                }
            } label: {
                Image(systemName: isTacticalMenuOpen ? "chevron.right" : "chevron.left")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 88)
                    .background(.black.opacity(0.72))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .shadow(color: .cyan.opacity(0.35), radius: 8, x: -3, y: 0)
            }

            VStack(spacing: 14) {
                Text("作戰選單")
                    .font(.headline)
                    .foregroundStyle(.mint)

                Button {
                    performRecordMeasurement()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isTacticalMenuOpen = false
                    }
                } label: {
                    Text("📸 記錄量測")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.green.opacity(0.85))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .disabled(!canRecordMeasurement)

                Button {
                    sessionManager.applyAIQACorrection()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isTacticalMenuOpen = false
                    }
                } label: {
                    Text("🤖 一鍵矯正")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.blue.opacity(0.85))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                Button {
                    showingAIAssistant = true
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isTacticalMenuOpen = false
                    }
                } label: {
                    Text("✨ AI 建議")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.purple.opacity(0.85))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                Spacer(minLength: 0)
            }
            .foregroundStyle(.white)
            .padding(14)
            .frame(
                width: tacticalMenuWidth,
                height: min(max(260, viewportHeight * 0.58), 520)
            )
            .background(.black.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .offset(x: isTacticalMenuOpen ? tacticalMenuDragOffset : tacticalMenuWidth + tacticalMenuDragOffset)
        .gesture(
            DragGesture()
                .onChanged { value in
                    if isTacticalMenuOpen {
                        tacticalMenuDragOffset = max(0, value.translation.width)
                    } else {
                        tacticalMenuDragOffset = min(0, value.translation.width)
                    }
                }
                .onEnded { value in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        if isTacticalMenuOpen, value.translation.width > 50 {
                            isTacticalMenuOpen = false
                        } else if !isTacticalMenuOpen, value.translation.width < -50 {
                            isTacticalMenuOpen = true
                        }
                        tacticalMenuDragOffset = 0
                    }
                }
        )
    }

    private func performRecordMeasurement() {
        guard let distance = sessionManager.prepareDistanceForRecording() else { return }
        measurementStore.add(
            distance: distance,
            pitch: sessionManager.latestPitchDegrees,
            roll: sessionManager.latestRollDegrees,
            qaLevel: sessionManager.qaLevel,
            qaProfile: sessionManager.qaProfile,
            qaScore: sessionManager.qaScore
        )
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

    private var deviationGaugeView: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("偏差可視化")
                    .font(.caption2.bold())
                    .foregroundStyle(.white.opacity(0.9))
                if isDeviationOverLimit {
                    Text("⚠️ 超限")
                        .font(.caption2.bold())
                        .foregroundStyle(.red)
                }
            }
            GeometryReader { geo in
                let fullWidth = max(1, geo.size.width)
                let fillWidth = fullWidth * deviationGaugeFillRatio
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(.white.opacity(0.16))
                    Capsule()
                        .fill(deviationGaugeColor)
                        .frame(width: fillWidth)
                }
            }
            .frame(height: 8)
        }
    }

    private var isDeviationOverLimit: Bool {
        abs(sessionManager.deviationValueCm) > sessionManager.deviationToleranceCm
    }

    private var deviationGaugeColor: Color {
        let absDelta = abs(sessionManager.deviationValueCm)
        if absDelta <= sessionManager.deviationToleranceCm { return .green }
        if absDelta <= sessionManager.deviationToleranceCm * 1.6 { return .yellow }
        return .red
    }

    private var deviationGaugeFillRatio: CGFloat {
        let base = max(0.5, sessionManager.deviationToleranceCm * 2.0)
        let raw = abs(sessionManager.deviationValueCm) / base
        return CGFloat(min(1.0, max(0.0, raw)))
    }

    private var canRecordMeasurement: Bool {
        guard sessionManager.latestDistanceMeters != nil else { return false }
        guard sessionManager.qaScore >= minRecordScore else { return false }
        guard abs(sessionManager.deviationValueCm) <= sessionManager.deviationToleranceCm else { return false }
        return true
    }

    private var recordBlockReasonText: String {
        if sessionManager.latestDistanceMeters == nil {
            return "尚未鎖定量測距離，請先對準目標"
        }
        if sessionManager.qaScore < minRecordScore {
            return "需達 \(minRecordScore) 分以上才能記錄（目前 \(sessionManager.qaScore) 分）"
        }
        if abs(sessionManager.deviationValueCm) > sessionManager.deviationToleranceCm {
            return String(
                format: "偏差超限（%+.1f cm），需在 ±%.1f cm 內才可記錄",
                sessionManager.deviationValueCm,
                sessionManager.deviationToleranceCm
            )
        }
        return "目前不符合記錄條件"
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

                    Text(String(format: "掃描面積：%.2f m²", sessionManager.volumeAreaM2))
                        .font(.headline)
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

    private var crackInspectorView: some View {
        NavigationStack {
            Form {
                Section("影像來源（鏡頭即時）") {
                    Text("系統將直接使用 AR 鏡頭畫面做裂縫 AI 偵測")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(String(format: "校正比例：1 px = %.3f cm", sessionManager.crackCalibrationCmPerPixel))
                        Slider(value: Binding(
                            get: { sessionManager.crackCalibrationCmPerPixel },
                            set: { sessionManager.setCrackCalibrationCmPerPixel($0) }
                        ), in: 0.005...1.0, step: 0.005)
                    }

                    Button("鏡頭即時裂縫分析") {
                        sessionManager.runCrackDetection()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }

                Section("分析結果") {
                    Text(sessionManager.crackStatusText)
                        .font(.caption)
                        .foregroundStyle(.orange)
                    Text(String(format: "最長裂縫：%.1f cm", sessionManager.crackMaxLengthCm))
                        .font(.footnote.bold())
                    Text("嚴重度：\(sessionManager.crackSeveritySummary)")
                        .font(.footnote.bold())
                        .foregroundStyle(
                            sessionManager.crackSeveritySummary == "高" ? .red :
                                (sessionManager.crackSeveritySummary == "中" ? .orange : .yellow)
                        )
                }

                if let image = sessionManager.crackInputImage {
                    Section("裂縫標記") {
                        crackOverlayPreview(image: image, findings: sessionManager.crackFindings)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("AI 裂縫抓漏")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        showingCrackInspector = false
                    }
                }
            }
        }
    }

    private func crackOverlayPreview(image: UIImage, findings: [CrackFinding]) -> some View {
        GeometryReader { geo in
            let imageSize = image.size
            let fitted = aspectFitRect(imageSize: imageSize, in: geo.size)

            ZStack(alignment: .topLeading) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: geo.size.width, height: geo.size.height)

                ForEach(findings) { finding in
                    let rect = rectForNormalizedBox(finding.box, in: fitted)
                    Rectangle()
                        .stroke(finding.severity == "高" ? .red : (finding.severity == "中" ? .orange : .yellow), lineWidth: 2)
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)
                }
            }
        }
        .frame(height: 260)
    }

    private func aspectFitRect(imageSize: CGSize, in container: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        let scale = min(container.width / imageSize.width, container.height / imageSize.height)
        let width = imageSize.width * scale
        let height = imageSize.height * scale
        let x = (container.width - width) / 2
        let y = (container.height - height) / 2
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private func rectForNormalizedBox(_ box: CGRect, in fittedImageRect: CGRect) -> CGRect {
        let x = fittedImageRect.minX + box.minX * fittedImageRect.width
        // Vision normalized box origin is bottom-left, SwiftUI is top-left.
        let y = fittedImageRect.minY + (1 - box.maxY) * fittedImageRect.height
        let w = box.width * fittedImageRect.width
        let h = box.height * fittedImageRect.height
        return CGRect(x: x, y: y, width: w, height: h)
    }

    private var quantumModeView: some View {
        NavigationStack {
            Form {
                Section("戰術口令") {
                    TextField("輸入口令（例如：核心引擎啟動）", text: $quantumCommandInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button("啟動核心引擎") {
                        sessionManager.activateQuantumMode(command: quantumCommandInput)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)

                    Button(sessionManager.quantumVoiceListening ? "停止語音口令" : "語音口令啟動") {
                        if sessionManager.quantumVoiceListening {
                            sessionManager.stopQuantumVoiceCommand()
                        } else {
                            sessionManager.startQuantumVoiceCommand()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.indigo)
                    .frame(maxWidth: .infinity)

                    Button("解除核心引擎") {
                        sessionManager.deactivateQuantumMode()
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
                    .frame(maxWidth: .infinity)

                    Button("一鍵融合補齊") {
                        sessionManager.runQuantumFusionAutopilot()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.mint)
                    .frame(maxWidth: .infinity)
                    .disabled(!sessionManager.quantumModeEnabled)
                }

                Section("核心狀態") {
                    Text(sessionManager.quantumStatusText)
                        .font(.headline)
                        .foregroundStyle(.purple)
                    Text(sessionManager.quantumFusionStatusText)
                        .font(.caption)
                        .foregroundStyle(.mint)
                    Text(sessionManager.quantumIBMProviderText)
                        .font(.caption)
                        .foregroundStyle(.cyan)
                    Text(sessionManager.quantumIBMJobText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(sessionManager.quantumIBMResultText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("Backend：\(sessionManager.quantumIBMBackend)｜Shots：\(sessionManager.quantumIBMShots)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("核心等級：\(sessionManager.quantumCoreLevel)%")
                        .font(.footnote)
                    if !sessionManager.quantumLastCommandText.isEmpty {
                        Text("最近口令：\(sessionManager.quantumLastCommandText)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !sessionManager.quantumVoiceTranscript.isEmpty {
                        Text("語音轉寫：\(sessionManager.quantumVoiceTranscript)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(sessionManager.quantumModeEnabled ? "模式：已啟用" : "模式：待命")
                        .font(.caption)
                        .foregroundStyle(sessionManager.quantumModeEnabled ? .mint : .secondary)
                    Text(sessionManager.quantumSuggestionText)
                        .font(.caption)
                        .foregroundStyle(.yellow)
                }

                Section("IBM Cloud API（需要就用）") {
                    Toggle(isOn: Binding(
                        get: { sessionManager.quantumIBMCloudEnabled },
                        set: { sessionManager.setQuantumIBMCloudEnabled($0) }
                    )) {
                        Text("啟用 IBM Cloud API")
                    }

                    SecureField("貼上 IBM Cloud API Key", text: $ibmQuantumAPIKeyInput)

                    HStack {
                        Button("儲存 Key") {
                            sessionManager.setIBMQuantumAPIKey(ibmQuantumAPIKeyInput)
                            ibmQuantumAPIKeyInput = ""
                        }
                        .buttonStyle(.bordered)

                        Button("清除 Key") {
                            sessionManager.clearIBMQuantumAPIKey()
                            ibmQuantumAPIKeyInput = ""
                        }
                        .buttonStyle(.bordered)
                    }

                    Text(sessionManager.hasIBMQuantumAPIKey ? "目前狀態：已設定 IBM API Key" : "目前狀態：未設定 IBM API Key")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Picker("Backend", selection: Binding(
                        get: { sessionManager.quantumIBMBackend },
                        set: { sessionManager.setIBMBackend($0) }
                    )) {
                        ForEach(sessionManager.availableIBMBackends, id: \.self) { backend in
                            Text(backend).tag(backend)
                        }
                    }

                    Stepper(
                        "Shots：\(sessionManager.quantumIBMShots)",
                        value: Binding(
                            get: { sessionManager.quantumIBMShots },
                            set: { sessionManager.setIBMShots($0) }
                        ),
                        in: 32...4096,
                        step: 32
                    )
                }

                Section("戰術記錄") {
                    if sessionManager.quantumHistory.isEmpty {
                        Text("尚無戰術記錄")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(sessionManager.quantumHistory.prefix(8)) { item in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.createdAt.formatted(date: .abbreviated, time: .standard))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("[\(item.source)] \(item.command)")
                                    .font(.footnote)
                                Text("分數 \(item.beforeScore) -> \(item.afterScore)｜核心 \(item.coreLevelAfter)%")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("清空戰術記錄") {
                        sessionManager.clearQuantumHistory()
                    }
                }
            }
            .navigationTitle("核心引擎戰術模式")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        showingQuantumMode = false
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

    private enum MainPage: String, CaseIterable, Identifiable {
        case page1
        case page2

        var id: String { rawValue }
        var title: String {
            switch self {
            case .page1: return "第1頁"
            case .page2: return "第2頁"
            }
        }
    }
}
