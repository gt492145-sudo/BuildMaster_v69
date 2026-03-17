import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import simd
import CryptoKit
import Foundation
import Dispatch

struct ContentView: View {
    private enum TacticalDragAxis {
        case horizontal
        case vertical
    }

    private enum ModalSheetTarget: String, Identifiable {
        case records
        case share
        case correctionHistory
        case aiAssistant
        case rebarConfig
        case volumeScan
        case crackInspector
        case quantumMode
        case testChecklist
        case siteDeploymentChecklist
        case monkeyAccess
        case monkeyReport

        var id: String { rawValue }
    }

    @EnvironmentObject private var sessionManager: LiDARSessionManager
    @EnvironmentObject private var measurementStore: MeasurementStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var activeSheet: ModalSheetTarget?
    @State private var completedTestItems: Set<TestChecklistItem> = []
    @State private var completedSiteChecklistItems: Set<SiteChecklistItem> = []
    @State private var quantumCommandInput = ""
    @State private var ibmQuantumAPIKeyInput = ""
    @State private var aiGoalInput = ""
    @State private var aiAPIKeyInput = ""
    @State private var selectedMainPage: MainPage = .page1
    @State private var selectedStatusPage: StatusPage = .measure
    @State private var selectedControlPage: ControlPage = .measure
    @State private var assistantSheetDetent: PresentationDetent = .fraction(0.32)
    @State private var rebarSheetDetent: PresentationDetent = .fraction(0.32)
    @State private var volumeSheetDetent: PresentationDetent = .fraction(0.28)
    @State private var crackSheetDetent: PresentationDetent = .fraction(0.32)
    @State private var quantumSheetDetent: PresentationDetent = .fraction(0.32)
    @State private var isTopPanelExpanded = false
    @State private var isTacticalMenuOpen = false
    @State private var isClearViewMode = false
    @State private var autoClearViewDuringMeasure = false
    @State private var clearViewAutoApplied = false
    @State private var safetyMonkeyEnabled = false
    @State private var safetyMonkeyTickCount = 0
    @State private var safetyMonkeyLastAction = "待命"
    @State private var safetyMonkeyTask: Task<Void, Never>?
    @State private var monkeyStressLevel: MonkeyStressLevel = .balanced
    @State private var monkeySessionStartedAt: Date?
    @State private var monkeyLastStoppedAt: Date?
    @State private var monkeyActionHistory: [String] = []
    @State private var monkeyReportLines: [String] = []
    @State private var monkeyHasPassword = false
    @State private var isMonkeyUnlocked = false
    @State private var monkeyLockMode: MonkeyLockMode = .unlock
    @State private var monkeyPasswordInput = ""
    @State private var monkeyPasswordConfirmInput = ""
    @State private var monkeyPasswordError = ""
    @State private var showingIFCFileImporter = false
    @State private var selectedBlueprintPhotoItem: PhotosPickerItem?
    @State private var blueprintPlanWidthMeters: Double = 8.85
    @State private var blueprintPlanHeightMeters: Double = 24.925
    @State private var tacticalMenuDragOffset: CGFloat = 0
    @State private var tacticalMenuDragAxis: TacticalDragAxis?
    @State private var isViewActive = false
    @State private var sheetSwitchTask: Task<Void, Never>?
    @State private var measureDraftInitialized = false
    @State private var draftDesignTargetDistanceMeters: Double = 2.0
    @State private var draftDeviationToleranceCm: Double = 3.0
    @State private var draftHighPrecisionContinuousModeEnabled = true
    @State private var draftHighestModeLockEnabled = false
    @State private var draftQAProfile: QATuningProfile = .ultra
    private let minRecordScore = 85
    private let tacticalMenuWidth: CGFloat = 230
    private let touchOpenCloseThreshold: CGFloat = 34
    private let monkeyPassHashStorageKey = "lidar_rangefinder_monkey_pass_hash_v1"

    var body: some View {
        GeometryReader { proxy in
            let isLandscape = proxy.size.width > proxy.size.height
            ZStack {
                ARViewContainer()
                    .ignoresSafeArea()

                crosshair

                if isLandscape {
                    if !isClearViewMode {
                        landscapeCombatOverlay
                            .padding(.top, 12)
                            .padding(.leading, 12)
                            .padding(.trailing, trailingInset(for: proxy.size))
                            .padding(.bottom, 12)
                    }
                } else {
                    if !isClearViewMode {
                        VStack {
                            mainPagePicker
                            topPanel
                            Spacer()
                            bottomPanel
                        }
                        .padding(.top, 10)
                        .padding(.leading, 10)
                        .padding(.bottom, 10)
                        .padding(.trailing, trailingInset(for: proxy.size))
                        .animation(.easeInOut(duration: 0.2), value: isTacticalMenuOpen)
                    }
                }

                if !isClearViewMode {
                    tacticalMenuDrawer(viewportHeight: proxy.size.height)
                }

                clearViewToggleButton
                    .padding(.top, 12)
                    .padding(.trailing, 12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)

                if isClearViewMode {
                    clearViewRecordButton
                        .padding(.bottom, 20)
                        .padding(.trailing, 18)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                }
            }
        }
        .sheet(item: $activeSheet) { target in
            switch target {
            case .records:
                recordsView
            case .share:
                ShareSheet(items: [measurementStore.csvString()])
            case .correctionHistory:
                correctionHistoryView
            case .aiAssistant:
                aiAssistantView
                    .presentationDetents([.fraction(0.32), .medium, .large], selection: $assistantSheetDetent)
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .rebarConfig:
                rebarConfigView
                    .presentationDetents([.fraction(0.32), .medium, .large], selection: $rebarSheetDetent)
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .volumeScan:
                volumeScanView
                    .presentationDetents([.fraction(0.28), .medium, .large], selection: $volumeSheetDetent)
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .crackInspector:
                crackInspectorView
                    .presentationDetents([.fraction(0.32), .medium, .large], selection: $crackSheetDetent)
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .quantumMode:
                quantumModeView
                    .presentationDetents([.fraction(0.32), .medium, .large], selection: $quantumSheetDetent)
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .testChecklist:
                testChecklistView
                    .presentationDetents([.fraction(0.4), .medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .siteDeploymentChecklist:
                siteDeploymentChecklistView
                    .presentationDetents([.fraction(0.45), .medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .monkeyAccess:
                monkeyAccessSheetView
                    .presentationDetents([.fraction(0.36), .medium])
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            case .monkeyReport:
                monkeyReportSheetView
                    .presentationDetents([.fraction(0.36), .medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled)
            }
        }
        .fileImporter(
            isPresented: $showingIFCFileImporter,
            allowedContentTypes: supportedIFCImportTypes,
            allowsMultipleSelection: false
        ) { result in
            handleIFCImportResult(result)
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
        .onChange(of: selectedControlPage) {
            syncAutoClearViewMode(for: selectedControlPage)
            if selectedControlPage == .measure {
                syncMeasureDraftFromManager(force: true)
            }
        }
        .onChange(of: autoClearViewDuringMeasure) {
            syncAutoClearViewMode(for: selectedControlPage)
        }
        .onChange(of: activeSheet) {
            switch activeSheet {
            case .volumeScan:
                volumeSheetDetent = .fraction(0.28)
            case .aiAssistant:
                assistantSheetDetent = .fraction(0.32)
            case .rebarConfig:
                rebarSheetDetent = .fraction(0.32)
            case .crackInspector:
                crackSheetDetent = .fraction(0.32)
                sessionManager.refreshCrackPreviewFromCurrentFrame()
            case .quantumMode:
                quantumSheetDetent = .fraction(0.32)
            default:
                break
            }
        }
        .onChange(of: selectedBlueprintPhotoItem) {
            Task {
                await handleBlueprintPhotoSelection()
            }
        }
        .onChange(of: blueprintPlanWidthMeters) {
            sessionManager.setUploadedBlueprintPhysicalWidthMeters(blueprintPlanWidthMeters)
        }
        .onAppear {
            isViewActive = true
            clearViewAutoApplied = false
            setClearViewMode(false)
            syncAutoClearViewMode(for: selectedControlPage)
            syncMeasureDraftFromManager(force: true)
            refreshMonkeyAccessState()
            sessionManager.setUploadedBlueprintPhysicalWidthMeters(blueprintPlanWidthMeters)
            sessionManager.resumeSessionIfNeeded()
        }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                sessionManager.resumeSessionIfNeeded()
            } else {
                stopSafetyMonkey()
                isMonkeyUnlocked = false
                sessionManager.suspendSessionForViewDisappearance()
            }
        }
        .onDisappear {
            isViewActive = false
            stopSafetyMonkey()
            closeAllModalSheets()
            sessionManager.suspendSessionForViewDisappearance()
        }
    }

    private func deferSessionMutation(_ mutation: @escaping (LiDARSessionManager) -> Void) {
        guard isViewActive, scenePhase == .active else { return }
        DispatchQueue.main.async {
            guard self.isViewActive, self.scenePhase == .active else { return }
            mutation(self.sessionManager)
        }
    }

    private func closeAllModalSheets() {
        sheetSwitchTask?.cancel()
        sheetSwitchTask = nil
        activeSheet = nil
    }

    private func isModalSheetPresented(_ target: ModalSheetTarget) -> Bool {
        activeSheet == target
    }

    private func openModalSheet(_ target: ModalSheetTarget) {
        activeSheet = target
    }

    private func presentModalSheetSafely(_ target: ModalSheetTarget) {
        guard isViewActive, scenePhase == .active else { return }
        guard !isModalSheetPresented(target) else { return }

        sheetSwitchTask?.cancel()
        sheetSwitchTask = nil

        if activeSheet == nil {
            openModalSheet(target)
            return
        }

        // Avoid rapid cross-sheet replacement glitches by switching in two phases.
        activeSheet = nil
        sheetSwitchTask = Task {
            try? await Task.sleep(nanoseconds: 120_000_000)
            await MainActor.run {
                guard self.isViewActive, self.scenePhase == .active else { return }
                self.openModalSheet(target)
                self.sheetSwitchTask = nil
            }
        }
    }

    private func presentAIAssistantSafely() {
        presentModalSheetSafely(.aiAssistant)
    }

    private func presentCorrectionHistorySafely() {
        presentModalSheetSafely(.correctionHistory)
    }

    private func syncMeasureDraftFromManager(force: Bool) {
        if measureDraftInitialized && !force { return }
        draftDesignTargetDistanceMeters = sessionManager.designTargetDistanceMeters
        draftDeviationToleranceCm = sessionManager.deviationToleranceCm
        draftHighPrecisionContinuousModeEnabled = sessionManager.highPrecisionContinuousModeEnabled
        draftHighestModeLockEnabled = sessionManager.highestModeLockEnabled
        draftQAProfile = sessionManager.qaProfile
        measureDraftInitialized = true
    }

    private func applyMeasureDraftToSession() {
        guard measureDraftInitialized else { return }
        if abs(draftDesignTargetDistanceMeters - sessionManager.designTargetDistanceMeters) >= 0.0001 {
            sessionManager.setDesignTargetDistanceMeters(draftDesignTargetDistanceMeters)
        }
        if abs(draftDeviationToleranceCm - sessionManager.deviationToleranceCm) >= 0.0001 {
            sessionManager.setDeviationToleranceCm(draftDeviationToleranceCm)
        }
        if draftHighPrecisionContinuousModeEnabled != sessionManager.highPrecisionContinuousModeEnabled {
            sessionManager.setHighPrecisionContinuousModeEnabled(draftHighPrecisionContinuousModeEnabled)
        }
        if draftHighestModeLockEnabled != sessionManager.highestModeLockEnabled {
            sessionManager.setHighestModeLockEnabled(draftHighestModeLockEnabled)
        }
        if draftQAProfile != sessionManager.qaProfile {
            sessionManager.setQAProfile(draftQAProfile)
        }
        syncMeasureDraftFromManager(force: true)
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

    private var clearViewToggleButton: some View {
        Button {
            clearViewAutoApplied = false
            setClearViewMode(!isClearViewMode)
        } label: {
            Text(isClearViewMode ? "顯示功能" : "釋放畫面")
                .font(.subheadline.bold())
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(
                    LinearGradient(
                        colors: isClearViewMode
                            ? [.teal.opacity(0.95), .cyan.opacity(0.8)]
                            : [.black.opacity(0.78), .black.opacity(0.62)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .foregroundStyle(.white)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(.white.opacity(0.75), lineWidth: 1.4)
                )
                .shadow(color: .black.opacity(0.32), radius: 6, x: 0, y: 3)
                .frame(minWidth: 112, minHeight: 48)
                .contentShape(Rectangle())
        }
    }

    private var clearViewRecordButton: some View {
        Button {
            if activeSheet == .volumeScan {
                sessionManager.runVolumeScanOnce()
                return
            }
            if canRecordMeasurement {
                let recorded = performRecordMeasurement()
                if recorded, autoClearViewDuringMeasure {
                    clearViewAutoApplied = false
                    setClearViewMode(false)
                }
            } else {
                // Keep this button always responsive: if record conditions are not met,
                // return to the full control panels so the operator can adjust quickly.
                clearViewAutoApplied = false
                selectedMainPage = .page1
                selectedControlPage = .measure
                selectedStatusPage = .measure
                setClearViewMode(false)
            }
        } label: {
            Image(systemName: activeSheet == .volumeScan ? "viewfinder.circle.fill" : "camera.metering.center.weighted")
                .font(.title2.bold())
                .foregroundStyle(.white)
                .frame(width: 74, height: 74)
                .background(
                    activeSheet == .volumeScan
                        ? LinearGradient(colors: [.blue.opacity(0.98), .cyan.opacity(0.86)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        : (
                            canRecordMeasurement
                                ? LinearGradient(colors: [.green.opacity(0.98), .mint.opacity(0.88)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                : LinearGradient(colors: [.gray.opacity(0.7), .gray.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                )
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(.white.opacity(0.92), lineWidth: 2.6)
                )
                .shadow(color: .black.opacity(0.4), radius: 10, x: 0, y: 5)
                .contentShape(Circle())
                .padding(8)
                .contentShape(Rectangle())
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
        let compactTopStats = !isTopPanelExpanded
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("LiDAR 雷射測距鏡")
                    .font(.subheadline.bold())
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
                        .font(compactTopStats ? .headline.weight(.semibold) : .title2.bold())
                        .foregroundStyle(.green)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    HStack {
                        Text("Pitch: \(sessionManager.pitchText)")
                        Text("Roll: \(sessionManager.rollText)")
                    }
                    .font(compactTopStats ? .caption : .footnote)
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
                                .font(compactTopStats ? .caption.bold() : .subheadline.bold())
                                .foregroundStyle(qaLevelColor(sessionManager.qaLevel))
                            Text("QA 模式: \(sessionManager.qaProfile.displayName)")
                                .font(compactTopStats ? .caption2 : .footnote)
                                .foregroundStyle(.white.opacity(0.85))
                            Text(sessionManager.highestModeLockEnabled ? "模式鎖定：最高等級" : "模式鎖定：關")
                                .font(.caption2)
                                .foregroundStyle(sessionManager.highestModeLockEnabled ? .yellow : .secondary)
                            Text("QA 分數: \(sessionManager.qaScore) / 100")
                                .font(compactTopStats ? .caption.bold() : .subheadline.bold())
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
                                .font(compactTopStats ? .caption.bold() : .footnote.bold())
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
                            Text(sessionManager.arPOCStatusText)
                                .font(.caption2.bold())
                                .foregroundStyle(.cyan)
                            Text(sessionManager.runtimeQASummaryText)
                                .font(.caption2.bold())
                                .foregroundStyle(.mint)
                            if !sessionManager.runtimeQAReasons.isEmpty {
                                ForEach(Array(sessionManager.runtimeQAReasons.prefix(2).enumerated()), id: \.offset) { _, reason in
                                    Text("• \(reason)")
                                        .font(.caption2)
                                        .foregroundStyle(.yellow)
                                }
                            }
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
                            Text("狀態: \(sessionManager.statusText)")
                                .font(.footnote)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }
            }
        }
        .frame(maxHeight: isTopPanelExpanded ? 320 : 126, alignment: .top)
        .padding(isTopPanelExpanded ? 12 : 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.regularMaterial)
        )
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

            if selectedControlPage == .tools {
                HStack(spacing: 8) {
                    Button("匯入IFC") {
                        showingIFCFileImporter = true
                    }
                    .prominentActionStyle(.indigo)

                    Button(ifc3DButtonTitle) {
                        handleIFCSimulationToggle()
                    }
                    .prominentActionStyle(sessionManager.ifcSimulationEnabled ? .orange : .teal)
                }
            }

            ScrollView(.vertical, showsIndicators: true) {
                LazyVStack(spacing: 10) {
                    if isViewActive {
                        AnyView(
                            Group {
                                switch selectedControlPage {
                case .measure:
                    measureControlSection
                case .ai:
                    Button("AI QA 一鍵矯正") {
                        deferSessionMutation { manager in
                            manager.applyAIQACorrection()
                        }
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                    .disabled(!sessionManager.aiCanAutoCorrect)

                    Button(sessionManager.autoCorrectionEnabled ? "停止自動連續矯正" : "啟動自動連續矯正") {
                        deferSessionMutation { manager in
                            manager.toggleAutoCorrection()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(sessionManager.autoCorrectionEnabled ? .red : .blue)
                    .frame(maxWidth: .infinity)

                    Picker("自動矯正策略", selection: Binding(
                        get: { sessionManager.autoCorrectionStrategy },
                        set: { value in
                            deferSessionMutation { manager in
                                manager.setAutoCorrectionStrategy(value)
                            }
                        }
                    )) {
                        ForEach(AIAutoCorrectionStrategy.allCases) { strategy in
                            Text(strategy.displayName).tag(strategy)
                        }
                    }
                    .pickerStyle(.segmented)
                    .tint(.indigo)

                    Button("AI 助手版（現場建議）") {
                        presentAIAssistantSafely()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)
                case .tools:
                    Button("匯入 IFC/JSON 工程檔") {
                        showingIFCFileImporter = true
                    }
                    .prominentActionStyle(.indigo)

                    Text(sessionManager.ifcModelSummaryText)
                        .font(.caption2)
                        .foregroundStyle(.indigo)

                    captionStatus(sessionManager.ifcImportPreflightStatusText, color: .teal)
                    captionStatus(sessionManager.ifcLegendText, color: .secondary)

                    Toggle("網狀模式（LiDAR Mesh）", isOn: Binding(
                        get: { sessionManager.meshVisualizationEnabled },
                        set: { sessionManager.setMeshVisualizationEnabled($0) }
                    ))
                        .tint(.orange)

                    Text(sessionManager.meshVisualizationStatusText)
                        .font(.caption2)
                        .foregroundStyle(.orange)

                    Group {
                        TextField("TWD97 E", value: Binding(
                            get: { sessionManager.twd97BaseE },
                            set: { sessionManager.setTWD97BaseE($0) }
                        ), format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.decimalPad)

                        TextField("TWD97 N", value: Binding(
                            get: { sessionManager.twd97BaseN },
                            set: { sessionManager.setTWD97BaseN($0) }
                        ), format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.decimalPad)

                        TextField("TWD97 H", value: Binding(
                            get: { sessionManager.twd97BaseH },
                            set: { sessionManager.setTWD97BaseH($0) }
                        ), format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.decimalPad)

                        TextField("旋轉角（deg）", value: Binding(
                            get: { sessionManager.twd97RotationDeg },
                            set: { sessionManager.setTWD97RotationDeg($0) }
                        ), format: .number)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.decimalPad)
                    }

                    Button("生成 TWD97 放樣點") {
                        sessionManager.generateTWDStakingPointsFromIFC()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.mint)
                    .frame(maxWidth: .infinity)

                    Text(sessionManager.twdStakingStatusText)
                        .font(.caption2)
                        .foregroundStyle(.mint)

                    Button(sessionManager.twdStakingPreviewEnabled ? "隱藏 AR 放樣點" : "顯示 AR 放樣點") {
                        sessionManager.toggleTWDStakingPreviewInAR()
                    }
                    .buttonStyle(.bordered)
                    .tint(.cyan)
                    .frame(maxWidth: .infinity)

                    Text(sessionManager.twdStakingPreviewStatusText)
                        .font(.caption2)
                        .foregroundStyle(.cyan)

                    if !sessionManager.twdStakingPoints.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(sessionManager.twdStakingPoints.prefix(10)) { point in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(point.name)
                                            .font(.caption.bold())
                                        Text(String(format: "E %.3f", point.e))
                                            .font(.caption2)
                                        Text(String(format: "N %.3f", point.n))
                                            .font(.caption2)
                                        Text(String(format: "H %.3f", point.h))
                                            .font(.caption2)
                                    }
                                    .padding(8)
                                    .background(.black.opacity(0.18))
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                            }
                        }
                    }

                    if sessionManager.ifcModelElementCount > 0 {
                        Toggle("顯示牆體", isOn: Binding(
                            get: { sessionManager.ifcShowWalls },
                            set: { sessionManager.setIFCShowWalls($0) }
                        ))
                            .tint(.blue)
                        Toggle("顯示鋼筋", isOn: Binding(
                            get: { sessionManager.ifcShowRebars },
                            set: { sessionManager.setIFCShowRebars($0) }
                        ))
                            .tint(.red)
                        Toggle("顯示水管", isOn: Binding(
                            get: { sessionManager.ifcShowPipes },
                            set: { sessionManager.setIFCShowPipes($0) }
                        ))
                            .tint(.green)
                    }

                    PhotosPicker(selection: $selectedBlueprintPhotoItem, matching: .images, photoLibrary: .shared()) {
                        Label("上傳圖紙（底圖）", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)

                    Text(sessionManager.blueprintUploadStatusText)
                        .font(.caption2)
                        .foregroundStyle(.cyan)

                    Picker("前線判圖模式", selection: Binding(
                        get: { sessionManager.frontlineBlueprintQAMode },
                        set: { sessionManager.setFrontlineBlueprintQAMode($0) }
                    )) {
                        ForEach(FrontlineBlueprintQAMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(sessionManager.blueprintFrontlineQAText)
                        .font(.caption2)
                        .foregroundStyle(.orange)

                    ForEach(Array(sessionManager.blueprintFrontlineDetailLines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.82))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Text(sessionManager.stage1PreprocessStatusText)
                        .font(.caption2)
                        .foregroundStyle(.yellow)

                    Text(sessionManager.stage2QAGateStatusText)
                        .font(.caption2)
                        .foregroundStyle(.orange)

                    Text(sessionManager.stage3ARBuildStatusText)
                        .font(.caption2)
                        .foregroundStyle(.green)

                    Text(sessionManager.stage4ModelBuildStatusText)
                        .font(.caption2)
                        .foregroundStyle(.teal)

                    Text(sessionManager.stage5RenderStatusText)
                        .font(.caption2)
                        .foregroundStyle(.mint)

                    HStack(spacing: 10) {
                        Button("加入多視角樣本") {
                            sessionManager.appendCurrentBlueprintToMultiViewSet()
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                        Button("清空樣本") {
                            sessionManager.clearMultiViewSamples()
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    }

                    Button("生成多視角重建封包") {
                        sessionManager.buildMultiViewReconstructionPackage()
                    }
                    .buttonStyle(.bordered)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)

                    Text("多視角樣本：\(sessionManager.multiViewSampleCount)/12")
                        .font(.caption2)
                        .foregroundStyle(.purple)

                    Text(sessionManager.multiViewStatusText)
                        .font(.caption2)
                        .foregroundStyle(.purple.opacity(0.9))

                    if !sessionManager.multiViewPackagePreviewLines.isEmpty {
                        ScrollView(.vertical, showsIndicators: true) {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(sessionManager.multiViewPackagePreviewLines.enumerated()), id: \.offset) { _, line in
                                    Text(line)
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.88))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(maxHeight: 120)
                        .padding(8)
                        .background(.black.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    if let blueprintImage = sessionManager.blueprintInputImage {
                        Image(uiImage: blueprintImage)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, minHeight: 90, maxHeight: 140)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(.white.opacity(0.2), lineWidth: 1)
                            )
                            .overlay(blueprintScanLightOverlay)

                        Button("清除上傳圖紙") {
                            sessionManager.clearBlueprintInputImage()
                            selectedBlueprintPhotoItem = nil
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    }

                    Group {
                        TextField("圖紙寬（m）", value: $blueprintPlanWidthMeters, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.decimalPad)
                        TextField("圖紙高（m）", value: $blueprintPlanHeightMeters, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.decimalPad)
                    }

                    Button("由上傳圖紙快速生成放樣點") {
                        sessionManager.generateQuickStakingPointsFromBlueprint(
                            planWidthMeters: blueprintPlanWidthMeters,
                            planHeightMeters: blueprintPlanHeightMeters
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .frame(maxWidth: .infinity)

                    Text(sessionManager.blueprintQuickStakeStatusText)
                        .font(.caption2)
                        .foregroundStyle(.teal)

                    Button(ifc3DButtonTitle) {
                        handleIFCSimulationToggle()
                    }
                    .prominentActionStyle(sessionManager.ifcSimulationEnabled ? .orange : .blue)

                    Text(sessionManager.ifcSimulationStatusText)
                        .font(.caption2)
                        .foregroundStyle(.blue)

                    Button("執行固定回歸檢查") {
                        sessionManager.runLocalRegressionChecklist()
                    }
                    .borderedActionStyle(.mint)

                    captionStatus(sessionManager.regressionChecklistStatusText, color: .mint)

                    if !sessionManager.regressionChecklistLines.isEmpty {
                        ForEach(Array(sessionManager.regressionChecklistLines.enumerated()), id: \.offset) { _, line in
                            captionStatus(line, color: .secondary)
                        }
                    }

                    Button(facadeHologramButtonTitle) {
                        sessionManager.toggleFacadeHologramFromBlueprint()
                    }
                    .prominentActionStyle(sessionManager.facadeHologramEnabled ? .orange : .indigo)

                    Button("套用現場穩定模式（全息）") {
                        sessionManager.applyOnSiteStableHologramPreset()
                    }
                    .borderedActionStyle(.green)

                    Toggle("生命感模式（動態光影）", isOn: Binding(
                        get: { sessionManager.facadeLifeModeEnabled },
                        set: { sessionManager.setFacadeLifeModeEnabled($0) }
                    ))
                        .tint(.mint)

                    Toggle("室內穿行模式（走近看隔間）", isOn: Binding(
                        get: { sessionManager.interiorWalkthroughEnabled },
                        set: { sessionManager.setInteriorWalkthroughEnabled($0) }
                    ))
                        .tint(.cyan)

                    Toggle("沉浸穿行模式（類真實錄影感）", isOn: Binding(
                        get: { sessionManager.cinematicWalkthroughEnabled },
                        set: { sessionManager.setCinematicWalkthroughEnabled($0) }
                    ))
                        .tint(.purple)

                    Toggle("自動升降級（穩定10秒自動升展示）", isOn: Binding(
                        get: { sessionManager.adaptiveRenderModeEnabled },
                        set: { sessionManager.setAdaptiveRenderModeEnabled($0) }
                    ))
                        .tint(.orange)

                    Button("一鍵套用沉浸穿行預設") {
                        sessionManager.applyImmersiveWalkthroughPreset()
                    }
                    .buttonStyle(.bordered)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)

                    Picker("全息渲染模式", selection: Binding(
                        get: { sessionManager.hologramRenderMode },
                        set: { sessionManager.setHologramRenderMode($0) }
                    )) {
                        ForEach(HologramRenderMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    captionStatus(sessionManager.facadeLifeModeStatusText, color: .mint)
                    captionStatus(sessionManager.interiorWalkthroughStatusText, color: .cyan)
                    captionStatus(sessionManager.cinematicWalkthroughStatusText, color: .purple)
                    captionStatus(sessionManager.adaptiveRenderStatusText, color: .orange)

                    if sessionManager.facadeHologramEnabled {
                        Picker("重建策略", selection: Binding(
                            get: { sessionManager.facadeRebuildMode },
                            set: { sessionManager.setFacadeRebuildMode($0) }
                        )) {
                            ForEach(FacadeRebuildMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)

                        Button("一鍵重建立面全息（保留姿態）") {
                            sessionManager.rebuildFacadeHologramPreservingPose()
                        }
                        .buttonStyle(.bordered)
                        .tint(.teal)
                        .frame(maxWidth: .infinity)
                        .disabled(!sessionManager.facadeRebuildReady)

                        if sessionManager.facadeSnapshotAvailable {
                            Button("回復上次重建前快照") {
                                sessionManager.restoreFacadeHologramSnapshot()
                            }
                            .buttonStyle(.bordered)
                            .tint(.orange)
                            .frame(maxWidth: .infinity)
                            .disabled(!sessionManager.facadeRebuildReady)
                        }

                        Text(sessionManager.facadeRebuildGuardText)
                            .font(.caption2)
                            .foregroundStyle(sessionManager.facadeRebuildReady ? .green : .orange)

                        Button("重置立面姿態（回到前方）") {
                            sessionManager.resetFacadeHologramTransform()
                        }
                        .buttonStyle(.bordered)
                        .tint(.indigo)
                        .frame(maxWidth: .infinity)
                    }

                    Text(sessionManager.facadeHologramStatusText)
                        .font(.caption2)
                        .foregroundStyle(.indigo)

                    if sessionManager.facadeRealismOverallScore > 0 {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("IMAX 真實感：\(sessionManager.facadeRealismOverallScore)/100")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.cyan)
                            Text(sessionManager.facadeRealismTierText)
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.92))
                            ForEach(Array(sessionManager.facadeRealismBreakdownLines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.caption2)
                                    .foregroundStyle(.white.opacity(0.82))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(8)
                        .background(.cyan.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    if !sessionManager.facadeQualityReportLines.isEmpty {
                        ScrollView(.vertical, showsIndicators: true) {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(sessionManager.facadeQualityReportLines.enumerated()), id: \.offset) { _, line in
                                    Text(line)
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.9))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(maxHeight: 120)
                        .padding(8)
                        .background(.black.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    Button("IBM 排程本地模擬") {
                        sessionManager.runLocalIBMScheduleSimulation()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.gray)
                    .frame(maxWidth: .infinity)

                    Button("送到 IBM Cloud 排程") {
                        Task {
                            await sessionManager.runIBMCloudScheduleSimulation()
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(.indigo)
                    .frame(maxWidth: .infinity)

                    Text(sessionManager.ibmScheduleStatusText)
                        .font(.caption2)
                        .foregroundStyle(.gray)

                    if !sessionManager.ibmSchedulePreviewLines.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(sessionManager.ibmSchedulePreviewLines.prefix(8).enumerated()), id: \.offset) { _, line in
                                    Text(line)
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.88))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(maxHeight: 110)
                        .padding(8)
                        .background(.black.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    HStack(spacing: 10) {
                        Button(monkeyHasPassword ? "🔐 密碼解鎖猴子" : "🔐 設定猴子密碼") {
                            openMonkeyAccessSheet(setup: !monkeyHasPassword)
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                        if monkeyHasPassword {
                            Button("🔒 立即上鎖") {
                                lockMonkeyAccess()
                            }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)

                            Button("🧹 清除猴子密碼") {
                                clearMonkeyPassword()
                            }
                            .buttonStyle(.bordered)
                            .tint(.red)
                            .frame(maxWidth: .infinity)
                        }
                    }

                    Text(
                        monkeyHasPassword
                            ? (isMonkeyUnlocked ? "猴子權限：已解鎖（僅本次前景有效）" : "猴子權限：已上鎖（需密碼）")
                            : "猴子權限：尚未設定密碼"
                    )
                    .font(.caption2)
                    .foregroundStyle(isMonkeyUnlocked ? .mint : .secondary)

                    Picker("猴子強度", selection: $monkeyStressLevel) {
                        ForEach(MonkeyStressLevel.allCases) { level in
                            Text(level.title).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)

                    Button(safetyMonkeyEnabled ? "🐒 安全猴子：停止" : "🐒 安全猴子：啟動") {
                        toggleSafetyMonkey()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(safetyMonkeyEnabled ? .red : .yellow)
                    .frame(maxWidth: .infinity)
                    .disabled(!isMonkeyUnlocked)

                    captionStatus(
                        "猴子狀態：\(safetyMonkeyEnabled ? "運行中" : "關")｜強度：\(monkeyStressLevel.title)｜動作次數：\(safetyMonkeyTickCount)",
                        color: safetyMonkeyEnabled ? .yellow : .secondary
                    )
                    captionStatus("最近動作：\(safetyMonkeyLastAction)", color: .secondary)

                    HStack(spacing: 10) {
                        Button("📋 生成猴子測試報告") {
                            buildMonkeyTestReport(showSheet: true)
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                        Button("清除猴子報告") {
                            monkeyReportLines = []
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    }

                    if !monkeyReportLines.isEmpty {
                        ScrollView(.vertical, showsIndicators: true) {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(monkeyReportLines.enumerated()), id: \.offset) { _, line in
                                    Text(line)
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.9))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(maxHeight: 130)
                        .padding(8)
                        .background(.black.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    Button("✅ 測試打勾表") {
                        presentModalSheetSafely(.testChecklist)
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button("🏗️ 工地部署檢查清單") {
                        presentModalSheetSafely(.siteDeploymentChecklist)
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button("🧪 測試歸零（全項重測）") {
                        resetAllForRetest(clearChecks: true)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(maxWidth: .infinity)

                    HStack(spacing: 10) {
                        Button("截圖存相簿") {
                            sessionManager.capturePhotoToLibrary()
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                        Button("量測紀錄") {
                            presentModalSheetSafely(.records)
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    }

                    Button("AI 矯正比對歷史") {
                        presentCorrectionHistorySafely()
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button("3D 體積掃描儀") {
                        presentModalSheetSafely(.volumeScan)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .frame(maxWidth: .infinity)

                    Button("AI 裂縫抓漏") {
                        presentModalSheetSafely(.crackInspector)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .frame(maxWidth: .infinity)

                    Button(sessionManager.quantumModeEnabled ? "核心引擎（運行中）" : "核心引擎戰術模式") {
                        presentModalSheetSafely(.quantumMode)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .frame(maxWidth: .infinity)
                                }
                            }
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 280)
            .scrollDismissesKeyboard(.immediately)
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

    private var measureControlSection: some View {
        Group {
            Toggle("量測時自動釋放畫面", isOn: $autoClearViewDuringMeasure)
                .font(.footnote.bold())
                .tint(.cyan)

            VStack(alignment: .leading, spacing: 6) {
                Text(String(format: "設計距離：%.2f m", draftDesignTargetDistanceMeters))
                Slider(value: $draftDesignTargetDistanceMeters, in: 0.2...20, step: 0.05)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(String(format: "偏差容差：±%.1f cm", draftDeviationToleranceCm))
                Slider(value: $draftDeviationToleranceCm, in: 0.5...20, step: 0.5)
            }

            Toggle(isOn: $draftHighPrecisionContinuousModeEnabled) {
                Text("高精度連續模式（記錄前 3 次取中位數）")
                    .font(.footnote.bold())
            }
            .tint(.green)

            Toggle(isOn: $draftHighestModeLockEnabled) {
                Text("最高等級鎖定（固定超嚴格）")
                    .font(.footnote.bold())
            }
            .tint(.yellow)

            Picker("QA 模式", selection: $draftQAProfile) {
                ForEach(QATuningProfile.allCases) { mode in
                    Text(mode.displayName).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .tint(.blue)
            .disabled(draftHighestModeLockEnabled)

            Button("套用量測設定") {
                applyMeasureDraftToSession()
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)

            Button("記錄量測") {
                applyMeasureDraftToSession()
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
                presentModalSheetSafely(.rebarConfig)
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            syncMeasureDraftFromManager(force: false)
        }
    }

    private var landscapeCombatOverlay: some View {
        HStack {
            VStack(alignment: .leading, spacing: 5) {
                Text("距離: \(sessionManager.distanceText)")
                    .font(.title2.bold())
                    .foregroundStyle(.green)
                Text("穩定度: \(sessionManager.qaScore)分")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.95))
                Text("Pitch: \(sessionManager.pitchText) | Roll: \(sessionManager.rollText)")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.85))
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(width: 220, alignment: .topLeading)
            .background(.black.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            Spacer()

            VStack {
                Spacer()
                Button {
                    performRecordMeasurement()
                } label: {
                    ZStack {
                        Circle()
                            .fill(.black.opacity(0.3))
                            .frame(width: 94, height: 94)
                        Circle()
                            .stroke(.green, lineWidth: 4)
                            .frame(width: 88, height: 88)
                        Circle()
                            .fill(
                                canRecordMeasurement
                                    ? LinearGradient(colors: [.green.opacity(0.95), .mint.opacity(0.85)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [.gray.opacity(0.55), .gray.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing)
                            )
                            .frame(width: 74, height: 74)
                        Image(systemName: "camera.metering.center.weighted")
                            .font(.title)
                            .foregroundStyle(.white)
                    }
                }
                .disabled(!canRecordMeasurement)
                Spacer()
            }
            .padding(.trailing, 40)
        }
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
                    .frame(width: 58, height: 112, alignment: .trailing)
                    .contentShape(Rectangle())
            }

            VStack(spacing: 14) {
                Text("作戰選單")
                    .font(.headline)
                    .foregroundStyle(.mint)

                ScrollView(.vertical, showsIndicators: true) {
                    VStack(spacing: 12) {
                        Button {
                            performRecordMeasurement()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel("📸 記錄量測", color: .green)
                        }
                        .disabled(!canRecordMeasurement)

                        Button {
                            sessionManager.applyAIQACorrection()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel("🤖 一鍵矯正", color: .blue)
                        }

                        Button {
                            presentAIAssistantSafely()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel("✨ AI 建議", color: .purple)
                        }

                        Button {
                            selectedMainPage = .page2
                            selectedControlPage = .tools
                            sessionManager.setMeshVisualizationEnabled(!sessionManager.meshVisualizationEnabled)
                        } label: {
                            tacticalActionLabel(
                                sessionManager.meshVisualizationEnabled ? "🕸️ 關閉網狀" : "🕸️ 開啟網狀",
                                color: .orange
                            )
                        }

                        Button {
                            selectedMainPage = .page2
                            selectedControlPage = .tools
                            handleIFCSimulationToggle()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel(
                                "🧱 \(ifc3DButtonTitle)",
                                color: .teal
                            )
                        }

                        Button {
                            selectedMainPage = .page2
                            selectedControlPage = .tools
                            sessionManager.toggleFacadeHologramFromBlueprint()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel(
                                "🏢 \(facadeHologramButtonTitle)",
                                color: .indigo
                            )
                        }

                        Button {
                            selectedMainPage = .page2
                            selectedControlPage = .tools
                            if sessionManager.twdStakingPoints.isEmpty {
                                if sessionManager.ifcModelElementCount > 0 {
                                    sessionManager.generateTWDStakingPointsFromIFC()
                                } else {
                                    sessionManager.generateQuickStakingPointsFromBlueprint(
                                        planWidthMeters: blueprintPlanWidthMeters,
                                        planHeightMeters: blueprintPlanHeightMeters
                                    )
                                }
                            }
                            sessionManager.toggleTWDStakingPreviewInAR()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isTacticalMenuOpen = false
                            }
                        } label: {
                            tacticalActionLabel(
                                sessionManager.twdStakingPreviewEnabled ? "📍 隱藏放樣點" : "📍 顯示放樣點",
                                color: .orange
                            )
                        }
                    }
                    .padding(.bottom, 4)
                }
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
            DragGesture(minimumDistance: 6)
                .onChanged { value in
                    let horizontalDistance = abs(value.translation.width)
                    let verticalDistance = abs(value.translation.height)
                    if tacticalMenuDragAxis == nil, horizontalDistance > 4 || verticalDistance > 4 {
                        tacticalMenuDragAxis = horizontalDistance > (verticalDistance * 1.15) ? .horizontal : .vertical
                    }
                    guard tacticalMenuDragAxis == .horizontal else { return }
                    if isTacticalMenuOpen {
                        tacticalMenuDragOffset = max(0, value.translation.width)
                    } else {
                        tacticalMenuDragOffset = min(0, value.translation.width)
                    }
                }
                .onEnded { value in
                    defer {
                        tacticalMenuDragAxis = nil
                    }
                    guard tacticalMenuDragAxis == .horizontal else {
                        tacticalMenuDragOffset = 0
                        return
                    }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        if isTacticalMenuOpen, value.translation.width > touchOpenCloseThreshold {
                            isTacticalMenuOpen = false
                        } else if !isTacticalMenuOpen, value.translation.width < -touchOpenCloseThreshold {
                            isTacticalMenuOpen = true
                        }
                        tacticalMenuDragOffset = 0
                    }
                }
        )
    }

    private func trailingInset(for size: CGSize) -> CGFloat {
        if isClearViewMode { return 10 }
        let isLandscape = size.width > size.height
        if !isLandscape { return 10 }
        return isTacticalMenuOpen ? tacticalMenuWidth + 12 : 44
    }

    private func setClearViewMode(_ enabled: Bool) {
        withAnimation(.easeInOut(duration: 0.2)) {
            isClearViewMode = enabled
            if enabled {
                isTacticalMenuOpen = false
                tacticalMenuDragOffset = 0
                isTopPanelExpanded = false
            }
        }
    }

    private func tacticalActionLabel(_ title: String, color: Color) -> some View {
        Text(title)
            .font(.headline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .padding(.vertical, 12)
            .background(
                LinearGradient(
                    colors: [color.opacity(0.95), color.opacity(0.72)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(.white.opacity(0.75), lineWidth: 1.2)
            )
            .shadow(color: color.opacity(0.28), radius: 6, x: 0, y: 3)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var blueprintScanLightOverlay: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 0.03, paused: !isViewActive)) { context in
                let cycle = 2.6
                let progress = context.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: cycle) / cycle
                let y = geo.size.height * progress

                ZStack {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .purple.opacity(0.4), .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: 28)
                        .blur(radius: 1.4)
                        .offset(y: y - 14)

                    Rectangle()
                        .fill(.purple.opacity(0.32))
                        .frame(height: 1.2)
                        .offset(y: y - 0.6)
                }
                .blendMode(.screen)
                .allowsHitTesting(false)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .allowsHitTesting(false)
    }

    private func syncAutoClearViewMode(for page: ControlPage) {
        if autoClearViewDuringMeasure {
            if page == .measure {
                if !isClearViewMode {
                    clearViewAutoApplied = true
                    setClearViewMode(true)
                }
            } else if clearViewAutoApplied {
                clearViewAutoApplied = false
                setClearViewMode(false)
            }
        } else if clearViewAutoApplied {
            clearViewAutoApplied = false
            setClearViewMode(false)
        }
    }

    @discardableResult
    private func performRecordMeasurement() -> Bool {
        guard let distance = sessionManager.prepareDistanceForRecording() else { return false }
        measurementStore.add(
            distance: distance,
            pitch: sessionManager.latestPitchDegrees,
            roll: sessionManager.latestRollDegrees,
            qaLevel: sessionManager.qaLevel,
            qaProfile: sessionManager.qaProfile,
            qaScore: sessionManager.qaScore
        )
        return true
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
                        presentModalSheetSafely(.share)
                    }
                }
            }
        }
    }

    private var testChecklistView: some View {
        NavigationStack {
            Form {
                Section("iOS 手機測試打勾") {
                    ForEach(TestChecklistItem.allCases) { item in
                        Toggle(item.title, isOn: Binding(
                            get: { completedTestItems.contains(item) },
                            set: { isOn in
                                if isOn {
                                    completedTestItems.insert(item)
                                } else {
                                    completedTestItems.remove(item)
                                }
                            }
                        ))
                    }
                }

                Section("進度") {
                    Text("完成 \(completedTestItems.count) / \(TestChecklistItem.allCases.count)")
                        .font(.headline)
                    if completedTestItems.count == TestChecklistItem.allCases.count {
                        Text("✅ 全部測試項目已完成")
                            .font(.caption.bold())
                            .foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("測試打勾表")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("歸零重測") {
                        resetAllForRetest(clearChecks: true)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("關閉") {
                        activeSheet = nil
                    }
                }
            }
        }
    }

    private var siteDeploymentChecklistView: some View {
        NavigationStack {
            Form {
                Section("圖紙與標記品質") {
                    ForEach(SiteChecklistItem.markerGroupItems) { item in
                        Toggle(item.title, isOn: Binding(
                            get: { completedSiteChecklistItems.contains(item) },
                            set: { isOn in
                                if isOn {
                                    completedSiteChecklistItems.insert(item)
                                } else {
                                    completedSiteChecklistItems.remove(item)
                                }
                            }
                        ))
                    }
                }

                Section("現場環境") {
                    ForEach(SiteChecklistItem.environmentGroupItems) { item in
                        Toggle(item.title, isOn: Binding(
                            get: { completedSiteChecklistItems.contains(item) },
                            set: { isOn in
                                if isOn {
                                    completedSiteChecklistItems.insert(item)
                                } else {
                                    completedSiteChecklistItems.remove(item)
                                }
                            }
                        ))
                    }
                }

                Section("模型與操作空間") {
                    ForEach(SiteChecklistItem.performanceGroupItems) { item in
                        Toggle(item.title, isOn: Binding(
                            get: { completedSiteChecklistItems.contains(item) },
                            set: { isOn in
                                if isOn {
                                    completedSiteChecklistItems.insert(item)
                                } else {
                                    completedSiteChecklistItems.remove(item)
                                }
                            }
                        ))
                    }
                }

                Section("部署狀態") {
                    Text("完成 \(completedSiteChecklistItems.count) / \(SiteChecklistItem.allCases.count)")
                        .font(.headline)
                    Text(siteReadinessSummaryText)
                        .font(.footnote.bold())
                        .foregroundStyle(siteReadinessColor)
                    Text(siteReadinessHintText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("工地部署檢查")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("全部清空") {
                        completedSiteChecklistItems.removeAll()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("關閉") {
                        activeSheet = nil
                    }
                }
            }
        }
    }

    private var siteReadinessSummaryText: String {
        let doneCount = completedSiteChecklistItems.count
        switch doneCount {
        case SiteChecklistItem.allCases.count:
            return "現場可進行全息展示（低風險）"
        case 6...8:
            return "可展示但建議先補齊風險項目"
        default:
            return "不建議直接展示，先完成關鍵檢查"
        }
    }

    private var siteReadinessHintText: String {
        if completedSiteChecklistItems.count == SiteChecklistItem.allCases.count {
            return "建議先用 1 分鐘試投影確認追蹤穩定，再正式展示。"
        }
        if completedSiteChecklistItems.contains(.avoidDirectSunlight) == false {
            return "目前最關鍵缺項：請避開正午直射日光。"
        }
        if completedSiteChecklistItems.contains(.markerPhysicalWidthVerified) == false {
            return "目前最關鍵缺項：請再次核對實體圖紙寬度。"
        }
        if completedSiteChecklistItems.contains(.modelLodOptimized) == false {
            return "目前最關鍵缺項：請先切換簡化模型或降低細節。"
        }
        return "建議補齊剩餘檢查項，降低漂移與過熱機率。"
    }

    private var siteReadinessColor: Color {
        let doneCount = completedSiteChecklistItems.count
        if doneCount == SiteChecklistItem.allCases.count { return .green }
        if doneCount >= 6 { return .orange }
        return .red
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
                ToolbarItem(placement: .topBarLeading) {
                    Button("縮小視窗") {
                        assistantSheetDetent = .fraction(0.32)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("關閉") {
                        activeSheet = nil
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
                ToolbarItem(placement: .topBarLeading) {
                    Button("縮小視窗") {
                        rebarSheetDetent = .fraction(0.32)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        activeSheet = nil
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

                    volumeScanPreviewView
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
                ToolbarItem(placement: .topBarLeading) {
                    Button("縮小視窗") {
                        volumeSheetDetent = .fraction(0.28)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        activeSheet = nil
                    }
                }
            }
        }
    }

    private var volumeScanPreviewView: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.black.opacity(0.72))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                )

            if sessionManager.volumeScanPreviewPoints.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "scope")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.9))
                    Text("掃描區域預覽：以準星為中心的方形網格")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                    Text("按一次掃描後，會顯示實際取樣點位")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                }
                .padding(.horizontal, 10)
            } else {
                GeometryReader { geo in
                    ZStack {
                        // Center crosshair of sampling region
                        Rectangle()
                            .fill(.white.opacity(0.35))
                            .frame(width: 1.5, height: 68)
                            .position(x: geo.size.width / 2, y: geo.size.height / 2)
                        Rectangle()
                            .fill(.white.opacity(0.35))
                            .frame(width: 68, height: 1.5)
                            .position(x: geo.size.width / 2, y: geo.size.height / 2)

                        ForEach(Array(sessionManager.volumeScanPreviewPoints.enumerated()), id: \.offset) { _, p in
                            Circle()
                                .fill(.mint)
                                .frame(width: 6, height: 6)
                                .position(
                                    x: max(6, min(geo.size.width - 6, CGFloat(p.x) * geo.size.width)),
                                    y: max(6, min(geo.size.height - 6, CGFloat(p.y) * geo.size.height))
                                )
                        }
                    }
                }
            }
        }
        .frame(height: 140)
    }

    private var crackInspectorView: some View {
        NavigationStack {
            Form {
                Section("影像來源（鏡頭即時）") {
                    Text("系統將直接使用 AR 鏡頭畫面做裂縫 AI 偵測")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("更新鏡頭預覽") {
                        sessionManager.refreshCrackPreviewFromCurrentFrame()
                    }
                    .buttonStyle(.bordered)
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

                Section("裂縫畫面預覽") {
                    if let image = sessionManager.crackInputImage {
                        crackOverlayPreview(image: image, findings: sessionManager.crackFindings)
                            .frame(maxWidth: .infinity)
                    } else {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(.black.opacity(0.75))
                            .frame(height: 220)
                            .overlay(
                                VStack(spacing: 8) {
                                    Image(systemName: "camera.viewfinder")
                                        .font(.title2)
                                        .foregroundStyle(.white.opacity(0.9))
                                    Text("尚未取得鏡頭預覽")
                                        .font(.footnote.bold())
                                        .foregroundStyle(.white.opacity(0.9))
                                    Text("點「更新鏡頭預覽」或直接執行裂縫分析")
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.75))
                                }
                            )
                    }
                }

                if !sessionManager.crackFindings.isEmpty {
                    Section("漏點定位清單") {
                        ForEach(Array(sessionManager.crackFindings.enumerated()), id: \.offset) { index, finding in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("#\(index + 1) \(crackZoneText(for: finding.box))")
                                    .font(.footnote.bold())
                                    .foregroundStyle(.white)
                                Text(
                                    String(
                                        format: "座標 %.0f%%, %.0f%%｜長度 %.1f cm｜嚴重度 %@",
                                        finding.box.midX * 100,
                                        (1 - finding.box.midY) * 100,
                                        finding.lengthCm,
                                        finding.severity
                                    )
                                )
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
            .navigationTitle("AI 裂縫抓漏")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("縮小視窗") {
                        crackSheetDetent = .fraction(0.32)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        activeSheet = nil
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

                ForEach(Array(findings.enumerated()), id: \.offset) { index, finding in
                    let rect = rectForNormalizedBox(finding.box, in: fitted)
                    let safeRectWidth = rect.width.isFinite ? max(1, rect.width) : 1
                    let safeRectHeight = rect.height.isFinite ? max(1, rect.height) : 1
                    let safeRectMidX = rect.midX.isFinite ? rect.midX : (geo.size.width / 2)
                    let safeRectMidY = rect.midY.isFinite ? rect.midY : (geo.size.height / 2)
                    let safeRectMinY = rect.minY.isFinite ? rect.minY : 24
                    let safeLabelX = max(54, min(safeRectMidX, max(54, geo.size.width - 54)))
                    let safeLabelY = max(12, safeRectMinY - 12)
                    let labelColor: Color =
                        finding.severity == "高" ? .red : (finding.severity == "中" ? .orange : .yellow)
                    Rectangle()
                        .stroke(labelColor, lineWidth: 2)
                        .frame(width: safeRectWidth, height: safeRectHeight)
                        .position(x: safeRectMidX, y: safeRectMidY)

                    Text("#\(index + 1) \(crackZoneText(for: finding.box))")
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.72))
                        .foregroundStyle(labelColor)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .position(
                            x: safeLabelX,
                            y: safeLabelY
                        )
                }
            }
        }
        .frame(height: 260)
    }

    private func crackZoneText(for box: CGRect) -> String {
        let h: String
        if box.midX < 0.33 {
            h = "左"
        } else if box.midX > 0.67 {
            h = "右"
        } else {
            h = "中"
        }

        let v: String
        if box.midY < 0.33 {
            v = "下"
        } else if box.midY > 0.67 {
            v = "上"
        } else {
            v = "中"
        }
        return "\(v)\(h)"
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
                ToolbarItem(placement: .topBarLeading) {
                    Button("縮小視窗") {
                        quantumSheetDetent = .fraction(0.32)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        activeSheet = nil
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

    private func resetAllForRetest(clearChecks: Bool) {
        measurementStore.clearAll()
        sessionManager.resetForTesting()
        activeSheet = nil
        selectedMainPage = .page1
        selectedStatusPage = .measure
        selectedControlPage = .measure
        clearViewAutoApplied = false
        setClearViewMode(false)
        if clearChecks {
            completedTestItems.removeAll()
            completedSiteChecklistItems.removeAll()
        }
    }

    private enum TestChecklistItem: String, CaseIterable, Identifiable {
        case clearViewToggle
        case bottomRightButton
        case volumeFirstPress
        case volumePreviewPoints
        case crackPreview
        case crackOverlayLabel
        case crackLocationList
        case compactSheets

        var id: String { rawValue }

        var title: String {
            switch self {
            case .clearViewToggle:
                return "釋放畫面 / 顯示功能 可切換"
            case .bottomRightButton:
                return "右下按鈕可按，不會無反應"
            case .volumeFirstPress:
                return "3D 體積掃描首次按就更新"
            case .volumePreviewPoints:
                return "掃描區域預覽有點位顯示"
            case .crackPreview:
                return "AI 抓漏有預覽畫面"
            case .crackOverlayLabel:
                return "AI 抓漏有 #編號 與區位標籤"
            case .crackLocationList:
                return "漏點定位清單有座標/長度/嚴重度"
            case .compactSheets:
                return "各工具視窗可縮小，不擋主畫面"
            }
        }
    }

    private enum SiteChecklistItem: String, CaseIterable, Identifiable {
        case markerIsMatte
        case markerHasDistinctCorners
        case markerPhysicalWidthVerified
        case avoidDirectSunlight
        case lidarPathIsClean
        case dryNoRainOrDustBurst
        case modelLodOptimized
        case frontClearanceChecked
        case quickPilotRunPassed

        var id: String { rawValue }

        static var markerGroupItems: [SiteChecklistItem] {
            [.markerIsMatte, .markerHasDistinctCorners, .markerPhysicalWidthVerified]
        }

        static var environmentGroupItems: [SiteChecklistItem] {
            [.avoidDirectSunlight, .lidarPathIsClean, .dryNoRainOrDustBurst]
        }

        static var performanceGroupItems: [SiteChecklistItem] {
            [.modelLodOptimized, .frontClearanceChecked, .quickPilotRunPassed]
        }

        var title: String {
            switch self {
            case .markerIsMatte:
                return "圖紙使用消光材質（無護貝反光）"
            case .markerHasDistinctCorners:
                return "四角具高對比、不重複特徵（Logo/標記）"
            case .markerPhysicalWidthVerified:
                return "physicalWidth 已與實體寬度逐一核對"
            case .avoidDirectSunlight:
                return "展示位置已避開正午直射陽光"
            case .lidarPathIsClean:
                return "LiDAR 前方無強反光/玻璃干擾"
            case .dryNoRainOrDustBurst:
                return "現場無雨滴與大量粉塵干擾"
            case .modelLodOptimized:
                return "已使用簡化模型（減面/LOD）"
            case .frontClearanceChecked:
                return "立面前方淨空足夠，避免虛實重疊遮擋"
            case .quickPilotRunPassed:
                return "已完成 1 分鐘試投影且追蹤穩定"
            }
        }
    }

    private enum MonkeyLockMode {
        case setup
        case unlock
    }

    private var monkeyAccessSheetView: some View {
        NavigationStack {
            Form {
                if monkeyLockMode == .setup {
                    Section("設定安全猴子密碼") {
                        SecureField("輸入新密碼（至少 4 碼）", text: $monkeyPasswordInput)
                        SecureField("再次輸入密碼", text: $monkeyPasswordConfirmInput)
                    }
                } else {
                    Section("輸入密碼解鎖安全猴子") {
                        SecureField("請輸入密碼", text: $monkeyPasswordInput)
                    }
                }

                if !monkeyPasswordError.isEmpty {
                    Section {
                        Text(monkeyPasswordError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(monkeyLockMode == .setup ? "設定猴子密碼" : "猴子密碼解鎖")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") {
                        activeSheet = nil
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(monkeyLockMode == .setup ? "儲存" : "解鎖") {
                        submitMonkeyAccess()
                    }
                }
            }
        }
    }

    private var monkeyReportSheetView: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 10) {
                if monkeyReportLines.isEmpty {
                    Text("目前尚無猴子測試報告")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ScrollView(.vertical, showsIndicators: true) {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(monkeyReportLines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.92))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(10)
                    .background(.black.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(14)
            .navigationTitle("猴子測試報告")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("關閉") {
                        activeSheet = nil
                    }
                }
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

    private enum MonkeyStressLevel: String, CaseIterable, Identifiable {
        case stable
        case balanced
        case aggressive
        case brutal

        var id: String { rawValue }

        var title: String {
            switch self {
            case .stable: return "穩定"
            case .balanced: return "平衡"
            case .aggressive: return "高壓"
            case .brutal: return "暴力"
            }
        }

        var tickNanos: UInt64 {
            switch self {
            case .stable: return 4_600_000_000
            case .balanced: return 3_200_000_000
            case .aggressive: return 1_900_000_000
            case .brutal: return 700_000_000
            }
        }

        var burstCount: Int {
            switch self {
            case .stable: return 1
            case .balanced: return 1
            case .aggressive: return 2
            case .brutal: return 4
            }
        }
    }

    private func toggleSafetyMonkey() {
        safetyMonkeyEnabled ? stopSafetyMonkey() : startSafetyMonkey()
    }

    private func startSafetyMonkey() {
        guard !safetyMonkeyEnabled else { return }
        guard monkeyHasPassword, isMonkeyUnlocked else {
            monkeyPasswordError = "請先輸入密碼解鎖"
            openMonkeyAccessSheet(setup: !monkeyHasPassword)
            return
        }
        safetyMonkeyEnabled = true
        safetyMonkeyTickCount = 0
        safetyMonkeyLastAction = "已啟動"
        monkeySessionStartedAt = Date()
        monkeyLastStoppedAt = nil
        monkeyActionHistory = []
        appendMonkeyAction("已啟動")
        safetyMonkeyTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: monkeyStressLevel.tickNanos)
                if Task.isCancelled { break }
                await MainActor.run {
                    runSafetyMonkeyTick(sessionManager: sessionManager)
                }
            }
        }
    }

    private func refreshMonkeyAccessState() {
        monkeyHasPassword = !(UserDefaults.standard.string(forKey: monkeyPassHashStorageKey) ?? "").isEmpty
        if !monkeyHasPassword {
            isMonkeyUnlocked = true
        }
    }

    private func openMonkeyAccessSheet(setup: Bool) {
        monkeyLockMode = setup ? .setup : .unlock
        monkeyPasswordInput = ""
        monkeyPasswordConfirmInput = ""
        monkeyPasswordError = ""
        presentModalSheetSafely(.monkeyAccess)
    }

    private func lockMonkeyAccess() {
        stopSafetyMonkey()
        isMonkeyUnlocked = false
    }

    private func clearMonkeyPassword() {
        stopSafetyMonkey()
        UserDefaults.standard.removeObject(forKey: monkeyPassHashStorageKey)
        monkeyHasPassword = false
        isMonkeyUnlocked = true
        monkeyPasswordInput = ""
        monkeyPasswordConfirmInput = ""
        monkeyPasswordError = ""
        safetyMonkeyLastAction = "已清除猴子密碼（免密碼）"
    }

    private func submitMonkeyAccess() {
        switch monkeyLockMode {
        case .setup:
            let pass = monkeyPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines)
            let confirm = monkeyPasswordConfirmInput.trimmingCharacters(in: .whitespacesAndNewlines)
            guard pass.count >= 4 else {
                monkeyPasswordError = "密碼至少 4 碼"
                return
            }
            guard pass == confirm else {
                monkeyPasswordError = "兩次輸入的密碼不一致"
                return
            }
            UserDefaults.standard.set(sha256String(pass), forKey: monkeyPassHashStorageKey)
            monkeyHasPassword = true
            isMonkeyUnlocked = true
            monkeyPasswordError = ""
            activeSheet = nil
            safetyMonkeyLastAction = "密碼已設定並解鎖"
        case .unlock:
            let pass = monkeyPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines)
            let savedHash = UserDefaults.standard.string(forKey: monkeyPassHashStorageKey) ?? ""
            guard !savedHash.isEmpty else {
                monkeyPasswordError = "尚未設定密碼"
                return
            }
            if sha256String(pass) == savedHash {
                isMonkeyUnlocked = true
                monkeyPasswordError = ""
                activeSheet = nil
                safetyMonkeyLastAction = "密碼解鎖成功"
            } else {
                monkeyPasswordError = "密碼錯誤"
            }
        }
    }

    private func sha256String(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func handleBlueprintPhotoSelection() async {
        guard let selectedBlueprintPhotoItem else { return }
        do {
            if let data = try await selectedBlueprintPhotoItem.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                sessionManager.setBlueprintInputImage(image)
            } else {
                sessionManager.blueprintUploadStatusText = "圖紙上傳失敗：無法讀取影像"
            }
        } catch {
            sessionManager.blueprintUploadStatusText = "圖紙上傳失敗：\(error.localizedDescription)"
        }
    }

    private var supportedIFCImportTypes: [UTType] {
        var types: [UTType] = [.json, .plainText]
        if let ifcType = UTType(filenameExtension: "ifc") {
            types.append(ifcType)
        }
        return types
    }

    private var ifc3DButtonTitle: String {
        sessionManager.ifcSimulationEnabled ? "關閉IFC-3D" : "生成IFC-3D"
    }

    private var facadeHologramButtonTitle: String {
        sessionManager.facadeHologramEnabled ? "關閉立面全息" : "生成立面全息"
    }

    private func captionStatus(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(color)
    }

    private func handleIFCSimulationToggle() {
        if sessionManager.ifcSimulationEnabled {
            sessionManager.toggleIFCSimulationFromUploadedBlueprint()
            return
        }
        if sessionManager.ifcModelElementCount == 0 && sessionManager.blueprintInputImage == nil {
            showingIFCFileImporter = true
            return
        }
        sessionManager.toggleIFCSimulationFromUploadedBlueprint()
    }

    private func handleIFCImportResult(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            sessionManager.ifcModelSummaryText = "IFC 匯入失敗：\(error.localizedDescription)"
        case .success(let urls):
            guard let fileURL = urls.first else {
                sessionManager.ifcModelSummaryText = "IFC 匯入失敗：未選擇檔案"
                return
            }
            let needsSecurityScope = fileURL.startAccessingSecurityScopedResource()
            defer {
                if needsSecurityScope {
                    fileURL.stopAccessingSecurityScopedResource()
                }
            }
            do {
                let data = try Data(contentsOf: fileURL)
                sessionManager.importIFCModelData(data, fileName: fileURL.lastPathComponent)
            } catch {
                sessionManager.ifcModelSummaryText = "IFC 匯入失敗：\(error.localizedDescription)"
            }
        }
    }

    private func stopSafetyMonkey() {
        guard safetyMonkeyEnabled || safetyMonkeyTask != nil else { return }
        safetyMonkeyEnabled = false
        safetyMonkeyTask?.cancel()
        safetyMonkeyTask = nil
        safetyMonkeyLastAction = "已停止"
        appendMonkeyAction("已停止")
        monkeyLastStoppedAt = Date()
        buildMonkeyTestReport(showSheet: true)
    }

    private func runSafetyMonkeyTick(sessionManager: LiDARSessionManager?) {
        guard safetyMonkeyEnabled else { return }
        enum MonkeyAction {
            case switchMainPage
            case switchControlPage
            case toggleClearView
            case toggleTopPanel
            case openVolumeSheet
            case openCrackSheet
            case scanVolume
            case refreshCrackPreview
            case toggleFacadeHologram
            case switchRenderMode
            case toggleAdaptiveRender
            case toggleImmersiveWalkthrough
            case rebuildFacadeFromCurrentBlueprint
            case toggleIFCSimulation
            case shuffleIFCLayers
        }
        let baseActions: [MonkeyAction] = [
            .switchMainPage,
            .switchControlPage,
            .toggleClearView,
            .toggleTopPanel,
            .openVolumeSheet,
            .openCrackSheet,
            .scanVolume,
            .refreshCrackPreview
        ]
        let arActions: [MonkeyAction] = [
            .toggleFacadeHologram,
            .switchRenderMode,
            .toggleAdaptiveRender,
            .toggleImmersiveWalkthrough,
            .rebuildFacadeFromCurrentBlueprint
        ]
        let ifcActions: [MonkeyAction] = [
            .toggleIFCSimulation,
            .shuffleIFCLayers
        ]
        let rebuildPriorityActions: [MonkeyAction] = [
            .rebuildFacadeFromCurrentBlueprint,
            .rebuildFacadeFromCurrentBlueprint,
            .toggleIFCSimulation,
            .shuffleIFCLayers,
            .switchRenderMode,
            .toggleAdaptiveRender
        ]
        let actionPool: [MonkeyAction]
        switch monkeyStressLevel {
        case .stable:
            actionPool = baseActions
        case .balanced:
            actionPool = baseActions + Array(arActions.prefix(3)) + ifcActions
        case .aggressive:
            actionPool = baseActions + arActions + ifcActions + rebuildPriorityActions
        case .brutal:
            // Brutal mode prioritizes hologram/IFC rebuild paths.
            actionPool = baseActions + arActions + arActions + ifcActions + rebuildPriorityActions + rebuildPriorityActions
        }
        guard !actionPool.isEmpty else { return }
        var recentBatchActions: [String] = []
        for _ in 0..<monkeyStressLevel.burstCount {
            guard let action = actionPool.randomElement() else { continue }
            safetyMonkeyTickCount += 1

            switch action {
            case .switchMainPage:
                selectedMainPage = (selectedMainPage == .page1) ? .page2 : .page1
                safetyMonkeyLastAction = "切換主頁到 \(selectedMainPage.title)"
            case .switchControlPage:
                selectedControlPage = ControlPage.allCases.randomElement() ?? .measure
                safetyMonkeyLastAction = "切換功能頁到 \(selectedControlPage.title)"
            case .toggleClearView:
                clearViewAutoApplied = false
                setClearViewMode(!isClearViewMode)
                safetyMonkeyLastAction = isClearViewMode ? "開啟釋放畫面" : "關閉釋放畫面"
            case .toggleTopPanel:
                isTopPanelExpanded.toggle()
                safetyMonkeyLastAction = isTopPanelExpanded ? "展開上方面板" : "收合上方面板"
            case .openVolumeSheet:
                if activeSheet == .volumeScan {
                    activeSheet = nil
                } else {
                    presentModalSheetSafely(.volumeScan)
                    volumeSheetDetent = .fraction(0.28)
                }
                safetyMonkeyLastAction = activeSheet == .volumeScan ? "開啟體積掃描視窗" : "關閉體積掃描視窗"
            case .openCrackSheet:
                if activeSheet == .crackInspector {
                    activeSheet = nil
                } else {
                    presentModalSheetSafely(.crackInspector)
                    crackSheetDetent = .fraction(0.32)
                    sessionManager?.refreshCrackPreviewFromCurrentFrame()
                }
                safetyMonkeyLastAction = activeSheet == .crackInspector ? "開啟裂縫視窗" : "關閉裂縫視窗"
            case .scanVolume:
                sessionManager?.runVolumeScanOnce()
                safetyMonkeyLastAction = "觸發一次體積掃描"
            case .refreshCrackPreview:
                sessionManager?.refreshCrackPreviewFromCurrentFrame()
                safetyMonkeyLastAction = "更新裂縫鏡頭預覽"
            case .toggleFacadeHologram:
                guard sessionManager?.blueprintInputImage != nil else {
                    safetyMonkeyLastAction = "略過全息切換（尚未上傳藍圖）"
                    break
                }
                sessionManager?.toggleFacadeHologramFromBlueprint()
                safetyMonkeyLastAction = sessionManager?.facadeHologramEnabled == true ? "啟動全息立面" : "停止全息立面"
            case .switchRenderMode:
                guard let sessionManager else {
                    safetyMonkeyLastAction = "略過渲染切換（Session 不可用）"
                    break
                }
                let nextMode = sessionManager.hologramRenderMode == .performance ? HologramRenderMode.showcase : .performance
                sessionManager.setHologramRenderMode(nextMode)
                safetyMonkeyLastAction = "切換渲染模式到 \(nextMode.title)"
            case .toggleAdaptiveRender:
                guard let sessionManager else {
                    safetyMonkeyLastAction = "略過自動升降級（Session 不可用）"
                    break
                }
                let nextEnabled = !sessionManager.adaptiveRenderModeEnabled
                sessionManager.setAdaptiveRenderModeEnabled(nextEnabled)
                safetyMonkeyLastAction = nextEnabled ? "開啟自動升降級" : "關閉自動升降級"
            case .toggleImmersiveWalkthrough:
                guard let sessionManager else {
                    safetyMonkeyLastAction = "略過沉浸穿行（Session 不可用）"
                    break
                }
                let nextEnabled = !sessionManager.cinematicWalkthroughEnabled
                sessionManager.setCinematicWalkthroughEnabled(nextEnabled)
                safetyMonkeyLastAction = nextEnabled ? "開啟沉浸穿行" : "關閉沉浸穿行"
            case .rebuildFacadeFromCurrentBlueprint:
                guard sessionManager?.facadeHologramEnabled == true else {
                    safetyMonkeyLastAction = "略過重建（全息未啟動）"
                    break
                }
                sessionManager?.rebuildFacadeHologramPreservingPose()
                safetyMonkeyLastAction = "觸發全息重建（保留姿態）"
            case .toggleIFCSimulation:
                guard let sessionManager else {
                    safetyMonkeyLastAction = "略過 IFC 切換（Session 不可用）"
                    break
                }
                let canBootIFC = sessionManager.ifcModelElementCount > 0 || sessionManager.blueprintInputImage != nil
                guard sessionManager.ifcSimulationEnabled || canBootIFC else {
                    safetyMonkeyLastAction = "略過 IFC 切換（無可用 IFC/藍圖）"
                    break
                }
                sessionManager.toggleIFCSimulationFromUploadedBlueprint()
                safetyMonkeyLastAction = sessionManager.ifcSimulationEnabled ? "啟動 IFC-3D" : "關閉 IFC-3D"
            case .shuffleIFCLayers:
                guard let sessionManager else {
                    safetyMonkeyLastAction = "略過 IFC 圖層重建（Session 不可用）"
                    break
                }
                guard sessionManager.ifcSimulationEnabled else {
                    safetyMonkeyLastAction = "略過 IFC 圖層重建（IFC 未啟動）"
                    break
                }
                let walls = Bool.random()
                let rebars = Bool.random()
                let pipes = Bool.random()
                sessionManager.setIFCShowWalls(walls)
                sessionManager.setIFCShowRebars(rebars)
                sessionManager.setIFCShowPipes(pipes)
                safetyMonkeyLastAction = "IFC 圖層重建：牆\(walls ? "開" : "關")／筋\(rebars ? "開" : "關")／管\(pipes ? "開" : "關")"
            }
            recentBatchActions.append(safetyMonkeyLastAction)
            appendMonkeyAction(safetyMonkeyLastAction)
        }
        if monkeyStressLevel == .brutal, !recentBatchActions.isEmpty {
            let collapsed = recentBatchActions.prefix(2).joined(separator: "｜")
            safetyMonkeyLastAction = "暴力連擊：\(collapsed)"
        }
    }

    private func appendMonkeyAction(_ action: String) {
        let time = Date().formatted(date: .omitted, time: .standard)
        monkeyActionHistory.insert("[\(time)] \(action)", at: 0)
        if monkeyActionHistory.count > 24 {
            monkeyActionHistory.removeLast(monkeyActionHistory.count - 24)
        }
    }

    private func buildMonkeyTestReport(showSheet: Bool = false) {
        let now = Date()
        let startedAt = monkeySessionStartedAt ?? now
        let endedAt = monkeyLastStoppedAt ?? now
        let duration = max(0, endedAt.timeIntervalSince(startedAt))
        let actionsPerMinute = duration > 0 ? (Double(safetyMonkeyTickCount) / duration) * 60.0 : 0
        let verdict: String
        let verdictReason: String
        if duration >= 420, safetyMonkeyTickCount >= 120 {
            verdict = "Pass"
            verdictReason = "長時穩定且動作覆蓋達標"
        } else if duration >= 240, safetyMonkeyTickCount >= 70 {
            verdict = "Warning"
            verdictReason = "基本可用，建議再做長時壓測"
        } else {
            verdict = "Fail"
            verdictReason = "壓測覆蓋不足，需補測"
        }
        var lines: [String] = []
        lines.append("猴子測試報告")
        lines.append("驗收結論：\(verdict)（\(verdictReason)）")
        lines.append("驗收門檻：Pass≥420秒且≥120動作；Warning≥240秒且≥70動作")
        lines.append("測試強度：\(monkeyStressLevel.title)（間隔約 \(String(format: "%.1f", Double(monkeyStressLevel.tickNanos) / 1_000_000_000)) 秒，連擊 \(monkeyStressLevel.burstCount) 次/tick）")
        lines.append("開始：\(startedAt.formatted(date: .abbreviated, time: .standard))")
        lines.append("結束：\(endedAt.formatted(date: .abbreviated, time: .standard))")
        lines.append(String(format: "運行時長：%.1f 秒", duration))
        lines.append("動作次數：\(safetyMonkeyTickCount)")
        lines.append(String(format: "平均頻率：%.1f 次/分鐘", actionsPerMinute))
        lines.append(
            String(
                format: "性能儀表：最新 %.0fms｜峰值 %.0fms",
                sessionManager.runtimeLagLatestMs,
                sessionManager.runtimeLagPeakMs
            )
        )
        lines.append("保護觸發：一般 \(sessionManager.lagProtectionTriggerCount) 次｜極限 \(sessionManager.extremeProtectionTriggerCount) 次")
        lines.append("重建統計：全息 \(sessionManager.facadeRebuildCount) 次｜IFC \(sessionManager.ifcRegenerateCount) 次")
        lines.append("最後狀態：\(safetyMonkeyLastAction)")
        if monkeyActionHistory.isEmpty {
            lines.append("近期動作：無")
        } else {
            lines.append("近期動作（最多 8 筆）：")
            for item in monkeyActionHistory.prefix(8) {
                lines.append("• \(item)")
            }
        }
        monkeyReportLines = lines
        if showSheet {
            DispatchQueue.main.async {
                guard self.isViewActive else { return }
                self.presentModalSheetSafely(.monkeyReport)
            }
        }
    }
}

private extension View {
    func prominentActionStyle(_ tint: Color) -> some View {
        self
            .buttonStyle(.borderedProminent)
            .tint(tint)
            .frame(maxWidth: .infinity)
    }

    func borderedActionStyle(_ tint: Color) -> some View {
        self
            .buttonStyle(.bordered)
            .tint(tint)
            .frame(maxWidth: .infinity)
    }
}
