import Foundation

@MainActor
final class BackgroundTransfers: NSObject, URLSessionDataDelegate {
    static let shared = BackgroundTransfers()
    static let identifier = "com.donkicodelab.minitvphotos.expo.uploads"
    private(set) var items: [PendingUpload] = []
    private(set) var ready = false
    var onChange: (() -> Void)?
    var onOutcome: ((PhotoOutcome) -> Void)?
    var onProgress: ((String, Double) -> Void)?
    var onError: ((Error) -> Void)?
    var eventsCompletion: (() -> Void)?
    private var outbox: UploadOutbox?
    private var responses: [Int: Data] = [:]
    private var active: [String: URLSessionTask] = [:]
    private var ignored = Set<Int>()
    private var startupError: Error?
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.allowsCellularAccess = false
        configuration.httpMaximumConnectionsPerHost = 2
        configuration.timeoutIntervalForResource = 24 * 60 * 60
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()
    var paused: Bool { !UserDefaults.standard.bool(forKey: "importEnabled") }
    var hasCapacity: Bool { items.count < 12 && items.reduce(Int64(0)) { $0 + $1.size } < 256 * 1024 * 1024 }

    override init() {
        super.init()
        do { let outbox = try UploadOutbox(); self.outbox = outbox; items = try outbox.load() }
        catch { startupError = error }
        _ = session
        Task { await recover() }
    }
    private func recover() async {
        let tasks = await session.allTasks
        for task in tasks {
            guard let id = task.taskDescription, items.contains(where: { $0.id == id }) else { task.cancel(); continue }
            active[id] = task
        }
        ready = true
        if let startupError { onError?(startupError); return }
        do { try outbox?.cleanOrphans(keeping: items) } catch { onError?(error); return }
        if !paused { resume() }
        onChange?()
    }
    func contains(session: String, index: Int) -> Bool { items.contains { $0.session == session && $0.index == index } }

    func enqueue(body: URL, contentType: String, job: ImportJob, index: Int, name: String) throws {
        guard let outbox, ready else { throw startupError ?? PhotoAppError.message("La cola de subidas aún no está lista.") }
        let id = UUID().uuidString
        let stored = try outbox.stage(body, id: id)
        let size = (try stored.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let item = PendingUpload(id: id, session: job.id, index: index, assetID: job.assetIDs[index], name: name,
                                 server: job.server, bodyName: stored.lastPathComponent, contentType: contentType, size: Int64(size))
        do { try outbox.save(items + [item]) }
        catch { try? FileManager.default.removeItem(at: stored); throw error }
        items.append(item)
        if !paused { try send(item) }
        onChange?()
    }
    private func send(_ item: PendingUpload) throws {
        if let task = active[item.id] { task.resume(); return }
        guard let connection = ConnectionVault.load(), connection.server == item.server, !connection.expired else {
            throw PhotoAppError.server(401, "El enlace ha caducado. Escanea otro QR para continuar.")
        }
        guard let outbox, FileManager.default.fileExists(atPath: outbox.body(for: item).path) else {
            try remove(item); return // The preparer will reconstruct this same idempotent batch.
        }
        var request = URLRequest(url: item.server.appendingPathComponent("pictures/upload"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(connection.token)", forHTTPHeaderField: "Authorization")
        request.setValue(item.contentType, forHTTPHeaderField: "Content-Type")
        let task = session.uploadTask(with: request, fromFile: outbox.body(for: item))
        task.taskDescription = item.id
        task.countOfBytesClientExpectsToSend = item.size
        task.countOfBytesClientExpectsToReceive = 16384
        active[item.id] = task
        task.resume()
    }
    func resume() {
        guard ready, !paused else { return }
        for item in items {
            do { try send(item) } catch { onError?(error); break }
        }
    }
    func pause() { for task in active.values { task.suspend() } }
    func resetTasks() {
        for task in active.values { ignored.insert(task.taskIdentifier); task.cancel() }
        active.removeAll()
    }
    func discard() throws {
        guard let outbox else { throw startupError ?? PhotoAppError.message("La cola de subidas no está disponible.") }
        resetTasks()
        try outbox.save([])
        for item in items { try? FileManager.default.removeItem(at: outbox.body(for: item)) }
        items = []
    }
    private func remove(_ item: PendingUpload) throws {
        guard let outbox else { return }
        let remaining = items.filter { $0.id != item.id }
        try outbox.save(remaining)
        items = remaining
        try? FileManager.default.removeItem(at: outbox.body(for: item))
    }
    private func complete(_ task: URLSessionTask, error: Error?) {
        let data = responses.removeValue(forKey: task.taskIdentifier) ?? Data()
        if ignored.remove(task.taskIdentifier) != nil { return }
        guard let id = task.taskDescription, let item = items.first(where: { $0.id == id }) else { return }
        active.removeValue(forKey: id)
        do {
            if let error { throw error }
            guard let http = task.response as? HTTPURLResponse else { throw PhotoAppError.message("Respuesta de subida inválida.") }
            if http.statusCode == 409 {
                // A duplicate disappeared while queued; re-export and check before retrying.
                try remove(item); onChange?(); return
            }
            guard (200..<300).contains(http.statusCode) else {
                let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                throw PhotoAppError.server(http.statusCode, body?["error"] as? String ?? "Error HTTP \(http.statusCode) al subir.")
            }
            let receipt = try JSONDecoder().decode(UploadReceipt.self, from: data)
            try receipt.validate()
            let rejection = receipt.rejected?.first
            let state = rejection == nil ? (receipt.imported == 1 ? "new" : "existing") : "failed"
            let entry = PhotoOutcome(session: item.session, index: item.index, assetID: item.assetID,
                                     name: item.name, state: state, detail: rejection?.error ?? "")
            // Write the receipt before deleting the body. A crash can replay safely with the same batch.
            try ImportJournal().append(entry)
            onOutcome?(entry)
            try remove(item)
            onChange?()
        } catch { onError?(error) } // Keep body and batch receipt key for an explicit/scheduled retry.
    }
    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        DispatchQueue.main.async {
            if (self.responses[dataTask.taskIdentifier]?.count ?? 0) + data.count <= 1024 * 1024 {
                self.responses[dataTask.taskIdentifier, default: Data()].append(data)
            } else { dataTask.cancel() }
        }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        DispatchQueue.main.async { self.complete(task, error: error) }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                               totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        DispatchQueue.main.async {
            if totalBytesExpectedToSend > 0, let id = task.taskDescription, let item = self.items.first(where: { $0.id == id }) {
                self.onProgress?(item.name, min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
            }
        }
    }
    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { let handler = self.eventsCompletion; self.eventsCompletion = nil; handler?() }
    }
}
