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
        view.environment.sceneUnderstanding.options.formUnion([.occlusion, .receivesLighting])
        // Keep camera feed crisp for field alignment.
        view.renderOptions.insert(.disableMotionBlur)
        view.renderOptions.insert(.disableDepthOfField)
        view.renderOptions.insert(.disableCameraGrain)
        view.automaticallyConfigureSession = false
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePinch(_:)))
        let panRotate = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePanRotate(_:)))
        panRotate.minimumNumberOfTouches = 1
        panRotate.maximumNumberOfTouches = 1
        panRotate.delegate = context.coordinator
        let panMove = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePanMove(_:)))
        panMove.minimumNumberOfTouches = 2
        panMove.maximumNumberOfTouches = 2
        panMove.delegate = context.coordinator
        let rotation = UIRotationGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleRotation(_:)))
        rotation.delegate = context.coordinator
        view.addGestureRecognizer(tap)
        view.addGestureRecognizer(pinch)
        view.addGestureRecognizer(panRotate)
        view.addGestureRecognizer(panMove)
        view.addGestureRecognizer(rotation)
        sessionManager.attachARView(view)
        context.coordinator.arView = view
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        // No-op for now.
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
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

        @objc func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
            switch recognizer.state {
            case .began, .changed:
                sessionManager.adjustFacadeHologramScale(by: recognizer.scale)
                recognizer.scale = 1.0
            case .ended:
                // Leave final status update to explicit actions to avoid high-frequency UI churn.
                break
            default:
                break
            }
        }

        @objc func handlePanRotate(_ recognizer: UIPanGestureRecognizer) {
            guard let arView, recognizer.state == .changed else { return }
            let translation = recognizer.translation(in: arView)
            let deltaYaw = -Float(translation.x) * 0.012
            let deltaPitch = -Float(translation.y) * 0.009
            sessionManager.rotateFacadeHologram(deltaYaw: deltaYaw, deltaPitch: deltaPitch)
            recognizer.setTranslation(.zero, in: arView)
        }

        @objc func handlePanMove(_ recognizer: UIPanGestureRecognizer) {
            guard let arView, recognizer.state == .changed else { return }
            let translation = recognizer.translation(in: arView)
            sessionManager.moveFacadeHologram(deltaScreenX: translation.x, deltaScreenY: translation.y)
            recognizer.setTranslation(.zero, in: arView)
        }

        @objc func handleRotation(_ recognizer: UIRotationGestureRecognizer) {
            guard recognizer.state == .changed else { return }
            sessionManager.rollFacadeHologram(deltaRoll: Float(recognizer.rotation))
            recognizer.rotation = 0
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            // Allow only multi-touch gesture combos needed for hologram manipulation.
            let a = gestureRecognizer
            let b = otherGestureRecognizer
            if (a is UIPinchGestureRecognizer && b is UIRotationGestureRecognizer) ||
                (a is UIRotationGestureRecognizer && b is UIPinchGestureRecognizer) {
                return true
            }
            if (a is UIPinchGestureRecognizer && b is UIPanGestureRecognizer) ||
                (a is UIPanGestureRecognizer && b is UIPinchGestureRecognizer) {
                return true
            }
            if let panA = a as? UIPanGestureRecognizer, let panB = b as? UIPanGestureRecognizer {
                // Do not run one-finger rotate-pan and two-finger move-pan together.
                return panA.minimumNumberOfTouches == panB.minimumNumberOfTouches
            }
            return false
        }
    }
}
