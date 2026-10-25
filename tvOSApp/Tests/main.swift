import Foundation

var assertions = 0
func check(_ condition: Bool, _ message: String) {
    assertions += 1
    if !condition { fatalError(message) }
}
func rejects(_ input: String) { check((try? ServerAddress(input)) == nil, "Invalid address accepted: \(input)") }

let address = try ServerAddress(" 192.168.1.50 ")
check(address.url.absoluteString == "http://192.168.1.50:5050", "Default port")
check(try ServerAddress("https://minitv.example.org").url.absoluteString == "https://minitv.example.org", "HTTPS port")
check(try ServerAddress("http://[::1]:5050").url.host != nil, "IPv6")
for input in ["", "ftp://minitv", "http://u:p@minitv", "http://minitv/path", "http://minitv?pin=1234", "http://minitv#fragment", "http://minitv:0", "http://minitv:99999"] { rejects(input) }
let path = "Movies/Una película #1 & 2.mkv"
let encoded = address.endpoint("/media/stream", query: ["relativePath": path, "pin": "1&2"])
let query = URLComponents(url: encoded, resolvingAgainstBaseURL: false)!.queryItems!
check(query.first { $0.name == "relativePath" }?.value == path, "Query escaping")
check(query.first { $0.name == "pin" }?.value == "1&2", "PIN escaping")
check(!address.owns(URL(string: "http://192.168.1.50:5051/image")!), "Port isolation")
check(!address.owns(URL(string: "https://192.168.1.50:5050/image")!), "Scheme isolation")
check(profileKey("movie", path) == "[\"movie\",\"Movies/Una película #1 & 2.mkv\"]", "Web-compatible marks")
check(JSON.number(1e100).int == 0, "Untrusted integer range")

let fixture = #"""
{
 "movieRootFiles": [{"relativePath":"Movies/a.mp4","file":"a.mp4"},{"relativePath":"Movies/b.mp4","file":"b.mp4"},{"relativePath":"Movies/a.mp4"}],
 "movieDirectories": [{"videos":[{"relativePath":"Movies/Nested/c.mkv","file":"c.mkv"}]}],
 "directories": [{"name":"Los Simpson","relativePath":"TVShows/Simpsons","tmdbId":456,"videos":[{"id":"S01E02","relativePath":"TVShows/Simpsons/S01E02.mkv","file":"S01E02.mkv","seasonNumber":1,"episodeNumber":2}]}],
 "rootFiles": [{"id":"S00E01","relativePath":"TVShows/S00E01.mp4","file":"S00E01.mp4"}],
 "books": [{"name":"Libro","relativePath":"Books/uno.epub","format":"epub"}],
 "games": [{"name":"Juego","relativePath":"Games/uno.gba","platformName":"Game Boy Advance"}],
 "mediaLibrary": {"movies":{"Movies/a.mp4":{"name":"Versión A","tmdbId":10},"Movies/b.mp4":{"name":"Versión B","tmdbId":10}}}
}
"""#
let catalog = Catalog.decode(try JSONDecoder().decode(JSON.self, from: Data(fixture.utf8)))
check(catalog.filter { $0.kind == .movie }.count == 3, "Movie paths are identities, not TMDB IDs")
check(catalog.filter { $0.kind == .series }.count == 2, "Unfiled episodes are accessible")
let series = catalog.first { $0.path == "TVShows/Simpsons" }!
let episode = series.episodes[0]
check(episode.markKey(series: series) == #"["season","[\"456\",1]"]"#, "Season marks match the web")
check(catalog.first { $0.kind == .book }!.progressKey == #"["tv-book","Books/uno.epub"]"#, "EPUB pages cannot overwrite browser CFIs")
let progress = videoProgressPatch(key: episode.progressKey, markKey: episode.markKey(series: series), episode: 2, seconds: 96, duration: 100, ended: false)!
check(progress["marks"][episode.markKey(series: series)]["episodes"]["2"].bool, "Watched episode completion")
check(!progress["marks"][episode.markKey(series: series)]["watched"].bool, "Episode must not mark whole season")
check(videoProgressPatch(key: "x", markKey: "y", episode: nil, seconds: .nan, duration: 100, ended: false) == nil, "Invalid progress rejected")
check(videoProgressPatch(key: "x", markKey: "y", episode: nil, seconds: 0, duration: 0, ended: false) == nil, "No progress before metadata")
check(videoProgressPatch(key: "x", markKey: "y", episode: nil, seconds: 50, duration: 100, ended: false)!["marks"] == .null, "Partial playback does not mark watched")

let cues = WebVTT.parse("WEBVTT\r\n\r\n1\r\n00:00:01.000 --> 00:00:03.000 align:center\r\n<i>Hola &amp; adiós</i>\r\n\r\n00:04.000 --> 00:06.500\r\nOtra línea\r\n\r\nBAD --> WRONG\r\nignored")
check(cues.count == 2, "VTT timings, CRLF and cue settings")
check(WebVTT.text(at: 1.5, in: cues) == "Hola & adiós", "Caption markup")
check(WebVTT.text(at: 3.5, in: cues).isEmpty, "Clear captions in gaps")
check(WebVTT.text(at: 5, in: cues) == "Otra línea", "Forward seek")
check(WebVTT.text(at: 2, in: cues) == "Hola & adiós", "Backward seek")

final class StubProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (code, data) = Self.handler(request)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
let configuration = URLSessionConfiguration.ephemeral
configuration.protocolClasses = [StubProtocol.self]
let client = MiniTVAPI(address: address, pin: "2468", transport: URLSession(configuration: configuration))
StubProtocol.handler = { request in
    check(request.value(forHTTPHeaderField: "X-Web-Pin") == "2468", "Authenticated API")
    check(request.url?.path == "/users/default/state", "API path")
    check(request.httpMethod == "PATCH", "Mutation method")
    return (200, Data(#"{"ok":true}"#.utf8))
}
check(try await client.request("/users/default/state", method: "PATCH", body: .object([:]))["ok"].bool, "API decoding")
StubProtocol.handler = { request in
    check(request.value(forHTTPHeaderField: "X-Web-Pin") == nil, "Never send PIN to external art")
    return (200, Data())
}
_ = try await client.resource(URL(string: "https://covers.example.org/image.jpg")!)
StubProtocol.handler = { _ in (401, Data(#"{"error":"Unauthorized"}"#.utf8)) }
do { _ = try await client.request("/videos"); fatalError("401 accepted") }
catch { check(error.localizedDescription.contains("PIN"), "Actionable authentication error") }
StubProtocol.handler = { _ in (200, Data("<html>wrong server</html>".utf8)) }
do { _ = try await client.request("/videos"); fatalError("HTML accepted") }
catch { check(error.localizedDescription.contains("dirección"), "Actionable wrong-server error") }
print("Passed \(assertions) tvOS core and API assertions")
