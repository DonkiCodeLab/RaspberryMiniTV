import Foundation
import Security

struct PairingLink: Equatable {
    let server: URL
    let code: String

    init(_ text: String) throws {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "minitvphotos", parts.host == "pair", parts.path.isEmpty,
              parts.user == nil, parts.password == nil, parts.fragment == nil,
              let items = parts.queryItems, items.count == 3,
              Set(items.map(\.name)) == Set(["v", "server", "code"]),
              items.first(where: { $0.name == "v" })?.value == "1",
              let address = items.first(where: { $0.name == "server" })?.value,
              let url = URL(string: address), let serverParts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              ["http", "https"].contains(serverParts.scheme), let host = serverParts.host, !host.isEmpty,
              !["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].contains(host),
              serverParts.user == nil, serverParts.password == nil, serverParts.query == nil,
              serverParts.fragment == nil, ["", "/"].contains(serverParts.path),
              serverParts.port == nil || (1...65535).contains(serverParts.port!),
              let code = items.first(where: { $0.name == "code" })?.value,
              code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            throw PhotoAppError.message("Este QR no es un enlace válido de MiniTV Fotos. Genera uno en Dashboard → Subidas → Fotos.")
        }
        self.server = url
        self.code = code
    }
}

enum PhotoAppError: LocalizedError {
    case message(String)
    case server(Int, String)
    var errorDescription: String? {
        switch self { case .message(let text), .server(_, let text): return text }
    }
    var isUnauthorized: Bool { if case .server(401, _) = self { return true }; return false }
}

struct Connection: Codable {
    let server: URL
    let token: String
    let expiresAt: Double
    var expired: Bool { expiresAt <= Date().timeIntervalSince1970 }
}

enum ConnectionVault {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "MiniTVFotos", kSecAttrAccount as String: "photo-upload"]
    static func load() -> Connection? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching((query.merging([kSecReturnData as String: true]) { _, new in new }) as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Connection.self, from: data)
    }
    static func save(_ connection: Connection) throws {
        let data = try JSONEncoder().encode(connection)
        let attributes = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as [String: Any]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else {
                throw PhotoAppError.message("No se ha podido guardar la conexión en el llavero del iPhone.")
            }
        } else if status != errSecSuccess { throw PhotoAppError.message("No se ha podido actualizar la conexión segura.") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
