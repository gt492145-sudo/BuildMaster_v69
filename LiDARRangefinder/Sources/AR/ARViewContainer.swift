import RealityKit
import SwiftUI

struct ARViewContainer: UIViewRepresentable {
    @EnvironmentObject private var sessionManager: LiDARSessionManager

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.environment.sceneUnderstanding.options.insert(.occlusion)
        view.automaticallyConfigureSession = false
        sessionManager.attachARView(view)
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        // No-op for now.
    }
}
