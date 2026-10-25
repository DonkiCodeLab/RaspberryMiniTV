import SwiftUI
import Photos
import BackgroundTasks

@MainActor
final class ImportModel: ObservableObject {
    static let shared = ImportModel()
    static let processingIdentifier = "com.donkicodelab.minitvphotos.prepare"
    @Published var connection = ConnectionVault.load()
    @Published var pendingPair: PairingLink?
    @Published var connecting = false
    @Published var running = false
    @Published var preparing = false
    @Published var limited = false
    @Published var message = "Escanea el QR del dashboard para empezar."
    @Published var error: String?
    @Published var backgroundNotice: String?
    @Published var fileName = ""
    @Published var fileProgress: Double?
    @Published var total = 0
    @Published var imported = 0
    @Published var existing = 0
    @Published var failed = 0
    @Published var queued = 0
    @Published var recent: [PhotoOutcome] = []
    @Published var reportURL: URL?
    private var job: ImportJob?
    private var outcomes: [Int: PhotoOutcome] = [:]
    private var journal: ImportJournal?
    private var worker: Task<Void, Never>?
    private var cursor = 0
    private var retryBlocked = false
    private var backgroundWindow: UIBackgroundTaskIdentifier = .invalid
    private var processingTask: BGProcessingTask?
    private let transfers = BackgroundTransfers.shared
    private var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: "importEnabled") }
        set { UserDefaults.standard.set(newValue, forKey: "importEnabled") }
    }
    var completed: Int { imported + existing + failed }
    var percentage: Double { total > 0 ? Double(completed) / Double(total) : 0 }
    var hasJob: Bool { job != nil }
    var canResume: Bool { job != nil && completed < total && job?.server == connection?.server }
    var connected: Bool { connection != nil && connection?.expired == false }

    init() {
        do {
            let journal = try ImportJournal(); self.journal = journal
            let (job, outcomes) = try journal.load()
            self.job = job; self.outcomes = outcomes
            refreshCounts()
            if job != nil { message = completed == total ? "Última importación guardada." : "Importación guardada. Recuperando la cola…" }
        } catch { self.error = "No se ha podido leer el registro: \(error.localizedDescription)" }
        // Background URLSession uses the durable Transfers directory, never these scratch files.
        if let files = try? FileManager.default.contentsOfDirectory(at: FileManager.default.temporaryDirectory, includingPropertiesForKeys: nil) {
            for file in files where file.lastPathComponent.hasPrefix("minitv-photo-") || file.lastPathComponent.hasPrefix("minitv-body-") {
                try? FileManager.default.removeItem(at: file)
            }
        }
        transfers.onChange = { [weak self] in self?.transfersChanged() }
        transfers.onOutcome = { [weak self] in self?.apply($0) }
        transfers.onProgress = { [weak self] name, progress in
            guard let self, self.running else { return }
            self.fileName = name; self.fileProgress = progress
        }
        transfers.onError = { [weak self] in self?.transferFailed($0) }
        queued = transfers.items.count
        if transfers.ready { Task { self.transfersChanged() } }
    }
    func receive(_ text: String) {
        guard !running && !connecting && !preparing && worker == nil else { error = "Pausa la importación antes de cambiar de conexión."; return }
        do { pendingPair = try PairingLink(text); error = nil } catch { self.error = error.localizedDescription }
    }
    func connect() async {
        guard let pair = pendingPair, !connecting else { return }
        connecting = true; error = nil
        defer { connecting = false }
        do {
            let clientID = UserDefaults.standard.string(forKey: "clientID") ?? UUID().uuidString
            UserDefaults.standard.set(clientID, forKey: "clientID")
            let next = try await PhotoAPI(server: pair.server).claim(code: pair.code, clientID: clientID, deviceName: UIDevice.current.name)
            try ConnectionVault.save(next)
            connection = next; pendingPair = nil
            message = "Conectado. Elige cuándo empezar a exportar tus fotos."
        } catch { self.error = connectionError(error) }
    }
    func disconnect() async {
        guard !running, !preparing, let connection else { return }
        connecting = true
        defer { connecting = false }
        pause()
        _ = try? await PhotoAPI(server: connection.server, token: connection.token).json("pictures/mobile/disconnect", body: [:])
        ConnectionVault.clear(); self.connection = nil
    }
    private func authorization() async throws {
        var status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if status == .notDetermined && UIApplication.shared.applicationState != .background {
            status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        }
        limited = status == .limited
        guard status == .authorized || status == .limited else {
            throw PhotoAppError.message("Permite el acceso a Fotos en Ajustes para exportar tu fototeca.")
        }
    }
    func prepare(onlyFailures: Bool = false) async {
        guard !running, !preparing, worker == nil, transfers.ready, connected, let connection, let journal else { return }
        preparing = true; error = nil
        defer { preparing = false }
        do {
            try await authorization()
            var ids: [String] = []
            if onlyFailures { ids = outcomes.values.filter { $0.state == "failed" }.sorted { $0.index < $1.index }.map(\.assetID) }
            else {
                let options = PHFetchOptions()
                options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
                PHAsset.fetchAssets(with: .image, options: options).enumerateObjects { asset, _, _ in ids.append(asset.localIdentifier) }
            }
            guard !ids.isEmpty else { throw PhotoAppError.message("No hay fotos accesibles para exportar. Revisa los permisos de Fotos.") }
            let next = ImportJob(id: UUID().uuidString, server: connection.server, assetIDs: ids)
            try transfers.discard()
            try journal.start(next)
            job = next; outcomes = [:]; cursor = 0; reportURL = nil; refreshCounts()
            start()
        } catch { self.error = error.localizedDescription }
    }
    func start() {
        guard connected, canResume, worker == nil else { return }
        enabled = true; retryBlocked = false; error = nil; reportURL = nil
        running = true
        transfers.resume()
        scheduleProcessing()
        kick()
    }
    func pause() {
        enabled = false; running = false
        preparing = worker != nil
        worker?.cancel(); transfers.pause()
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.processingIdentifier)
        message = "Importación pausada. Los archivos preparados y el progreso están guardados."
        finishProcessing(success: true)
        endWindow()
    }
    func enteredBackground() {
        guard enabled else { return }
        scheduleProcessing(); beginWindow(); kick()
    }
    func becameActive() {
        endWindow()
        connection = ConnectionVault.load()
        if enabled { retryBlocked = false; transfers.resume(); transfersChanged() }
    }
    func handleProcessing(_ task: BGProcessingTask) {
        processingTask = task
        task.expirationHandler = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.retryBlocked = true; self.worker?.cancel()
                self.scheduleProcessing(); self.finishProcessing(success: false)
            }
        }
        guard enabled, connected, canResume else { finishProcessing(success: true); return }
        retryBlocked = false; transfers.resume(); kick()
        if worker == nil { finishProcessing(success: true) }
    }
    func makeReport() {
        do { reportURL = try journal?.report(outcomes) } catch { self.error = error.localizedDescription }
    }
    private func refreshCounts() {
        total = job?.assetIDs.count ?? 0
        imported = outcomes.values.filter { $0.state == "new" }.count
        existing = outcomes.values.filter { $0.state == "existing" }.count
        failed = outcomes.values.filter { $0.state == "failed" }.count
        recent = Array(outcomes.values.sorted { $0.index > $1.index }.prefix(50))
    }
    private func apply(_ entry: PhotoOutcome) {
        guard entry.session == job?.id, outcomes[entry.index] == nil else { return }
        outcomes[entry.index] = entry
        if entry.state == "new" { imported += 1 } else if entry.state == "existing" { existing += 1 } else { failed += 1 }
        recent.insert(entry, at: 0); if recent.count > 50 { recent.removeLast() }
        reportURL = nil
    }
    private func record(index: Int, name: String, detail: String) throws {
        guard let job, let journal else { throw PhotoAppError.message("El registro de importación no está disponible.") }
        let entry = PhotoOutcome(session: job.id, index: index, assetID: job.assetIDs[index], name: name, state: "failed", detail: detail)
        try journal.append(entry); apply(entry)
    }
    private func transfersChanged() {
        queued = transfers.items.count
        if hasJob && completed == total && queued == 0 {
            enabled = false; running = false; fileName = ""; fileProgress = nil
            backgroundNotice = nil
            message = failed > 0 ? "Importación terminada con incidencias." : "¡Todas las fotos comprobadas!"
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.processingIdentifier)
            finishProcessing(success: true); endWindow(); return
        }
        if enabled && !retryBlocked { running = true; kick() }
    }
    private func nextIndex() -> Int? {
        guard let job, total > 0 else { return nil }
        for _ in 0..<total {
            let index = cursor % total; cursor = (index + 1) % total
            if outcomes[index] == nil && !transfers.contains(session: job.id, index: index) { return index }
        }
        return nil
    }
    private func kick() {
        if enabled && !connected { transferFailed(PhotoAppError.server(401, "El enlace ha caducado. Escanea otro QR para continuar.")); return }
        guard enabled, !retryBlocked, worker == nil, transfers.ready, transfers.hasCapacity, connected, canResume else { return }
        guard let index = nextIndex() else { return }
        if UIApplication.shared.applicationState == .background { beginWindow() }
        worker = Task { await fillQueue(starting: index) }
    }
    private func fillQueue(starting: Int) async {
        defer {
            worker = nil; preparing = false
            if enabled { scheduleProcessing() }
            finishProcessing(success: !retryBlocked)
            if UIApplication.shared.applicationState == .background { endWindow() }
            transfersChanged()
        }
        guard let job, let connection else { return }
        let api = PhotoAPI(server: connection.server, token: connection.token)
        do {
            try await authorization()
            _ = try await api.json("pictures/mobile/session")
            var first: Int? = starting
            while enabled && transfers.hasCapacity {
                let candidate = first ?? nextIndex(); first = nil
                guard let index = candidate else { break }
                try Task.checkCancellation()
                let id = job.assetIDs[index]
                guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
                    try record(index: index, name: "Foto no disponible", detail: "Se ha eliminado o ya no está entre las fotos autorizadas.")
                    continue
                }
                let name = (try? PhotoExporter.resource(for: asset).originalFilename) ?? "Foto \(index + 1)"
                message = "Preparando y enviando fotos · \(queued) en cola"
                let photo: ExportedPhoto
                do {
                    photo = try await PhotoExporter.export(asset) { [weak self] progress in
                        Task { @MainActor in if self?.running == true { self?.message = "Descargando original de iCloud · \(Int(progress * 100)) %" } }
                    }
                } catch {
                    try Task.checkCancellation()
                    if UIApplication.shared.applicationState == .background && !(error is PhotoAppError) {
                        retryBlocked = true
                        message = "iOS reintentará preparar el original pendiente; las fotos en cola siguen enviándose."
                        return
                    }
                    try record(index: index, name: name, detail: error.localizedDescription)
                    continue
                }
                defer { try? FileManager.default.removeItem(at: photo.url) }
                try Task.checkCancellation()
                let missing = try await api.isMissing(photo.digest)
                let manifest = try PhotoExporter.manifest(asset: asset, photo: photo, session: job.id, index: index, missing: missing)
                let (body, contentType) = try await api.prepareUpload(photo: photo, manifest: manifest, includeFile: missing)
                defer { try? FileManager.default.removeItem(at: body) }
                try Task.checkCancellation()
                try transfers.enqueue(body: body, contentType: contentType, job: job, index: index, name: photo.name)
            }
            message = queued > 0 ? "Subidas preparadas · pueden continuar en segundo plano." : message
        } catch {
            if Task.isCancelled {
                if enabled { retryBlocked = UIApplication.shared.applicationState == .background; message = "iOS continuará la preparación cuando conceda tiempo en segundo plano." }
            } else { transferFailed(error) }
        }
    }
    private func transferFailed(_ error: Error) {
        retryBlocked = true; worker?.cancel(); transfers.pause(); running = false
        self.error = connectionError(error)
        message = "Conservamos el progreso y la cola. Puedes continuar para reintentar."
        if (error as? PhotoAppError)?.isUnauthorized == true {
            enabled = false; transfers.resetTasks(); ConnectionVault.clear(); connection = nil
        } else if enabled { scheduleProcessing() }
    }
    private func beginWindow() {
        guard backgroundWindow == .invalid, processingTask == nil else { return }
        backgroundWindow = UIApplication.shared.beginBackgroundTask(withName: "Preparar fotos MiniTV") { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.retryBlocked = true; self.worker?.cancel()
                self.message = "La cola seguirá subiendo; iOS programará la preparación de más fotos."
                self.scheduleProcessing(); self.endWindow()
            }
        }
    }
    private func endWindow() {
        if backgroundWindow != .invalid { UIApplication.shared.endBackgroundTask(backgroundWindow); backgroundWindow = .invalid }
    }
    private func finishProcessing(success: Bool) {
        let task = processingTask; processingTask = nil; task?.setTaskCompleted(success: success)
    }
    private func scheduleProcessing() {
        guard enabled, hasJob, completed < total else { return }
        let request = BGProcessingTaskRequest(identifier: Self.processingIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60)
        do { try BGTaskScheduler.shared.submit(request); backgroundNotice = nil }
        catch { backgroundNotice = "iOS no permite programar más preparación en segundo plano ahora. Las subidas ya preparadas siguen en su cola; abre la app para preparar el resto." }
    }
    private func connectionError(_ error: Error) -> String {
        if let error = error as? URLError {
            return "No se pudo conectar con la MiniTV: \(error.localizedDescription). Comprueba la misma Wi-Fi, la IP y el puerto, y el permiso Red local en Ajustes."
        }
        return error.localizedDescription
    }
}
