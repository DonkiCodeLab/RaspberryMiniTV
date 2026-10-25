import Foundation

private final class TransferDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let progress: @Sendable (Double) -> Void
    init(progress: @escaping @Sendable (Double) -> Void = { _ in }) { self.progress = progress }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        if totalBytesExpectedToSend > 0 { progress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend))) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Never forward a pairing code, credential or photo to another address.
    }
}

struct UploadReceipt: Decodable {
    struct Rejection: Decodable { let index: Int; let error: String }
    let imported: Int
    let duplicates: Int
    let rejected: [Rejection]?
    func validate() throws {
        guard imported >= 0, duplicates >= 0, imported + duplicates + (rejected?.count ?? 0) == 1 else {
            throw PhotoAppError.message("La MiniTV no ha confirmado el resultado de esta foto.")
        }
    }
}

final class PhotoAPI: @unchecked Sendable {
    let server: URL
    let token: String
    private let session: URLSession
    init(server: URL, token: String = "") {
        self.server = server; self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.allowsCellularAccess = false
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 600
        config.urlCache = nil
        session = URLSession(configuration: config, delegate: TransferDelegate(), delegateQueue: nil)
    }
    deinit { session.invalidateAndCancel() }

    private func request(_ path: String, method: String = "POST") -> URLRequest {
        var request = URLRequest(url: server.appendingPathComponent(path))
        request.httpMethod = method
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }
    private func checked(_ data: Data, _ response: URLResponse) throws -> Data {
        guard let http = response as? HTTPURLResponse else { throw PhotoAppError.message("Respuesta inválida de la MiniTV.") }
        guard (200..<300).contains(http.statusCode) else {
            let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw PhotoAppError.server(http.statusCode, body?["error"] as? String ?? "La MiniTV ha respondido HTTP \(http.statusCode).")
        }
        return data
    }
    func json(_ path: String, body: [String: Any]? = nil) async throws -> Data {
        var request = request(path, method: body == nil ? "GET" : "POST")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        return try checked(data, response)
    }
    func claim(code: String, clientID: String, deviceName: String) async throws -> Connection {
        struct Reply: Decodable { let token: String; let expiresAt: Double }
        let data = try await json("pictures/mobile/claim", body: ["code": code, "clientId": clientID, "deviceName": deviceName])
        let reply = try JSONDecoder().decode(Reply.self, from: data)
        guard reply.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              reply.expiresAt > Date().timeIntervalSince1970 else { throw PhotoAppError.message("El enlace recibido no es válido.") }
        return Connection(server: server, token: reply.token, expiresAt: reply.expiresAt)
    }
    func isMissing(_ digest: String) async throws -> Bool {
        struct Reply: Decodable { let missing: [Int] }
        let data = try await json("pictures/import/check", body: ["digests": [digest]])
        let reply = try JSONDecoder().decode(Reply.self, from: data)
        guard reply.missing == [] || reply.missing == [0] else { throw PhotoAppError.message("Comprobación de duplicados inválida.") }
        return !reply.missing.isEmpty
    }
    func prepareUpload(photo: ExportedPhoto, manifest: Data, includeFile: Bool) async throws -> (URL, String) {
        let boundary = "MiniTV-" + UUID().uuidString
        let body = try await Task.detached(priority: .utility) {
            try Self.multipart(photo: photo, manifest: manifest, includeFile: includeFile, boundary: boundary)
        }.value
        if Task.isCancelled { try? FileManager.default.removeItem(at: body); throw CancellationError() }
        return (body, "multipart/form-data; boundary=\(boundary)")
    }
    private static func multipart(photo: ExportedPhoto, manifest: Data, includeFile: Bool, boundary: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("minitv-body-" + UUID().uuidString)
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let handle = try FileHandle(forWritingTo: url)
        do {
            func write(_ text: String) throws { try handle.write(contentsOf: Data(text.utf8)) }
            try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"metadata\"; filename=\"metadata.json\"\r\nContent-Type: application/json\r\n\r\n")
            try handle.write(contentsOf: manifest)
            if includeFile {
                let name = photo.name.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
                try write("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(name)\"\r\nContent-Type: application/octet-stream\r\n\r\n")
                let input = try FileHandle(forReadingFrom: photo.url)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty { try handle.write(contentsOf: chunk) }
            }
            try write("\r\n--\(boundary)--\r\n")
            try handle.close()
            return url
        } catch { try? handle.close(); try? FileManager.default.removeItem(at: url); throw error }
    }
}
