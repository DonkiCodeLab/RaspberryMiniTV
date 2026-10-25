import Foundation

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    precondition(condition(), message)
}
func rejects(_ text: String) {
    do { _ = try PairingLink(text); fatalError("Accepted invalid pairing: \(text)") } catch {}
}
let code = String(repeating: "a", count: 43)
let pair = try PairingLink("minitvphotos://pair?v=1&server=http%3A%2F%2F192.168.1.50%3A5050&code=\(code)")
check(pair.server.absoluteString == "http://192.168.1.50:5050", "Lost server address")
check(pair.code == code, "Lost code")
for value in ["http://localhost:5050", "http://127.0.0.1", "http://[::1]", "file:///tmp/a", "javascript:alert(1)",
              "http://user:secret@192.168.1.50", "http://192.168.1.50/private", "http://192.168.1.50?pin=1234", "http://192.168.1.50#test"] {
    var components = URLComponents(string: "minitvphotos://pair")!
    components.queryItems = [.init(name: "v", value: "1"), .init(name: "server", value: value), .init(name: "code", value: code)]
    rejects(components.string!)
}
rejects("minitvphotos://pair?v=2&server=http%3A%2F%2F192.168.1.50&code=\(code)")
rejects("minitvphotos://pair?v=1&server=http%3A%2F%2F192.168.1.50&code=bad")
rejects("minitvphotos://pair?v=1&server=http%3A%2F%2F192.168.1.50&code=\(code)&code=\(code)")
rejects("minitvphotos://pair?v=1&server=http%3A%2F%2F192.168.1.50&code=\(code)#fragment")
print("PASS: QR validation, destination and port, version, duplicate parameters, credential and scheme rejection")

let directory = FileManager.default.temporaryDirectory.appendingPathComponent("minitv-journal-test-" + UUID().uuidString)
defer { try? FileManager.default.removeItem(at: directory) }
let journal = try ImportJournal(directory: directory)
let job = ImportJob(id: "session-1", server: pair.server, assetIDs: ["photo-a", "photo-b", "photo-c"])
try journal.start(job)
let first = PhotoOutcome(session: job.id, index: 0, assetID: "photo-a", name: "IMG_0001.HEIC", state: "new", detail: "")
try journal.append(first)
try journal.append(first)
let log = directory.appendingPathComponent("results.jsonl")
let file = try FileHandle(forWritingTo: log)
try file.seekToEnd(); try file.write(contentsOf: Data("{\"partial\":".utf8)); try file.close()
try journal.append(PhotoOutcome(session: job.id, index: 1, assetID: "photo-b", name: "=danger.jpg", state: "existing", detail: ""))
let (restored, outcomes) = try ImportJournal(directory: directory).load()
check(restored?.assetIDs == job.assetIDs, "Lost queued assets")
check(outcomes.count == 2 && outcomes[0]?.state == "new" && outcomes[1]?.state == "existing", "Duplicate or truncated receipts broke resume")
let report = try journal.report(outcomes)
let csv = try String(contentsOf: report, encoding: .utf8)
check(csv.contains("'=danger.jpg"), "CSV formula injection")
try? FileManager.default.removeItem(at: report)
let next = ImportJob(id: "session-2", server: pair.server, assetIDs: ["different-photo"])
try journal.start(next)
try journal.append(first) // Simulate a stale receipt: a new job must ignore it.
let (_, fresh) = try journal.load()
check(fresh.isEmpty, "Different import sessions mixed")
print("PASS: durable resume, idempotent outcomes, partial-record recovery, CSV escaping, session isolation")

let outbox = try UploadOutbox(directory: directory.appendingPathComponent("Transfers"))
let temporaryBody = directory.appendingPathComponent("temporary.multipart")
let originalBytes = Data("original photo bytes and manifest".utf8)
try originalBytes.write(to: temporaryBody)
let body = try outbox.stage(temporaryBody, id: "upload-1")
let pending = PendingUpload(id: "upload-1", session: job.id, index: 0, assetID: "photo-a", name: "IMG_0001.HEIC",
                            server: job.server, bodyName: body.lastPathComponent, contentType: "multipart/form-data; boundary=test", size: Int64(originalBytes.count))
try outbox.save([pending])
let recoveredOutbox = try UploadOutbox(directory: directory.appendingPathComponent("Transfers"))
let restoredQueue = try recoveredOutbox.load()
check(restoredQueue.count == 1 && restoredQueue[0].session == job.id, "Lost background queue after relaunch")
let recoveredBytes = try Data(contentsOf: recoveredOutbox.body(for: restoredQueue[0]))
check(recoveredBytes == originalBytes, "Background upload body changed")
let orphan = recoveredOutbox.directory.appendingPathComponent("interrupted.multipart")
try Data([1, 2, 3]).write(to: orphan)
try recoveredOutbox.cleanOrphans(keeping: restoredQueue)
check(!FileManager.default.fileExists(atPath: orphan.path), "Interrupted staging file leaked disk space")
check(FileManager.default.fileExists(atPath: body.path), "Cleanup removed a queued original")
let indexText = try String(contentsOf: directory.appendingPathComponent("Transfers/outbox.json"), encoding: .utf8)
check(!indexText.contains("token") && !indexText.contains("Authorization"), "Credentials leaked into the queue index")
try recoveredOutbox.save([])
let emptyQueue = try recoveredOutbox.load()
check(emptyQueue.isEmpty, "Confirmed background upload retained in index")
print("PASS: background outbox survives relaunch with exact bytes, session identity and no plaintext credential")
