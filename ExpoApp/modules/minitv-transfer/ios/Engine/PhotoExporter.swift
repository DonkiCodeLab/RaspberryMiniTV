import Foundation
import Photos
import CryptoKit

struct ExportedPhoto: Sendable {
    let url: URL
    let name: String
    let digest: String
}

// PhotoKit delivers data serially. Keep only a chunk in memory, even for a large library.
private final class ResourceRead: @unchecked Sendable {
    private let lock = NSLock()
    private var requestID: PHAssetResourceDataRequestID?
    private var cancelled = false
    func set(_ id: PHAssetResourceDataRequestID) {
        lock.lock(); requestID = id; let cancel = cancelled; lock.unlock()
        if cancel { PHAssetResourceManager.default().cancelDataRequest(id) }
    }
    func cancel() {
        lock.lock(); cancelled = true; let id = requestID; lock.unlock()
        if let id { PHAssetResourceManager.default().cancelDataRequest(id) }
    }
}

enum PhotoExporter {
    static let supported = Set(["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "avif"])
    static func resource(for asset: PHAsset) throws -> PHAssetResource {
        let resources = PHAssetResource.assetResources(for: asset)
        let photos = resources.filter { [.photo, .fullSizePhoto, .alternatePhoto].contains($0.type)
            && supported.contains(($0.originalFilename as NSString).pathExtension.lowercased()) }
        guard let resource = photos.first(where: { $0.type == .photo }) ?? photos.first else {
            throw PhotoAppError.message("Formato no compatible. Para RAW se necesita una versión JPEG o HEIC en Fotos.")
        }
        return resource
    }
    static func export(_ asset: PHAsset, progress: @escaping @Sendable (Double) -> Void) async throws -> ExportedPhoto {
        let resource = try resource(for: asset)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("minitv-photo-" + UUID().uuidString)
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let handle = try FileHandle(forWritingTo: url)
        let operation = ResourceRead()
        do {
            let hash: String = try await withTaskCancellationHandler(operation: {
                try Task.checkCancellation()
                return try await withCheckedThrowingContinuation { continuation in
                    let options = PHAssetResourceRequestOptions()
                    options.isNetworkAccessAllowed = true
                    options.progressHandler = progress
                    var hasher = SHA256(), bytes = 0
                    var writeError: Error?
                    let id = PHAssetResourceManager.default().requestData(for: resource, options: options) { data in
                        guard writeError == nil else { return }
                        do {
                            bytes += data.count
                            guard bytes <= 50 * 1024 * 1024 else { throw PhotoAppError.message("Esta foto supera el límite de 50 MB de la MiniTV.") }
                            try handle.write(contentsOf: data)
                            hasher.update(data: data)
                        } catch { writeError = error; operation.cancel() }
                    } completionHandler: { error in
                        do {
                            try handle.close()
                            if let error = writeError ?? error { throw error }
                            guard bytes > 0 else { throw PhotoAppError.message("Fotos ha devuelto un archivo vacío.") }
                            continuation.resume(returning: hasher.finalize().map { String(format: "%02x", $0) }.joined())
                        } catch { continuation.resume(throwing: error) }
                    }
                    operation.set(id)
                }
            }, onCancel: { operation.cancel() })
            try Task.checkCancellation()
            return ExportedPhoto(url: url, name: resource.originalFilename, digest: hash)
        } catch { try? handle.close(); try? FileManager.default.removeItem(at: url); throw error }
    }
    static func manifest(asset: PHAsset, photo: ExportedPhoto, session: String, index: Int, missing: Bool) throws -> Data {
        var meta: [String: Any] = ["appleId": asset.localIdentifier, "appleFavorite": asset.isFavorite,
                                   "albums": [], "keywords": [], "people": []]
        if let date = asset.creationDate { meta["takenAt"] = ISO8601DateFormatter().string(from: date) }
        if let location = asset.location {
            meta["locationKnown"] = true; meta["latitude"] = location.coordinate.latitude; meta["longitude"] = location.coordinate.longitude
        }
        // Existing photos retain their locally edited metadata.
        let record: [String: Any] = missing ? ["metadata": meta, "raw": meta] : ["metadata": NSNull(), "raw": NSNull()]
        return try JSONSerialization.data(withJSONObject: ["session": session, "batch": "\(index)-\(photo.digest)",
            "digests": [photo.digest], "fileIndices": missing ? [0] : [], "records": [record],
            "continueOnError": true, "preserveAlbums": false])
    }
}
