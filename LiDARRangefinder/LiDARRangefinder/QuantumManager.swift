import Foundation

final class QuantumManager {
    static let shared = QuantumManager()

    private let apiBaseURL = "https://api.quantum-computing.ibm.com/runtime/jobs"
    private let apiKeyStorageKey = "lidar_rangefinder_quantum_ibm_api_key"
    private let backendStorageKey = "lidar_rangefinder_quantum_ibm_backend"
    private let shotsStorageKey = "lidar_rangefinder_quantum_ibm_shots"
    private let defaultBackend = "ibm_kyiv"
    private let defaultShots = 128

    private init() {}

    /// Send blueprint context to IBM Runtime and return a readable summary.
    func optimizeBlueprint(blueprintName: String, completion: @escaping (Bool, String) -> Void) {
        Task {
            do {
                let result = try await optimizeBlueprint(blueprintName: blueprintName)
                await MainActor.run {
                    completion(true, result)
                }
            } catch {
                await MainActor.run {
                    completion(false, error.localizedDescription)
                }
            }
        }
    }

    func optimizeBlueprint(blueprintName: String) async throws -> String {
        let apiKey = try readAPIKey()
        let backend = readBackend()
        let shots = readShots()
        let taggedBackend = "\(backend) [\(blueprintName)]"

        let jobID = try await submitRuntimeJob(
            apiKey: apiKey,
            backend: backend,
            shots: shots,
            blueprintName: blueprintName
        )
        let status = try await pollRuntimeJobStatus(apiKey: apiKey, jobID: jobID)
        if status == "completed" || status == "done" {
            let summary = try await fetchRuntimeResultSummary(apiKey: apiKey, jobID: jobID)
            return "核心運算完成（\(taggedBackend)）：\(summary)"
        }
        return "核心任務狀態：\(status)（job: \(jobID)）"
    }

    private func readAPIKey() throws -> String {
        let key = UserDefaults.standard.string(forKey: apiKeyStorageKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !key.isEmpty else {
            throw QuantumManagerError.noAPIKey
        }
        return key
    }

    private func readBackend() -> String {
        let value = UserDefaults.standard.string(forKey: backendStorageKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let value, !value.isEmpty {
            return value
        }
        return defaultBackend
    }

    private func readShots() -> Int {
        let value = UserDefaults.standard.integer(forKey: shotsStorageKey)
        if value == 0 {
            return defaultShots
        }
        return min(4096, max(32, value))
    }

    private func submitRuntimeJob(
        apiKey: String,
        backend: String,
        shots: Int,
        blueprintName: String
    ) async throws -> String {
        guard let url = URL(string: apiBaseURL) else {
            throw QuantumManagerError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": "sampler",
            "backend": backend,
            "params": [
                "pubs": [
                    [
                        "circuit": "bell",
                        "shots": shots,
                        "metadata": [
                            "blueprint_name": blueprintName
                        ]
                    ]
                ]
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try validateHTTP(data: data, response: response)
        if let jobID = payload["id"] as? String, !jobID.isEmpty { return jobID }
        if let jobID = payload["job_id"] as? String, !jobID.isEmpty { return jobID }
        throw QuantumManagerError.invalidResponse("找不到 Job ID")
    }

    private func pollRuntimeJobStatus(apiKey: String, jobID: String) async throws -> String {
        let terminalStates: Set<String> = ["completed", "done", "failed", "cancelled", "error"]
        var lastStatus = "queued"

        for _ in 0..<8 {
            try await Task.sleep(nanoseconds: 1_200_000_000)
            guard let url = URL(string: "\(apiBaseURL)/\(jobID)") else {
                throw QuantumManagerError.invalidURL
            }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            let payload = try validateHTTP(data: data, response: response)
            let status = ((payload["state"] as? String) ?? (payload["status"] as? String) ?? "queued").lowercased()
            lastStatus = status
            if terminalStates.contains(status) {
                return status
            }
        }
        return lastStatus
    }

    private func fetchRuntimeResultSummary(apiKey: String, jobID: String) async throws -> String {
        guard let url = URL(string: "\(apiBaseURL)/\(jobID)/results") else {
            throw QuantumManagerError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = try validateHTTP(data: data, response: response)
        if let quasi = payload["quasi_dists"] {
            return "quasi_dists=\(String(describing: quasi))"
        }
        if let result = payload["result"] {
            return String(describing: result)
        }
        return "keys=\(payload.keys.sorted().joined(separator: ","))"
    }

    private func validateHTTP(data: Data, response: URLResponse) throws -> [String: Any] {
        guard let http = response as? HTTPURLResponse else {
            throw QuantumManagerError.invalidResponse("伺服器回應格式錯誤")
        }
        guard (200...299).contains(http.statusCode) else {
            throw QuantumManagerError.httpError(code: http.statusCode, data: data)
        }
        let json = try JSONSerialization.jsonObject(with: data)
        guard let payload = json as? [String: Any] else {
            throw QuantumManagerError.invalidResponse("回應不是 JSON 物件")
        }
        return payload
    }
}

enum QuantumManagerError: LocalizedError {
    case noAPIKey
    case invalidURL
    case invalidResponse(String)
    case httpError(code: Int, data: Data)

    var errorDescription: String? {
        switch self {
        case .noAPIKey:
            return "未設定 IBM Cloud API Key"
        case .invalidURL:
            return "IBM API URL 無效"
        case .invalidResponse(let message):
            return "IBM 回應解析失敗：\(message)"
        case .httpError(let code, let data):
            switch code {
            case 401:
                return "401 Unauthorized（API Key 無效或過期）"
            case 403:
                return "403 Forbidden（帳號權限不足或未授權 Runtime）"
            case 429:
                return "429 Too Many Requests（請求過多，稍後再試）"
            default:
                let body = String(data: data, encoding: .utf8) ?? "無法解析回應"
                return "HTTP \(code)：\(String(body.prefix(120)))"
            }
        }
    }
}
