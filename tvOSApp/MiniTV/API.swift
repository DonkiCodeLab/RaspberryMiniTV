import Foundation
import Security

/// A redirect must never send the household PIN to an artwork/CDN host.
final class SameOriginRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let original = task.originalRequest?.url, let target = request.url,
              original.scheme == target.scheme, original.host == target.host, original.port == target.port else {
            completionHandler(nil); return
        }
        completionHandler(request)
    }
}

struct MiniTVAPI: Sendable {
    let address: ServerAddress
    let pin: String
    let transport: URLSession
    init(address: ServerAddress, pin: String, transport: URLSession = MiniTVAPI.session) {
        self.address = address; self.pin = pin; self.transport = transport
    }
    static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 300
        config.urlCache = URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 0)
        return URLSession(configuration: config, delegate: SameOriginRedirects(), delegateQueue: nil)
    }()

    func request(_ path: String, method: String = "GET", query: [String: String] = [:], body: JSON? = nil) async throws -> JSON {
        var request = URLRequest(url: address.endpoint(path, query: query))
        request.httpMethod = method
        request.setValue(pin, forHTTPHeaderField: "X-Web-Pin")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data = try await data(request)
        do { return try JSONDecoder().decode(JSON.self, from: data) }
        catch { throw TVError("La MiniTV no devolvió los datos esperados. Comprueba la dirección y actualiza DeviceApp.") }
    }

    func data(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await transport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw TVError("La MiniTV no responde.") }
        if http.statusCode == 401 { throw TVError("El PIN ha cambiado o no es correcto. Vuelve a conectar desde Ajustes.") }
        guard (200...299).contains(http.statusCode) else {
            let value = try? JSONDecoder().decode(JSON.self, from: data)
            throw TVError(Catalog.first(value?["error"].string ?? "", value?["errorCode"].string ?? "",
                                       "La petición falló (\(http.statusCode))."))
        }
        return data
    }

    func resourceURL(_ path: String) -> URL? {
        guard !path.isEmpty, let url = URL(string: path, relativeTo: address.url)?.absoluteURL,
              ["http", "https"].contains(url.scheme ?? "") else { return nil }
        if url.host == "image.tmdb.org" {
            return address.endpoint("/tmdb/images/" + url.lastPathComponent)
        }
        return url
    }

    func resource(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        if address.owns(url) { request.setValue(pin, forHTTPHeaderField: "X-Web-Pin") }
        return try await data(request)
    }

    func stream(path: String, copy: String = "") -> URL {
        var query = ["relativePath": path, "pin": pin]
        if !copy.isEmpty { query["browserCopy"] = copy }
        return address.endpoint("/media/stream", query: query)
    }
}

enum PINStore {
    static let service = "com.donkicodelab.minitv.tv"
    static func query(_ server: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: server]
    }
    static func read(_ server: String) -> String? {
        var q = query(server); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ pin: String, server: String) throws {
        let q = query(server)
        let attributes: [String: Any] = [kSecValueData as String: Data(pin.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let update = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        let status = update == errSecItemNotFound ? SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil) : update
        guard status == errSecSuccess else { throw TVError("No se pudo guardar el PIN en el llavero (\(status)).") }
    }
    static func remove(_ server: String) { SecItemDelete(query(server) as CFDictionary) }
}
