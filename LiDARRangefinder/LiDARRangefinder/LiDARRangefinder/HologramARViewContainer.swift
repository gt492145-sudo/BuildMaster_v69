import SwiftUI
import RealityKit
import ARKit
import UIKit
import Combine
import CoreImage

struct HologramARViewContainer: UIViewRepresentable {
    let blueprintImage: UIImage
    let physicalWidth: Double
    let modelName: String

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        context.coordinator.arView = arView
        context.coordinator.requestSetup(
            blueprint: blueprintImage,
            width: physicalWidth,
            modelName: modelName,
            forceReset: true
        )
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        context.coordinator.arView = uiView
        context.coordinator.requestSetup(
            blueprint: blueprintImage,
            width: physicalWidth,
            modelName: modelName,
            forceReset: false
        )
    }

    func makeCoordinator() -> HologramCoordinator {
        HologramCoordinator()
    }
}

final class HologramCoordinator: NSObject, ARSessionDelegate {
    weak var arView: ARView?
    private var loadedModel: ModelEntity?
    private var modelLoadTask: Task<Void, Never>?
    private var placedModelEntity: ModelEntity?
    private var blueprintAnchorEntity: AnchorEntity?
    private var trackedImageAnchorID: UUID?
    private var pendingSetupTask: Task<Void, Never>?
    private var lastConfigSignature = ""
    private var activeModelName = ""
    private var sceneLight: DirectionalLight?
    private var sceneLightAnchor: AnchorEntity?
    private var sceneUpdateSubscription: Cancellable?
    private var lastSessionRunAt: TimeInterval = 0
    private var cachedReferenceSignature = ""
    private var cachedReferenceImage: ARReferenceImage?
    private let minSessionRunInterval: TimeInterval = 0.35
    private let setupDebounceNanos: UInt64 = 180_000_000
    private let ciContext = CIContext()

    deinit {
        modelLoadTask?.cancel()
        pendingSetupTask?.cancel()
        sceneUpdateSubscription?.cancel()
    }

    func requestSetup(blueprint: UIImage, width: Double, modelName: String, forceReset: Bool) {
        cancelPendingSetupTask()
        if forceReset {
            setupSession(blueprint: blueprint, width: width, modelName: modelName, forceReset: true)
            return
        }
        scheduleSetup(
            blueprint: blueprint,
            width: width,
            modelName: modelName,
            forceReset: false,
            delayNanos: setupDebounceNanos
        )
    }

    private func setupSession(blueprint: UIImage, width: Double, modelName: String, forceReset: Bool) {
        guard let arView else { return }
        guard width > 0 else { return }

        let signature = "\(modelName)|\(String(format: "%.4f", width))|\(blueprintFingerprint(blueprint))"
        if !forceReset, signature == lastConfigSignature { return }

        if !forceReset {
            let now = Date().timeIntervalSinceReferenceDate
            let elapsed = now - lastSessionRunAt
            if elapsed < minSessionRunInterval {
                let delay = UInt64((minSessionRunInterval - elapsed) * 1_000_000_000)
                scheduleSetup(
                    blueprint: blueprint,
                    width: width,
                    modelName: modelName,
                    forceReset: false,
                    delayNanos: delay
                )
                return
            }
        }
        lastConfigSignature = signature

        let referenceImage: ARReferenceImage
        if signature == cachedReferenceSignature, let cachedReferenceImage {
            referenceImage = cachedReferenceImage
        } else {
            guard let cgImage = optimizedCGImage(from: blueprint) else {
                return
            }
            let builtReferenceImage = ARReferenceImage(cgImage, orientation: .up, physicalWidth: CGFloat(width))
            builtReferenceImage.name = "FacadeBlueprint"
            cachedReferenceSignature = signature
            cachedReferenceImage = builtReferenceImage
            referenceImage = builtReferenceImage
        }

        if forceReset {
            cleanupPlacement()
        }

        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.detectionImages = [referenceImage]
        config.maximumNumberOfTrackedImages = 1

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
            config.sceneReconstruction = .meshWithClassification
        } else if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            // Non-LiDAR fallback for people occlusion.
            config.frameSemantics.insert(.personSegmentationWithDepth)
        }

        arView.environment.sceneUnderstanding.options.formUnion([.occlusion, .receivesLighting])
        arView.session.delegate = self
        if forceReset {
            arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        } else {
            // Keep world understanding while swapping tracking targets.
            arView.session.run(config)
        }
        lastSessionRunAt = Date().timeIntervalSinceReferenceDate

        ensureDirectionalLight()
        loadModelIfNeeded(named: modelName)
    }

    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        for anchor in anchors {
            guard let imageAnchor = anchor as? ARImageAnchor else { continue }
            handleImageAnchorUpdate(imageAnchor, shouldAttemptPlacement: true)
        }
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        for anchor in anchors {
            guard let imageAnchor = anchor as? ARImageAnchor else { continue }
            guard trackedImageAnchorID == nil || imageAnchor.identifier == trackedImageAnchorID else { continue }
            handleImageAnchorUpdate(imageAnchor, shouldAttemptPlacement: false)
        }
    }

    private func optimizedCGImage(from image: UIImage) -> CGImage? {
        let minDimension = max(1, min(image.size.width, image.size.height))
        let scaleUp: CGFloat = minDimension < 900 ? 3.0 : 1.0
        let targetSize = CGSize(width: image.size.width * scaleUp, height: image.size.height * scaleUp)
        let renderer = UIGraphicsImageRenderer(size: targetSize)
        let redrawn = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        guard let inputCGImage = redrawn.cgImage else { return nil }

        // Reduce specular glare and lift line contrast for blueprint tracking.
        let inputCI = CIImage(cgImage: inputCGImage)
        let exposure = CIFilter(name: "CIExposureAdjust")
        exposure?.setValue(inputCI, forKey: kCIInputImageKey)
        exposure?.setValue(-0.4, forKey: kCIInputEVKey)
        let exposureOutput = exposure?.outputImage ?? inputCI

        let color = CIFilter(name: "CIColorControls")
        color?.setValue(exposureOutput, forKey: kCIInputImageKey)
        color?.setValue(0.0, forKey: kCIInputSaturationKey)
        color?.setValue(1.24, forKey: kCIInputContrastKey)
        color?.setValue(-0.03, forKey: kCIInputBrightnessKey)
        let contrastOutput = color?.outputImage ?? exposureOutput

        let sharpen = CIFilter(name: "CIUnsharpMask")
        sharpen?.setValue(contrastOutput, forKey: kCIInputImageKey)
        sharpen?.setValue(0.75, forKey: kCIInputIntensityKey)
        sharpen?.setValue(1.1, forKey: kCIInputRadiusKey)
        let finalImage = sharpen?.outputImage ?? contrastOutput

        return ciContext.createCGImage(finalImage, from: finalImage.extent) ?? inputCGImage
    }

    private func loadModelIfNeeded(named modelName: String) {
        guard activeModelName != modelName || loadedModel == nil else {
            tryPlaceModelIfReady(animated: false)
            return
        }
        activeModelName = modelName
        loadedModel = nil
        modelLoadTask?.cancel()
        modelLoadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let entity = try await ModelEntity(named: modelName)
                if Task.isCancelled { return }
                await MainActor.run {
                    self.loadedModel = entity
                    self.tryPlaceModelIfReady(animated: true)
                }
            } catch {
                // Intentionally silent: model can be optional in some builds.
            }
        }
    }

    private func ensureDirectionalLight() {
        guard let arView else { return }
        if sceneLight == nil {
            let light = DirectionalLight()
            light.light.intensity = 12_000
            light.light.color = .white
            light.shadow = DirectionalLightComponent.Shadow(maximumDistance: 8, depthBias: 1)
            light.orientation = simd_quatf(angle: -.pi / 3, axis: SIMD3<Float>(1, 0, 0))
            let lightAnchor = AnchorEntity(world: matrix_identity_float4x4)
            lightAnchor.addChild(light)
            arView.scene.addAnchor(lightAnchor)
            sceneLightAnchor = lightAnchor
            sceneLight = light
        }
    }

    private func updateBlueprintAnchorTransform(_ transform: simd_float4x4) {
        guard let arView else { return }
        if blueprintAnchorEntity == nil {
            let anchorEntity = AnchorEntity(world: transform)
            anchorEntity.name = "FacadeBlueprintAnchor"
            arView.scene.addAnchor(anchorEntity)
            blueprintAnchorEntity = anchorEntity
        } else {
            blueprintAnchorEntity?.setTransformMatrix(transform, relativeTo: nil)
        }
    }

    private func tryPlaceModelIfReady(animated: Bool) {
        guard let parentAnchor = blueprintAnchorEntity,
              let baseModel = loadedModel else { return }

        if let current = placedModelEntity {
            current.removeFromParent()
            placedModelEntity = nil
        }

        let model = baseModel.clone(recursive: true)
        model.name = "FacadeModel"
        model.generateCollisionShapes(recursive: true)

        let pivot = Entity()
        pivot.name = "FacadePivot"
        pivot.addChild(model)
        parentAnchor.addChild(pivot)

        let uprightRotation = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
        if animated {
            var target = Transform()
            target.rotation = uprightRotation
            pivot.move(to: target, relativeTo: parentAnchor, duration: 0.32, timingFunction: .easeInOut)
        } else {
            pivot.orientation = uprightRotation
        }

        if let arView {
            _ = arView.installGestures([.scale, .rotation, .translation], for: model)
        }
        placedModelEntity = model
        installInteractionGuards()
    }

    private func cleanupPlacement() {
        cancelPendingSetupTask()
        sceneUpdateSubscription?.cancel()
        sceneUpdateSubscription = nil
        placedModelEntity?.removeFromParent()
        placedModelEntity = nil
        blueprintAnchorEntity?.removeFromParent()
        blueprintAnchorEntity = nil
        trackedImageAnchorID = nil
    }

    private func blueprintFingerprint(_ image: UIImage) -> String {
        if let cgImage = image.cgImage {
            return "cg-\(cgImage.width)x\(cgImage.height)-\(cgImage.bytesPerRow)-\(cgImage.bitsPerPixel)-\(Int(image.scale * 100))"
        }
        if let ciImage = image.ciImage {
            return "ci-\(Int(ciImage.extent.width))x\(Int(ciImage.extent.height))-\(Int(image.scale * 100))"
        }
        return "\(Int(image.size.width))x\(Int(image.size.height))"
    }

    private func cancelPendingSetupTask() {
        pendingSetupTask?.cancel()
        pendingSetupTask = nil
    }

    private func scheduleSetup(
        blueprint: UIImage,
        width: Double,
        modelName: String,
        forceReset: Bool,
        delayNanos: UInt64
    ) {
        cancelPendingSetupTask()
        pendingSetupTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: delayNanos)
            await MainActor.run {
                self.setupSession(blueprint: blueprint, width: width, modelName: modelName, forceReset: forceReset)
            }
        }
    }

    private func handleImageAnchorUpdate(_ imageAnchor: ARImageAnchor, shouldAttemptPlacement: Bool) {
        trackedImageAnchorID = imageAnchor.identifier
        updateBlueprintAnchorTransform(imageAnchor.transform)
        if shouldAttemptPlacement {
            tryPlaceModelIfReady(animated: true)
        }
    }

    private func installInteractionGuards() {
        sceneUpdateSubscription?.cancel()
        guard let arView else { return }
        sceneUpdateSubscription = arView.scene.subscribe(to: SceneEvents.Update.self) { [weak self] _ in
            guard let self, let model = self.placedModelEntity else { return }
            var transform = model.transform
            var needsWriteBack = false

            // Constrain scale with smooth rebound.
            let currentUniformScale = max(0.0001, transform.scale.x)
            let clampedUniformScale = min(1.8, max(0.45, currentUniformScale))
            if abs(currentUniformScale - clampedUniformScale) > 0.0001 {
                let reboundAlpha: Float = 0.22
                let blendedScale = currentUniformScale + (clampedUniformScale - currentUniformScale) * reboundAlpha
                transform.scale = SIMD3<Float>(repeating: blendedScale)
                needsWriteBack = true
            }

            // Keep facade around anchor region with smooth positional rebound.
            let clampedTranslation = SIMD3<Float>(
                min(0.75, max(-0.75, transform.translation.x)),
                min(1.2, max(-0.02, transform.translation.y)),
                min(0.75, max(-0.75, transform.translation.z))
            )
            let translationDelta = simd_length(transform.translation - clampedTranslation)
            if translationDelta > 0.0001 {
                let reboundAlpha: Float = 0.22
                transform.translation = transform.translation + (clampedTranslation - transform.translation) * reboundAlpha
                needsWriteBack = true
            }

            // Limit total rotation magnitude to avoid over-flipping.
            let normalizedRotation = simd_normalize(transform.rotation)
            let currentAngle = simd_angle(normalizedRotation)
            let maxAngle: Float = .pi * 0.60
            if currentAngle > maxAngle {
                let ratio = maxAngle / currentAngle
                transform.rotation = simd_normalize(simd_slerp(simd_quatf(), normalizedRotation, ratio))
                needsWriteBack = true
            }

            if needsWriteBack {
                model.transform = transform
            }
        }
    }
}
