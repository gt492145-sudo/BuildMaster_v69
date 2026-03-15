import SwiftUI
import RealityKit
import ARKit
import Combine
import UIKit

struct HologramARViewContainer: UIViewRepresentable {
    let blueprintImage: UIImage
    let physicalWidth: Double
    let modelName: String

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        context.coordinator.arView = arView
        context.coordinator.setupSession(
            blueprint: blueprintImage,
            width: physicalWidth,
            modelName: modelName
        )
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        // Keep session setup one-time; caller can recreate view when inputs change.
    }

    func makeCoordinator() -> HologramCoordinator {
        HologramCoordinator()
    }
}

final class HologramCoordinator: NSObject, ARSessionDelegate {
    weak var arView: ARView?
    private var loadedModel: ModelEntity?
    private var modelLoadCancellable: AnyCancellable?
    private var didPlaceModel = false

    deinit {
        modelLoadCancellable?.cancel()
    }

    func setupSession(blueprint: UIImage, width: Double, modelName: String) {
        guard let arView else { return }
        guard width > 0 else { return }

        guard let cgImage = optimizedCGImage(from: blueprint) else { return }
        let referenceImage = ARReferenceImage(cgImage, orientation: .up, physicalWidth: CGFloat(width))
        referenceImage.name = "FacadeBlueprint"

        let config = ARWorldTrackingConfiguration()
        config.detectionImages = [referenceImage]
        config.maximumNumberOfTrackedImages = 1

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
            arView.environment.sceneUnderstanding.options.formUnion([.occlusion, .receivesLighting])
        }

        arView.session.delegate = self
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])

        modelLoadCancellable = ModelEntity.loadModelAsync(named: modelName)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] entity in
                    self?.loadedModel = entity
                }
            )
    }

    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        guard !didPlaceModel else { return }
        guard let imageAnchor = anchors.compactMap({ $0 as? ARImageAnchor }).first else { return }
        guard let arView, let baseModel = loadedModel else { return }

        let model = baseModel.clone(recursive: true)
        let rotation = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
        model.transform.rotation *= rotation

        let anchorEntity = AnchorEntity(anchor: imageAnchor)
        anchorEntity.name = imageAnchor.referenceImage.name ?? "BlueprintAnchor"
        anchorEntity.addChild(model)
        arView.scene.addAnchor(anchorEntity)
        didPlaceModel = true
    }

    private func optimizedCGImage(from image: UIImage) -> CGImage? {
        let renderer = UIGraphicsImageRenderer(size: image.size)
        let redrawn = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
        return redrawn.cgImage
    }
}
