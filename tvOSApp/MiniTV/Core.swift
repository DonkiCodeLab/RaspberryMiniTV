import Foundation

/// The server has independently versioned sections; tolerate missing optional metadata.
enum JSON: Codable, Equatable, Sendable {
    case object([String: JSON]), array([JSON]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    subscript(_ key: String) -> JSON { object[key] ?? .null }
    var object: [String: JSON] { if case .object(let v) = self { return v }; return [:] }
    var array: [JSON] { if case .array(let v) = self { return v }; return [] }
    var string: String {
        if case .string(let v) = self { return v }
        if case .number(let v) = self { return v.isFinite && v == v.rounded() ? String(format: "%.0f", v) : String(v) }
        return ""
    }
    var double: Double { if case .number(let v) = self { return v }; return Double(string) ?? 0 }
    var int: Int { let value = double; return value.isFinite && value > Double(Int.min) && value < Double(Int.max) ? Int(value) : 0 }
    var bool: Bool { if case .bool(let v) = self { return v }; return false }
    static func text(_ v: String) -> JSON { .string(v) }
}

struct TVError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

struct ServerAddress: Equatable, Sendable {
    let url: URL
    init(_ input: String) throws {
        var value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.contains("://") { value = "http://" + value }
        guard var parts = URLComponents(string: value),
              ["http", "https"].contains(parts.scheme?.lowercased() ?? ""),
              let host = parts.host, !host.isEmpty, !host.contains(where: { $0.isWhitespace }),
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              parts.port == nil || (1...65535).contains(parts.port!) else {
            throw TVError("Introduce solo la dirección de MiniTV, por ejemplo http://192.168.1.50:5050.")
        }
        if parts.port == nil && parts.scheme == "http" { parts.port = 5050 }
        parts.path = ""
        guard let url = parts.url else { throw TVError("La dirección no es válida.") }
        self.url = url
    }
    func endpoint(_ path: String, query: [String: String] = [:]) -> URL {
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        parts.path = path.hasPrefix("/") ? path : "/" + path
        parts.queryItems = query.isEmpty ? nil : query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        return parts.url!
    }
    func owns(_ candidate: URL) -> Bool {
        func port(_ value: URL) -> Int { value.port ?? (value.scheme == "https" ? 443 : 80) }
        return candidate.scheme?.lowercased() == url.scheme?.lowercased()
            && candidate.host?.lowercased() == url.host?.lowercased() && port(candidate) == port(url)
    }
}

func profileKey(_ kind: String, _ id: String) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    return String(data: try! encoder.encode([kind, id]), encoding: .utf8)!
}

enum MediaKind: String, CaseIterable, Identifiable, Sendable {
    case movie, series, book, game
    var id: String { rawValue }
    var title: String {
        switch self { case .movie: return "Películas"; case .series: return "Series"; case .book: return "Libros"; case .game: return "Juegos" }
    }
    var symbol: String {
        switch self { case .movie: return "film"; case .series: return "tv"; case .book: return "books.vertical"; case .game: return "gamecontroller" }
    }
}

struct MediaItem: Identifiable, Hashable, Sendable {
    var id: String { kind.rawValue + ":" + path }
    let kind: MediaKind
    let path: String
    var title: String
    var subtitle = ""
    var overview = ""
    var artwork = ""
    var tmdbID = 0
    var format = ""
    var episodes: [Episode] = []
    var markKey: String { profileKey(kind.rawValue, kind == .series && tmdbID > 0 ? String(tmdbID) : path) }
    var progressKey: String { profileKey(kind == .book ? (format == "epub" ? "tv-book" : "book") : "video", path) }
}

struct Episode: Identifiable, Hashable, Sendable {
    var id: String { path }
    let code: String
    let path: String
    let title: String
    let season: Int
    let number: Int
    var progressKey: String { profileKey("video", path) }
    func markKey(series: MediaItem) -> String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        let value = JSON.array([.text(series.tmdbID > 0 ? String(series.tmdbID) : series.path), .number(Double(season))])
        return profileKey("season", String(data: try! encoder.encode(value), encoding: .utf8)!)
    }
}

enum Catalog {
    static func decode(_ root: JSON, summaries: JSON = .null) -> [MediaItem] {
        let library = root["mediaLibrary"]
        var result: [MediaItem] = []
        let movies = root["movieRootFiles"].array + root["movieDirectories"].array.flatMap { $0["videos"].array }
        for entry in movies {
            let path = entry["relativePath"].string
            guard !path.isEmpty else { continue }
            let profile = library["movies"][path]
            let tmdb = max(profile["tmdbId"].int, entry["tmdbId"].int)
            let summary = summaries["movies"][String(tmdb)]
            result.append(MediaItem(kind: .movie, path: path,
                title: first(profile["name"].string, entry["name"].string, summary["name"].string, fileTitle(entry["file"].string, path)),
                subtitle: first(summary["releaseDate"].string, profile["year"].string),
                overview: profile["description"].string,
                artwork: artwork(profile, summary), tmdbID: tmdb))
        }
        for entry in root["directories"].array {
            let path = entry["relativePath"].string
            guard !path.isEmpty else { continue }
            let profile = library["series"][path]
            let tmdb = max(profile["tmdbId"].int, entry["tmdbId"].int)
            let summary = summaries["series"][String(tmdb)]
            result.append(MediaItem(kind: .series, path: path,
                title: first(profile["name"].string, entry["name"].string, path),
                subtitle: "\(entry["videos"].array.count) episodios",
                overview: profile["description"].string, artwork: artwork(profile, summary), tmdbID: tmdb,
                episodes: entry["videos"].array.compactMap(episode)))
        }
        if !root["rootFiles"].array.isEmpty {
            result.append(MediaItem(kind: .series, path: "TVShows", title: "Episodios sin carpeta",
                                    episodes: root["rootFiles"].array.compactMap(episode)))
        }
        for kind in [MediaKind.book, .game] {
            for entry in root[kind == .book ? "books" : "games"].array {
                let path = entry["relativePath"].string
                guard !path.isEmpty else { continue }
                result.append(MediaItem(kind: kind, path: path,
                    title: first(entry["name"].string, fileTitle(entry["file"].string, path)),
                    subtitle: first(entry["author"].string, entry["platformName"].string),
                    overview: entry["description"].string,
                    artwork: first(entry["coverUrl"].string, entry["coverImage"].string),
                    format: entry["format"].string.lowercased()))
            }
        }
        var seen = Set<String>()
        return result.filter { seen.insert($0.id).inserted }.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }
    static func first(_ values: String...) -> String { values.first { !$0.isEmpty } ?? "" }
    static func fileTitle(_ name: String, _ path: String) -> String { ((name.isEmpty ? path : name) as NSString).lastPathComponent.replacingOccurrences(of: "\\.[^.]+$", with: "", options: .regularExpression) }
    static func artwork(_ profile: JSON, _ summary: JSON) -> String {
        let saved = first(profile["heroImage"].string, profile["posterImage"].string)
        if !saved.isEmpty { return saved }
        let poster = summary["posterPath"].string
        return poster.isEmpty ? "" : "/tmdb/images/" + (poster as NSString).lastPathComponent
    }
    static func episode(_ value: JSON) -> Episode? {
        guard !value["relativePath"].string.isEmpty else { return nil }
        return Episode(code: value["id"].string, path: value["relativePath"].string,
                       title: first(value["name"].string, fileTitle(value["file"].string, value["relativePath"].string)),
                       season: value["seasonNumber"].int, number: value["episodeNumber"].int)
    }
}
