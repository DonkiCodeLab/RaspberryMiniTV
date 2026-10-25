import Foundation

struct PendingUpload: Codable, Identifiable {
    let id: String
    let session: String
    let index: Int
    let assetID: String
    let name: String
    let server: URL
    let bodyName: String
    let contentType: String
    let size: Int64
}

/// Durable staging area. Original photos never leave this directory until a server receipt is saved.
final class UploadOutbox {
    let directory: URL
    private var indexURL: URL { directory.appendingPathComponent("outbox.json") }
    init(directory: URL? = nil) throws {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MiniTVFotos/Transfers")
        try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        var url = self.directory, values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: self.directory.path)
        #endif
    }
    func load() throws -> [PendingUpload] {
        guard FileManager.default.fileExists(atPath: indexURL.path) else { return [] }
        return try JSONDecoder().decode([PendingUpload].self, from: Data(contentsOf: indexURL))
    }
    func save(_ items: [PendingUpload]) throws {
        let data = try JSONEncoder().encode(items)
        #if os(iOS)
        try data.write(to: indexURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: indexURL, options: .atomic)
        #endif
    }
    func body(for item: PendingUpload) -> URL { directory.appendingPathComponent(item.bodyName) }
    func cleanOrphans(keeping items: [PendingUpload]) throws {
        let referenced = Set(items.map(\.bodyName))
        for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            where file.pathExtension == "multipart" && !referenced.contains(file.lastPathComponent) {
            try FileManager.default.removeItem(at: file)
        }
    }
    func stage(_ temporary: URL, id: String) throws -> URL {
        let url = directory.appendingPathComponent(id + ".multipart")
        try FileManager.default.moveItem(at: temporary, to: url)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
        return url
    }
}
