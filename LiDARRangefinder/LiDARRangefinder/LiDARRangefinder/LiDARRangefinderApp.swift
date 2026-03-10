import SwiftUI

@main
struct LiDARRangefinderApp: App {
    @StateObject private var sessionManager = LiDARSessionManager()
    @StateObject private var measurementStore = MeasurementStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(sessionManager)
                .environmentObject(measurementStore)
        }
    }
}
