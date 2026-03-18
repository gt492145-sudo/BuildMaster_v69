# 基於 SwiftUI 與 RealityKit 之擴增實境建築全息投影技術實作與優化研究報告

## 摘要（中文）

本研究提出一套以 SwiftUI、ARKit 與 RealityKit 為核心的建築全息投影實作方法，目標為將二維實體藍圖於行動裝置中即時轉換為可穩定疊加之三維建築立面。研究重點包含：SwiftUI 與 ARSession 之橋接設計、執行時動態生成 `ARReferenceImage`、`physicalWidth` 精度治理、`ARWorldTrackingConfiguration` 與 VIO 追蹤策略、水平藍圖至垂直立面之座標轉換、以及 LiDAR 深度遮擋（Occlusion）渲染整合。結果顯示，透過正確的會話配置、層級化實體拓撲、四元數旋轉與資源分配控制，可顯著降低模型漂移、追蹤中斷與高負載造成之幀率衰退。本研究並進一步提出工地部署條件與操作流程，建立可落地之企業級 AR 建築視覺化技術框架。

**關鍵字：**擴增實境、建築視覺化、SwiftUI、RealityKit、ARKit、VIO、LiDAR、Occlusion

## Abstract (English)

This study presents an implementation and optimization framework for architectural holographic projection using SwiftUI, ARKit, and RealityKit. The objective is to transform a 2D physical blueprint into a stable, real-time 3D facade overlay on mobile devices. Core contributions include: SwiftUI-ARSession bridging design, runtime `ARReferenceImage` generation, `physicalWidth` precision governance, `ARWorldTrackingConfiguration` with VIO-based tracking strategy, coordinate transformation from horizontal blueprint space to vertical facade space, and LiDAR-based occlusion rendering integration. Results indicate that robust session configuration, hierarchical entity topology, quaternion-based rotation, and resource-aware tracking policies significantly reduce model drifting, tracking loss, and thermal/performance degradation. The study further proposes field-deployment constraints and operating procedures, forming a practical enterprise-grade AR framework for architectural visualization.

**Keywords:** Augmented Reality, Architectural Visualization, SwiftUI, RealityKit, ARKit, VIO, LiDAR, Occlusion

## 1. 研究背景與應用價值

擴增實境（Augmented Reality, AR）在建築設計、營建管理與空間展示中，已成為將二維藍圖轉化為三維可視化內容的重要技術。相較於傳統平面圖說，AR 能在真實場域中直接呈現建築立面（Facade）的尺度、深度、材質光影與空間關係，顯著提升跨部門溝通效率與決策品質。

本研究聚焦於「將建築立面全息影像精準疊加於實體藍圖」之實作方法，並以 SwiftUI、ARKit、RealityKit 為核心技術堆疊，建立一套可用於工地部署的企業級實務方案。

---

## 2. 系統架構與橋接原理

### 2.1 SwiftUI 與 ARKit/RealityKit 的架構差異

SwiftUI 為狀態驅動（State-driven）架構；ARKit/RealityKit 則屬持續更新之感測與場景系統。兩者要協作，需透過 `UIViewRepresentable` 將 `ARView` 封裝為 SwiftUI 可管理元件。

### 2.2 `ARViewContainer` 生命週期

- `makeUIView(context:)`：建立 `ARView`、設定 `ARSession`、初始化場景錨點。
- `updateUIView(_:context:)`：根據 UI 狀態調整追蹤、模型顯示與渲染策略。

為避免資源浪費，AR 硬體感測應僅在視圖可見且必要時啟動，避免背景高負載運算導致耗電與溫升。

### 2.3 Coordinator 與委派模式

Coordinator 遵循 `ARSessionDelegate`，在 `session(_:didAdd:)`、`session(_:didUpdate:)` 接收 `ARImageAnchor` 事件，並將結果回寫 SwiftUI 狀態層與 RealityKit 場景層，形成穩定資料流。

---

## 3. 影像錨點更新與全息模型穩定跟隨

在 `session(_:didUpdate:)` 中，系統會取得最新 `ARImageAnchor.transform`。為確保全息立面「貼附」於實體藍圖，應將此矩陣同步至關聯 `AnchorEntity`。

關鍵工程原則如下：

1. 單一藍圖對應單一主錨點，避免重複錨點造成抖動。
2. 更新頻率需節流並平滑處理，避免高頻微震導致畫面閃動。
3. 錨點更新需在主線程安全套用至場景，防止狀態競態。

此高頻同步能力是工業級 AR 與一般展示型 AR 的核心分水嶺。

---

## 4. 動態藍圖識別：`ARReferenceImage` Runtime 建構

### 4.1 為何不可只靠靜態 Asset Catalog

營建場景中的藍圖常由雲端即時生成、頻繁改版。若每次更新都需重新編譯 App，流程不可行。因此系統必須支援執行時（Runtime）把使用者上傳的 `UIImage` 轉為 `ARReferenceImage`。

### 4.2 物理寬度（Physical Width）為精度核心參數

`ARReferenceImage(cgImage:orientation:physicalWidth:)` 的 `physicalWidth` 需以公尺為單位，且與實體列印尺寸一致。此參數直接參與 ARKit 的深度與姿態推算（VIO + 幾何投影）。若輸入與實體尺寸不一致，會導致：

- 模型比例錯誤（過大/過小）
- 視角變化時發生明顯漂移（drifting）
- 疊合點位偏移累積

因此 UI 流程必須強制要求並驗證實體寬度輸入。

### 4.3 影像解析度與特徵強化

低解析來源（如縮圖）常造成特徵不足。建議在建構前做影像前處理：

- 最短邊解析度檢查與必要放大重繪（例如 3x）
- 保留邊緣對比，避免過度平滑
- 以品質分數（解析度/對比/角點）提示使用者是否適合追蹤

此策略可降低追蹤失敗率並提升穩定度。

---

## 5. 會話配置策略：`ARImageTrackingConfiguration` vs `ARWorldTrackingConfiguration`

### 5.1 純影像追蹤（`ARImageTrackingConfiguration`）限制

此模式依賴影像持續在視野內。當使用者抬頭看高樓立面，藍圖離框後即失去參考，可能導致模型消失、重置或凍結。

### 5.2 世界追蹤整合影像偵測（推薦）

`ARWorldTrackingConfiguration` 搭配 `detectionImages` 可在辨識藍圖後，建立世界座標參考，讓模型在短暫離框時仍維持連續性。實務最佳化策略為：

- 以世界追蹤維持連續性
- 以影像重新入框作為再校正機制

此「世界追蹤為主、影像校正為輔」架構更適合大型建築展示。

---

## 6. 工地部署實務限制與對策

### 6.1 圖紙材質與特徵

- 建議使用消光（Matte）材質，避免反光。
- 四角加入不重複高對比特徵（如 Logo 或標記塊）。

### 6.2 日照對 LiDAR 影響

戶外正午強光會干擾紅外線深度感測，導致遮擋失準或追蹤不穩。建議於陰影區或清晨/傍晚展示。

### 6.3 粉塵與雨滴干擾

雨滴與粉塵可能被誤判為障礙，造成表面閃爍與異常遮擋。應於乾燥、低粉塵條件下操作。

### 6.4 模型效能與熱衰退

高面數模型會提高 GPU/CPU 負載，導致發熱降頻與幀率下降。建議：

- 使用 LOD 或簡化模型
- 先展示主體外觀，再逐步開啟細節
- 保留必要構件，移除不可見內部幾何

---

## 7. 實作優化重點（SwiftUI + RealityKit）

1. 以單一 `activeSheet` 管理多彈窗，避免多重 sheet 衝突。
2. `onAppear` 與狀態同步邏輯集中，避免生命週期分散。
3. Sheet 切換採「先關再開」防抖策略，降低連點抖動。
4. AR 模式分支（一般 AR / 全息模式）明確分離，降低渲染路徑衝突。
5. 針對藍圖上傳加入品質評估與使用者可讀提示。

---

## 8. 結論

本研究顯示，建築全息投影應用的成功關鍵，不僅在於模型渲染能力，更在於完整資料鏈的精度控制與現場條件治理。透過 SwiftUI 與 RealityKit/ARKit 的正確橋接、動態影像參考建構、物理尺寸校準、追蹤策略選擇與效能優化，可將 AR 從展示原型提升至工地可落地之企業級工具。

綜合實務結果，以下三項為部署成敗核心：

1. 消光且特徵清晰的圖紙追蹤基準
2. 避免正午強日照與環境干擾
3. 模型減面與渲染負載控制

---

## 9. 建議後續研究方向

- 納入自動化追蹤品質評分與即時修正建議（Adaptive QA）
- 建立不同裝置型號之效能基準曲線（Thermal/FPS Profile）
- 導入雲端版本控管，將藍圖版本、physicalWidth 與模型版本強制綁定
- 建立現場部署稽核報告輸出（可供監造與業主驗收）

---

## 10. `ARWorldTrackingConfiguration` 與 VIO 之工程優勢

對大型建築全息投影而言，建議採用 `ARWorldTrackingConfiguration` 並將動態建構之 `ARReferenceImage` 指派至 `detectionImages`。其核心優勢來自 VIO（Visual-Inertial Odometry）：

- 以 IMU（加速度計/陀螺儀）高頻資料與相機特徵點同步融合
- 持續建立相對穩定的世界座標參考
- 在藍圖短暫離框時仍可維持模型連續穩定

在此架構下，藍圖影像扮演「初始對齊與觸發器」，而非全程唯一參考。使用者可自由移動視角檢視立面細節，系統仍能維持模型位置與姿態一致性。

### 10.1 `maximumNumberOfTrackedImages` 資源配置

若單次僅需追蹤一張藍圖，建議設定：

- `configuration.maximumNumberOfTrackedImages = 1`

此作法可降低多目標掃描成本，提升追蹤穩定與渲染幀率，並減少 CPU/GPU 發熱。若同時追蹤數量過多，通常會導致偵測成功率與姿態更新品質下降。

### 10.2 動態切換 `detectionImages` 的會話策略

企業情境常需連續切換藍圖。更新 `detectionImages` 後，建議優先使用：

- `session.run(configuration)`（不帶重置選項）

可在多數情境下保留既有世界理解，避免每次切換都摧毀場景狀態。僅在追蹤品質明顯崩潰時，才考慮以 reset 選項做完整重建。

---

## 11. 水平藍圖到垂直立面的座標拓撲轉換

### 11.1 問題本質：座標語意衝突

`ARImageAnchor` 由平面影像建立參考，建築模型則通常以 Y 軸作為高度軸。若模型直接掛在錨點上而未做旋轉，常見結果是模型「平躺」在紙面上，而非立起為立面展示。

### 11.2 層級分離：避免被 ARKit 覆寫

不建議直接改 `AnchorEntity` 自身姿態。因為 ARKit 會隨追蹤更新持續覆寫其世界變換。正確方式是：

1. `AnchorEntity` 僅承擔真實世界對齊
2. 在其下新增子 `Entity`/`ModelEntity`
3. 對子節點套用相對旋轉與位移

此設計可避免每幀被回寫，確保旋轉結果可持續。

### 11.3 四元數旋轉與複合乘法

建議以四元數進行旋轉，避免歐拉角萬向鎖問題。典型立面轉換可使用 X 軸 -90 度旋轉：

`simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))`

實作重點：

- 使用「乘法複合」整合旋轉（保留矩陣正交性）
- 避免錯誤加法疊代導致 scale/shear 異常

若需提升觀感，可透過 `move(to:relativeTo:duration:timingFunction:)` 讓模型以平滑動畫「站立」完成轉換。

### 11.4 第六章：矩陣推導（水平藍圖到垂直立面）

本節對應完整數學推導，建立從 `ARImageAnchor` 到立面模型的最小可用變換鏈。

#### (1) 座標系定義

- 世界座標系：\( \mathcal{W} \)
- 影像錨點座標系：\( \mathcal{A} \)
- 模型局部座標系：\( \mathcal{M} \)

ARKit 在時間 \(t\) 給出影像錨點齊次矩陣：

\[
{}^{\mathcal{W}}T_{\mathcal{A}}(t) =
\begin{bmatrix}
R_{\mathcal{W}\mathcal{A}}(t) & p_{\mathcal{W}\mathcal{A}}(t) \\
0\ 0\ 0 & 1
\end{bmatrix}
\]

其中 \(R \in SO(3)\)，\(p \in \mathbb{R}^3\)。

#### (2) 立面旋轉矩陣

假設模型預設為「平躺」且需沿 X 軸旋轉 \(-90^\circ\) 使其立起，則：

\[
R_x(-\frac{\pi}{2}) =
\begin{bmatrix}
1 & 0 & 0 \\
0 & 0 & 1 \\
0 & -1 & 0
\end{bmatrix}
\]

若有額外方位修正（例如繞 Y 軸 \( \theta \)）：

\[
R_y(\theta)=
\begin{bmatrix}
\cos\theta & 0 & \sin\theta \\
0 & 1 & 0 \\
-\sin\theta & 0 & \cos\theta
\end{bmatrix}
\]

模型相對錨點旋轉可寫為：

\[
R_{\mathcal{A}\mathcal{M}} = R_y(\theta)\,R_x(-\frac{\pi}{2})
\]

#### (3) 子實體相對變換

為避免 `AnchorEntity` 被 ARKit 每幀覆寫，旋轉與偏移僅施加於子實體：

\[
{}^{\mathcal{A}}T_{\mathcal{M}} =
\begin{bmatrix}
R_{\mathcal{A}\mathcal{M}} & p_{\mathcal{A}\mathcal{M}} \\
0\ 0\ 0 & 1
\end{bmatrix}
\]

最終模型世界位姿：

\[
{}^{\mathcal{W}}T_{\mathcal{M}}(t)=
{}^{\mathcal{W}}T_{\mathcal{A}}(t)\cdot{}^{\mathcal{A}}T_{\mathcal{M}}
\]

此式說明：錨點持續追蹤、模型保持相對姿態，兩者相乘即可得到穩定立面投影。

### 11.5 四元數表達與實作對應

四元數形式可避免歐拉角插值問題。令：

\[
q_x = \mathrm{quat}(axis=[1,0,0],\ angle=-\frac{\pi}{2}),\quad
q_y = \mathrm{quat}(axis=[0,1,0],\ angle=\theta)
\]

則合成旋轉：

\[
q_{\mathcal{A}\mathcal{M}} = q_y \otimes q_x
\]

注意使用「乘法合成」而非加法疊代；加法會破壞旋轉正交性，導致不可預期形變。

---

## 12. LiDAR 深度遮擋（Occlusion）渲染機制

### 12.1 為何遮擋是專業可信度關鍵

若無遮擋，虛擬建築永遠覆蓋在畫面最上層，會出現手部或實物在前方卻仍被模型「穿透蓋住」的視覺錯誤，嚴重破壞沉浸感與專業說服力。

### 12.2 場景重建啟用

在 `ARWorldTrackingConfiguration` 中可啟用：

- `sceneReconstruction = .mesh` 或 `.meshWithClassification`

由 LiDAR 輸出環境深度後，ARKit 會建立 `ARMeshAnchor` 形成場景幾何近似。

### 12.3 RealityKit 遮擋管線

啟用遮擋選項：

- `arView.environment.sceneUnderstanding.options.insert(.occlusion)`

其渲染意義為：重建網格可寫入深度資訊（Depth Buffer），但不寫入顏色資訊（Color Buffer），因此在畫面不可見，卻可正確阻擋後方虛擬模型。結果是虛實遮蔽關係符合光學直覺，明顯提升 AR 全息可信度。

---

## 13. 綜合實作建議

1. 以 `ARWorldTrackingConfiguration + detectionImages` 作為主路徑。
2. 追蹤目標單一時，將 `maximumNumberOfTrackedImages` 控制為 1。
3. 切圖優先不重置 world map，必要時再 fallback reset。
4. 旋轉永遠施加在子實體，不直接改 `AnchorEntity`。
5. 立面轉換採四元數乘法，避免矩陣畸變。
6. LiDAR 機型預設開啟 `.occlusion`，非 LiDAR 機型降級處理。

---

## 14. 遮擋深度測試與非 LiDAR 降級策略

當渲染管線繪製虛擬建築像素時，GPU 會執行深度測試（Depth Test）。若模型像素深度大於同螢幕座標的深度緩衝值，該像素會被丟棄（discard），因此虛擬內容可被前景實體正確遮擋。這是全息建築「不穿透真實物件」的核心機制。

在非 LiDAR 裝置上，可評估啟用 `ARConfiguration.FrameSemantics` 的人物分割深度（Person Segmentation with Depth）以處理人員穿梭場景。建議採能力檢查後啟用：

- LiDAR 可用：優先 `.mesh/.meshWithClassification + .occlusion`
- 非 LiDAR：改用人物遮擋語意分割，並在 UI 提示精度屬於降級模式

---

## 15. 視覺保真度：PBR、光照估計與方向光陰影

僅有幾何對齊不足以形成專業級說服力。建築模型需在 PBR（Physically Based Rendering）下與現場光照一致：

- 材質核心參數：`baseColor`、`roughness`、`metallic`
- 啟用環境光照接收：`arView.environment.sceneUnderstanding.options.insert(.receivesLighting)`
- 結合 ARKit 光照估計，讓模型在不同色溫與亮度環境下自然變化

此外，若需明確落地陰影，建議額外配置 `DirectionalLight` 並校準其方向，使虛擬陰影與現場實體陰影方向一致，以提升空間可信度與比例感。

---

## 16. 效能與記憶體：大型 BIM 的安全載入策略

大型 USDZ/BIM 模型常伴隨高面數與高解析貼圖，若在主線程同步載入，容易造成 UI 冻結、追蹤中斷與定位錯亂。實務上應採非同步載入策略：

1. 使用非同步模型載入 API（或既有 async 流程）
2. 載入完成後再掛載到已建好的子層級節點
3. 取消機制與生命週期綁定，避免視圖離開後殘留請求
4. 使用弱參照避免循環引用造成記憶體洩漏

如使用 Combine 管線，需妥善持有 `AnyCancellable`，並在視圖銷毀時清理。

---

## 17. 手勢互動與防穿模約束

RealityKit 可透過 `installGestures([.scale, .rotation], for:)` 快速啟用互動，但目標實體必須有碰撞形狀。建議在模型載入後執行：

- `generateCollisionShapes(recursive: true)`

為避免操作造成破圖或空間錯亂，應加入約束：

1. 設定縮放上下限（避免 near clipping 與比例失真）
2. 鎖定基座高度（避免模型陷入桌面以下）
3. 持續監控 transform，超界即回彈到安全值

此機制可顯著降低現場誤觸導致的展示崩壞。

---

## 18. 系統穩定性最佳實踐總結

企業級建築 AR 全息投影需同時滿足「追蹤穩定、畫面可信、互動可控、資源可持續」四條件。綜合本研究與實作經驗，建議採以下四大策略：

1. **追蹤鏈穩定化**：`ARWorldTrackingConfiguration + detectionImages`，單目標追蹤數最小化，動態切圖優先不重置會話。
2. **拓撲與數學正確性**：錨點與模型節點分離，旋轉採四元數複合乘法，避免矩陣畸變。
3. **虛實一致性**：LiDAR occlusion/PBR/方向光整合，並提供非 LiDAR 降級路徑。
4. **運行時安全**：非同步載入、取消控制、碰撞形狀與互動約束，確保高負載下仍可維持可用性。

上述策略可在工地級高噪環境下維持高幀率、低漂移與可預期互動，具備明確商業落地價值。

---

## 附錄 A：Swift / RealityKit 對應實作（可直接引用）

```swift
import ARKit
import RealityKit
import simd

final class FacadePlacementCoordinator: NSObject, ARSessionDelegate {
    private weak var arView: ARView?
    private var rootAnchor: AnchorEntity?
    private var facadeEntity: ModelEntity?

    init(arView: ARView) {
        self.arView = arView
    }

    func configureSession(referenceImage: ARReferenceImage) {
        guard let arView else { return }
        let config = ARWorldTrackingConfiguration()
        config.detectionImages = [referenceImage]
        config.maximumNumberOfTrackedImages = 1
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
            config.sceneReconstruction = .meshWithClassification
        }
        arView.environment.sceneUnderstanding.options.insert(.occlusion)
        arView.session.delegate = self
        arView.session.run(config) // keep world map when switching targets
    }

    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        guard let imageAnchor = anchors.compactMap({ $0 as? ARImageAnchor }).first,
              let arView else { return }

        // 1) AnchorEntity only binds to real-world tracking result.
        let anchorEntity = AnchorEntity(anchor: imageAnchor)
        self.rootAnchor = anchorEntity

        // 2) Child entity keeps relative transform (won't be overwritten by ARKit).
        let model = ModelEntity()
        self.facadeEntity = model
        anchorEntity.addChild(model)
        arView.scene.addAnchor(anchorEntity)

        applyFacadeTransform(yaw: 0, offset: .zero)
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        // AnchorEntity(anchor:) is automatically updated by RealityKit via ARKit tracking.
        // Keep facade transform relative; do not rewrite rootAnchor transform each frame.
    }

    func applyFacadeTransform(yaw: Float, offset: SIMD3<Float>) {
        guard let facadeEntity else { return }

        let qX = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
        let qY = simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))
        let q = qY * qX // compound multiplication

        var t = Transform()
        t.rotation = q
        t.translation = offset

        // Smooth standing-up effect when blueprint is recognized.
        facadeEntity.move(to: t, relativeTo: facadeEntity.parent, duration: 0.28, timingFunction: .easeInOut)
    }
}
```

## 附錄 B：前處理 + 品質評估最小流程

```swift
import UIKit
import CoreImage

struct BlueprintQualityReport {
    let resolutionScore: Int
    let contrastScore: Int
    let recommendation: String
}

func preprocessBlueprintImage(_ image: UIImage, scaleUp: CGFloat = 3.0) -> UIImage? {
    let newSize = CGSize(width: image.size.width * scaleUp, height: image.size.height * scaleUp)
    let renderer = UIGraphicsImageRenderer(size: newSize)
    return renderer.image { _ in
        image.draw(in: CGRect(origin: .zero, size: newSize))
    }
}

func evaluateBlueprintQuality(_ image: UIImage) -> BlueprintQualityReport {
    let w = Int(image.size.width)
    let h = Int(image.size.height)
    let minEdge = min(w, h)
    let resolutionScore = min(100, max(0, (minEdge * 100) / 1200))

    // Minimal placeholder contrast metric for reporting pipeline.
    // Production can replace with Sobel/variance-based local contrast.
    let contrastScore = (minEdge >= 1200) ? 85 : (minEdge >= 800 ? 70 : 50)

    let recommendation: String
    if resolutionScore >= 80 && contrastScore >= 80 {
        recommendation = "可直接追蹤"
    } else if resolutionScore >= 60 {
        recommendation = "建議使用消光列印並補強角落特徵"
    } else {
        recommendation = "解析度不足，請改用原圖或重拍高解析版本"
    }

    return BlueprintQualityReport(
        resolutionScore: resolutionScore,
        contrastScore: contrastScore,
        recommendation: recommendation
    )
}
```

## 參考文獻（IEEE 占位）

[1] Apple Inc., "ARKit Documentation," Apple Developer Documentation, 2024. [Online]. Available: https://developer.apple.com/documentation/arkit  
[2] Apple Inc., "RealityKit Documentation," Apple Developer Documentation, 2024. [Online]. Available: https://developer.apple.com/documentation/realitykit  
[3] Apple Inc., "SwiftUI Documentation," Apple Developer Documentation, 2024. [Online]. Available: https://developer.apple.com/documentation/swiftui  
[4] C. Forster, L. Carlone, F. Dellaert, and D. Scaramuzza, "On-Manifold Preintegration for Real-Time Visual-Inertial Odometry," *IEEE Transactions on Robotics*, vol. 33, no. 1, pp. 1-21, 2017.  
[5] T. Qin, P. Li, and S. Shen, "VINS-Mono: A Robust and Versatile Monocular Visual-Inertial State Estimator," *IEEE Transactions on Robotics*, vol. 34, no. 4, pp. 1004-1020, 2018.

## 參考文獻（APA 占位）

Apple Inc. (2024). *ARKit Documentation*. Apple Developer Documentation. https://developer.apple.com/documentation/arkit  
Apple Inc. (2024). *RealityKit Documentation*. Apple Developer Documentation. https://developer.apple.com/documentation/realitykit  
Apple Inc. (2024). *SwiftUI Documentation*. Apple Developer Documentation. https://developer.apple.com/documentation/swiftui  
Forster, C., Carlone, L., Dellaert, F., & Scaramuzza, D. (2017). On-manifold preintegration for real-time visual-inertial odometry. *IEEE Transactions on Robotics, 33*(1), 1-21.  
Qin, T., Li, P., & Shen, S. (2018). VINS-Mono: A robust and versatile monocular visual-inertial state estimator. *IEEE Transactions on Robotics, 34*(4), 1004-1020.

