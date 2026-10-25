import Foundation

struct SubtitleCue: Equatable {
    let start: Double
    let end: Double
    let text: String
}

enum WebVTT {
    static func parse(_ text: String) -> [SubtitleCue] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        return normalized.components(separatedBy: "\n\n").compactMap { block in
            let lines = block.components(separatedBy: "\n")
            guard let index = lines.firstIndex(where: { $0.contains(" --> ") }) else { return nil }
            let times = lines[index].components(separatedBy: " --> ")
            guard times.count == 2, let start = time(times[0]), let end = time(String(times[1].split(separator: " ").first ?? "")), end > start else { return nil }
            let content = lines.dropFirst(index + 1).joined(separator: "\n")
                .replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
                .replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
                .replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&quot;", with: "\"")
                .replacingOccurrences(of: "&amp;", with: "&")
            return SubtitleCue(start: start, end: end, text: content)
        }.sorted { $0.start < $1.start }
    }
    static func time(_ text: String) -> Double? {
        let parts = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".").split(separator: ":")
        guard (2...3).contains(parts.count) else { return nil }
        var value = 0.0
        for part in parts {
            guard let number = Double(part), number.isFinite, number >= 0 else { return nil }
            value = value * 60 + number
        }
        return value
    }
    static func text(at seconds: Double, in cues: [SubtitleCue]) -> String {
        // Binary search avoids scanning every subtitle at each playback tick.
        var low = 0, high = cues.count
        while low < high { let mid = (low + high) / 2; if cues[mid].start <= seconds { low = mid + 1 } else { high = mid } }
        guard low > 0 else { return "" }
        let cue = cues[low - 1]
        return seconds < cue.end ? cue.text : ""
    }
}

func videoProgressPatch(key: String, markKey: String, episode: Int?, seconds: Double, duration: Double, ended: Bool) -> JSON? {
    guard seconds.isFinite, duration.isFinite, seconds >= 0, duration > 0 else { return nil }
    let complete = ended || seconds / duration >= 0.95
    var payload: [String: JSON] = ["progress": .object([key: .object([
        "kind": .text("video"), "seconds": .number(min(seconds, duration)), "duration": .number(duration),
        "completed": .bool(complete)
    ])])]
    if complete {
        let mark: JSON = episode.map { .object(["episodes": .object([String($0): .bool(true)])]) } ?? .object(["watched": .bool(true)])
        payload["marks"] = .object([markKey: mark])
    }
    return .object(payload)
}
