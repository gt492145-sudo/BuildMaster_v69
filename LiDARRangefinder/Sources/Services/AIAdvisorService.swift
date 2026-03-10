import Foundation

struct AIMeasurementContext {
    let distanceMeters: Double?
    let pitchDegrees: Double
    let rollDegrees: Double
    let qaLevelText: String
    let qaProfileText: String
    let qaScore: Int
    let blueprintLocked: Bool
    let blueprintScore: Int
    let akiModeEnabled: Bool
    let aiDiagnosisText: String
}

struct AIAdviceResult {
    let text: String
    let source: String
}

final class AIAdvisorService {
    func generateAdvice(
        context: AIMeasurementContext,
        userGoal: String,
        openAIKey: String?
    ) async -> AIAdviceResult {
        guard let key = openAIKey, !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return localAdvice(context: context, userGoal: userGoal, source: "本地 AI")
        }

        do {
            let cloudText = try await fetchOpenAIAdvice(
                context: context,
                userGoal: userGoal,
                apiKey: key
            )
            return AIAdviceResult(text: cloudText, source: "雲端 AI")
        } catch {
            let fallback = localAdvice(context: context, userGoal: userGoal, source: "本地 AI（雲端失敗已回退）")
            return AIAdviceResult(text: fallback.text, source: fallback.source)
        }
    }

    private func localAdvice(
        context: AIMeasurementContext,
        userGoal: String,
        source: String
    ) -> AIAdviceResult {
        var lines: [String] = []
        if !userGoal.isEmpty {
            lines.append("目標：\(userGoal)")
        }

        if context.distanceMeters == nil {
            lines.append("先對準可量測平面，讓中心準星穩定 1 秒再開始記錄。")
        }
        if context.qaScore < 60 {
            lines.append("QA 分數偏低，先按「快速校準」，再降低手震與角度偏移。")
        } else if context.qaScore < 80 {
            lines.append("QA 可用但仍可提升，建議保持同一姿態並連續取樣。")
        } else {
            lines.append("QA 狀態良好，可進行正式記錄與輸出。")
        }

        let angleAbs = abs(context.pitchDegrees) + abs(context.rollDegrees)
        if angleAbs > 6 {
            lines.append("目前姿態偏差較大，請讓 Pitch / Roll 盡量靠近 0°。")
        }

        if context.akiModeEnabled {
            if !context.blueprintLocked {
                lines.append("阿基模式未鎖定標靶，請補光、拉近並讓藍圖完整入鏡。")
            } else if context.blueprintScore < 65 {
                lines.append("標靶品質尚未達建議門檻，先穩定鏡頭再記錄。")
            } else {
                lines.append("標靶追蹤品質達標，可搭配 QA 分數進行高可信記錄。")
            }
        }

        lines.append("目前診斷：\(context.aiDiagnosisText)")
        return AIAdviceResult(text: lines.joined(separator: "\n"), source: source)
    }

    private func fetchOpenAIAdvice(
        context: AIMeasurementContext,
        userGoal: String,
        apiKey: String
    ) async throws -> String {
        let url = URL(string: "https://api.openai.com/v1/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let systemPrompt = """
        你是工地 LiDAR 量測 QA 助手。請用繁體中文，輸出 3-6 行，短句、可執行、不要空話。
        """
        let userPrompt = """
        使用者目標: \(userGoal.isEmpty ? "未提供" : userGoal)
        距離: \(context.distanceMeters.map { String(format: "%.2f m", $0) } ?? "--")
        Pitch: \(String(format: "%.1f", context.pitchDegrees))°
        Roll: \(String(format: "%.1f", context.rollDegrees))°
        QA 等級: \(context.qaLevelText)
        QA 模式: \(context.qaProfileText)
        QA 分數: \(context.qaScore)
        阿基模式: \(context.akiModeEnabled ? "開" : "關")
        標靶鎖定: \(context.blueprintLocked ? "是" : "否")
        標靶分數: \(context.blueprintScore)
        目前診斷: \(context.aiDiagnosisText)
        請回覆下一步操作建議。
        """

        let body = ChatCompletionsRequest(
            model: "gpt-4o-mini",
            messages: [
                .init(role: "system", content: systemPrompt),
                .init(role: "user", content: userPrompt)
            ],
            temperature: 0.2
        )
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode(ChatCompletionsResponse.self, from: data)
        let output = decoded.choices.first?.message.content.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if output.isEmpty {
            throw URLError(.cannotParseResponse)
        }
        return output
    }
}

private struct ChatCompletionsRequest: Encodable {
    let model: String
    let messages: [ChatMessage]
    let temperature: Double
}

private struct ChatMessage: Codable {
    let role: String
    let content: String
}

private struct ChatCompletionsResponse: Decodable {
    let choices: [Choice]

    struct Choice: Decodable {
        let message: ChatMessage
    }
}
