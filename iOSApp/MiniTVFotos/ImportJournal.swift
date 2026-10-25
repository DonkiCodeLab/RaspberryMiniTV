import Foundation

struct ImportJob: Codable {
    let id: String
    let server: URL
    let assetIDs: [String]
}

struct PhotoOutcome: Codable, Identifiable {
    let session: String
    let index: Int
    let assetID: String
    let name: String
    let state: String
    let detail: String
    var id: Int { index }
    var label: String { state == "new" ? "Nueva" : state == "existing" ? "Ya estaba" : "Fallida" }
}

final class ImportJournal {
    private let directory: URL
    private var jobURL: URL { directory.appendingPathComponent("job.json") }
    private var logURL: URL { directory.appendingPathComponent("results.jsonl") }
    init(directory: URL? = nil) throws {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MiniTVFotos")
        try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: self.directory.path)
        #endif
    }
    func load() throws -> (ImportJob?, [Int: PhotoOutcome]) {
        guard FileManager.default.fileExists(atPath: jobURL.path) else { return (nil, [:]) }
        let job = try JSONDecoder().decode(ImportJob.self, from: Data(contentsOf: jobURL))
        let log = (try? Data(contentsOf: logURL)) ?? Data()
        var outcomes: [Int: PhotoOutcome] = [:]
        for line in log.split(separator: 10) {
            if let entry = try? JSONDecoder().decode(PhotoOutcome.self, from: Data(line)),
               entry.session == job.id, job.assetIDs.indices.contains(entry.index),
               job.assetIDs[entry.index] == entry.assetID { outcomes[entry.index] = entry }
        }
        return (job, outcomes)
    }
    func start(_ job: ImportJob) throws {
        try JSONEncoder().encode(job).write(to: jobURL, options: .atomic)
        // Each result carries its session: a crash between these writes cannot mix imports.
        try Data().write(to: logURL, options: .atomic)
    }
    func append(_ outcome: PhotoOutcome) throws {
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        let file = try FileHandle(forWritingTo: logURL)
        defer { try? file.close() }
        try file.seekToEnd()
        // A leading newline isolates a partial last record after an interruption.
        try file.write(contentsOf: Data([10]) + JSONEncoder().encode(outcome) + Data([10]))
        try file.synchronize()
    }
    func report(_ outcomes: [Int: PhotoOutcome]) throws -> URL {
        func quoted(_ value: String) -> String {
            // Prevent spreadsheet formula interpretation when opening the CSV.
            let safe = ["=", "+", "-", "@", "\t", "\r"].contains(String(value.prefix(1))) ? "'" + value : value
            return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        let lines = outcomes.values.sorted { $0.index < $1.index }.map {
            [$0.name, $0.label, $0.detail, $0.assetID].map(quoted).joined(separator: ",")
        }
        let csv = "\u{FEFF}Foto,Resultado,Detalle,Identificador\r\n" + lines.joined(separator: "\r\n")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MiniTV-Fotos-informe.csv")
        try Data(csv.utf8).write(to: url, options: .atomic)
        return url
    }
}
