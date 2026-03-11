import RealityKit
import SwiftUI
import UIKit

struct ARViewContainer: UIViewRepresentable {
    @EnvironmentObject private var sessionManager: LiDARSessionManager

    func makeCoordinator() -> Coordinator {
        Coordinator(sessionManager: sessionManager)
    }

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.environment.sceneUnderstanding.options.insert(.occlusion)
        view.automaticallyConfigureSession = false
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        sessionManager.attachARView(view)
        context.coordinator.arView = view
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        // No-op for now.
    }

    final class Coordinator: NSObject {
        weak var arView: ARView?
        private let sessionManager: LiDARSessionManager

        init(sessionManager: LiDARSessionManager) {
            self.sessionManager = sessionManager
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard let arView else { return }
            let location = recognizer.location(in: arView)
            sessionManager.placeConcreteBlock(atScreenPoint: location)
        }
    }
}
