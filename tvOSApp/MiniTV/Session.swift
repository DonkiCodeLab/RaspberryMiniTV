import SwiftUI

struct PlaybackRequest: Identifiable {
    let id = UUID()
    let path: String
    let title: String
    let markKey: String
    let episodeNumber: Int?
    let initialSeconds: Double
    let userID: String
    let api: MiniTVAPI
    var progressKey: String { profileKey("video", path) }
}

@MainActor
final class TVSession: ObservableObject {
    @Published var api: MiniTVAPI?
    @Published var items: [MediaItem] = []
    @Published var users: [JSON] = []
    @Published var userID = "default"
    @Published var state: JSON = .null
    @Published var loading = false
    @Published var error: String?
    @Published var notice: String?
    @Published var playback: PlaybackRequest?
    @Published var reader: MediaItem?
    private var generation = UUID()
    var userName: String { users.first { $0["id"].string == userID }?["name"].string ?? "default" }
    var serverName: String { api?.address.url.host ?? "MiniTV" }

    init() {
#if DEBUG
        // Only the local smoke-test server can bypass the pairing screen in Debug.
        if let testURL = ProcessInfo.processInfo.environment["MINITV_UI_TEST_SERVER"],
           let address = try? ServerAddress(testURL), address.url.host == "127.0.0.1" {
            api = MiniTVAPI(address: address, pin: "tvos-fixture"); return
        }
#endif
        let saved = UserDefaults.standard.string(forKey: "minitv.server") ?? ""
        if let address = try? ServerAddress(saved), let pin = PINStore.read(address.url.absoluteString) {
            api = MiniTVAPI(address: address, pin: pin)
            userID = UserDefaults.standard.string(forKey: "minitv.profile." + address.url.absoluteString) ?? "default"
        }
    }

    func connect(address input: String, pin: String) async throws {
        let address = try ServerAddress(input)
        let cleanPIN = pin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanPIN.isEmpty else { throw TVError("Escribe el PIN de acceso a la web de MiniTV.") }
        let candidate = MiniTVAPI(address: address, pin: cleanPIN)
        let auth = try await candidate.request("/web/auth", method: "POST", body: .object(["pin": .text(cleanPIN)]))
        guard auth["ok"].bool else { throw TVError("No se pudo comprobar el PIN.") }
        try PINStore.save(cleanPIN, server: address.url.absoluteString)
        UserDefaults.standard.set(address.url.absoluteString, forKey: "minitv.server")
        generation = UUID(); items = []; state = .null; users = []; error = nil
        userID = UserDefaults.standard.string(forKey: "minitv.profile." + address.url.absoluteString) ?? "default"
        api = candidate
    }

    func disconnect() {
        if let api { PINStore.remove(api.address.url.absoluteString) }
        generation = UUID(); api = nil; items = []; state = .null; users = []; playback = nil; reader = nil
        error = nil; notice = nil; loading = false
        UserDefaults.standard.removeObject(forKey: "minitv.server")
    }

    func reload() async {
        guard let api, !loading else { return }
        let token = generation
        loading = true
        defer { if token == generation { loading = false } }
        do {
            async let catalog = api.request("/videos", query: ["pictures": "0"])
            async let profiles = api.request("/users")
            let (root, people) = try await (catalog, profiles)
            guard token == generation else { return }
            items = Catalog.decode(root)
            users = people["users"].array
            if !users.contains(where: { $0["id"].string == userID }) { userID = "default" }
            await loadProfile()
            // Artwork is optional: offline TMDB metadata must never hide local files.
            if let summaries = try? await api.request("/tmdb/library", query: ["language": "es-ES"]), token == generation {
                items = Catalog.decode(root, summaries: summaries)
            }
        } catch is CancellationError { }
        catch { if token == generation { self.error = error.localizedDescription } }
    }

    func loadProfile() async {
        guard let api else { return }
        let token = generation, profile = userID
        do {
            let value = try await api.request("/users/\(profile)/state")
            guard token == generation, profile == userID else { return }
            state = value
        } catch { if token == generation { self.error = error.localizedDescription } }
    }

    func selectUser(_ id: String) async {
        userID = id; state = .null
        if let api { UserDefaults.standard.set(id, forKey: "minitv.profile." + api.address.url.absoluteString) }
        await loadProfile()
    }

    func favorite(_ item: MediaItem) -> Bool { state["marks"][item.markKey]["favorite"].bool }
    func progress(_ key: String) -> JSON { state["progress"][key] }
    func toggleFavorite(_ item: MediaItem) async {
        await patch(.object(["marks": .object([item.markKey: .object(["favorite": .bool(!favorite(item))])])]))
    }
    func patch(_ value: JSON) async {
        guard let api else { return }
        let token = generation, profile = userID
        do {
            _ = try await api.request("/users/\(profile)/state", method: "PATCH", body: value)
            if token == generation, profile == userID { await loadProfile() }
        } catch { if token == generation { self.error = error.localizedDescription } }
    }

    func play(_ item: MediaItem, episode: Episode? = nil, restart: Bool = false) {
        guard let api else { return }
        let path = episode?.path ?? item.path
        let saved = progress(profileKey("video", path))
        playback = PlaybackRequest(path: path, title: episode.map { item.title + " · " + $0.code } ?? item.title,
            markKey: episode?.markKey(series: item) ?? item.markKey, episodeNumber: episode?.number,
            initialSeconds: restart || saved["completed"].bool ? 0 : saved["seconds"].double,
            userID: userID, api: api)
    }

    func command(_ path: String, body: JSON = .object([:]), success: String) async {
        guard let api else { return }
        do { _ = try await api.request(path, method: "POST", body: body); notice = success }
        catch { self.error = error.localizedDescription }
    }

    var continuing: [MediaItem] {
        items.filter { item in
            if item.kind == .series { return item.episodes.contains { unfinished($0.progressKey) } }
            return [.movie, .book].contains(item.kind) && unfinished(item.progressKey)
        }
    }
    private func unfinished(_ key: String) -> Bool {
        let saved = progress(key)
        return saved["opened"].bool && !saved["completed"].bool
    }
}
