import SwiftUI
import AVKit
import Combine

@MainActor
final class PlaybackModel: ObservableObject {
    let request: PlaybackRequest
    @Published var player: AVPlayer?
    @Published var status = "Comprobando el vídeo…"
    @Published var percent: Double?
    @Published var error: String?
    @Published var progressError: String?
    @Published var tracks: [JSON] = []
    @Published var selectedTrack = ""
    @Published var subtitle = ""
    @Published var subtitleError: String?
    private var cues: [SubtitleCue] = []
    private var timeObserver: Any?
    private var itemObserver: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var ready = false
    private var lastSave = Date.distantPast
    private var pendingPatch: JSON?
    private var saving = false
    private var stopped = false
    private var selectionVersion = UUID()
    private var resumePosition: Double
    private var generation = UUID()

    init(request: PlaybackRequest) { self.request = request; resumePosition = request.initialSeconds }

    func start(retry: Bool = false) async {
        generation = UUID(); let token = generation
        error = nil; stopped = false
        do {
            var job = try await request.api.request("/media/playback", method: "POST", body: .object([
                "relativePath": .text(request.path), "retry": .bool(retry),
                "supportedAudio": .object(["mp4": .array([.text("aac"), .text("mp3"), .text("ac3"), .text("eac3")]), "webm": .array([])])
            ]))
            while job["state"].string != "ready" {
                try Task.checkCancellation()
                if job["state"].string == "failed" { throw TVError(playbackError(job["errorCode"].string)) }
                status = ["checking": "Comprobando el vídeo…", "queued": "En cola para preparar audio compatible…",
                          "converting": "Preparando audio compatible…", "finalizing": "Finalizando el vídeo…"][job["state"].string] ?? "Preparando vídeo…"
                percent = job["percent"] == .null ? nil : job["percent"].double
                guard !job["id"].string.isEmpty else { throw TVError("La MiniTV no devolvió el identificador de preparación.") }
                try await Task.sleep(for: .seconds(1))
                job = try await request.api.request("/media/playback", query: ["id": job["id"].string])
            }
            try Task.checkCancellation()
            let url = request.api.stream(path: request.path, copy: job["converted"].bool ? job["cacheKey"].string : "")
            let item = AVPlayerItem(url: url)
            let title = AVMutableMetadataItem()
            title.identifier = .commonIdentifierTitle; title.value = request.title as NSString; title.extendedLanguageTag = "es"
            item.externalMetadata = [title]
            let player = AVPlayer(playerItem: item)
            self.player = player
            itemObserver = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    guard let self, !self.stopped, token == self.generation else { return }
                    if item.status == .failed {
                        self.error = "Apple TV no pudo reproducir este archivo. Comprueba la red y que el vídeo sea H.264 o HEVC compatible. Puedes reintentarlo."
                    } else if item.status == .readyToPlay && !self.ready {
                        let duration = item.duration.seconds
                        if self.resumePosition > 0 && duration.isFinite && self.resumePosition < duration {
                            await player.seek(to: CMTime(seconds: self.resumePosition, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
                        }
                        guard !self.stopped, token == self.generation else { return }
                        self.ready = true; player.play()
                    }
                }
            }
            timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
                Task { @MainActor [weak self] in
                    guard let self, !self.stopped, token == self.generation else { return }
                    self.subtitle = WebVTT.text(at: time.seconds, in: self.cues)
                    if Date().timeIntervalSince(self.lastSave) >= 10 { self.save() }
                }
            }
            endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in if let self, token == self.generation { self.save(ended: true) } }
            }
            do {
                let inventory = try await request.api.request("/media/stream", query: ["relativePath": request.path, "subtitles": "list"])
                tracks = inventory["tracks"].array.filter { $0["available"].bool }
            } catch { subtitleError = "No se pudieron consultar los subtítulos adicionales." }
        } catch is CancellationError { }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }

    func selectSubtitle(_ id: String) async {
        selectionVersion = UUID(); let token = selectionVersion
        selectedTrack = id; cues = []; subtitle = ""; subtitleError = nil
        guard !id.isEmpty else { return }
        do {
            let url = request.api.address.endpoint("/media/stream", query: ["relativePath": request.path, "subtitles": id])
            let data = try await request.api.resource(url)
            guard token == selectionVersion else { return }
            cues = WebVTT.parse(String(decoding: data, as: UTF8.self))
            if cues.isEmpty { subtitleError = "Esta pista no contiene subtítulos de texto legibles." }
            // Avoid two caption layers when an external track is selected.
            if let item = player?.currentItem, let group = try? await item.asset.loadMediaSelectionGroup(for: .legible) {
                item.select(nil, in: group)
            }
        } catch { if token == selectionVersion { subtitleError = "No se pudo abrir esa pista. Selecciona otra o reintenta." } }
    }

    func save(ended: Bool = false) {
        guard ready, let player, let item = player.currentItem,
              let patch = videoProgressPatch(key: request.progressKey, markKey: request.markKey, episode: request.episodeNumber,
                  seconds: player.currentTime().seconds, duration: item.duration.seconds, ended: ended) else { return }
        lastSave = Date(); pendingPatch = patch
        guard !saving else { return }
        saving = true
        Task {
            defer { saving = false }
            while let next = pendingPatch {
                pendingPatch = nil
                do { _ = try await request.api.request("/users/\(request.userID)/state", method: "PATCH", body: next); progressError = nil }
                catch { progressError = "No se pudo guardar el progreso. Se reintentará mientras el vídeo esté abierto." }
            }
        }
    }

    func stop() {
        save()
        if ready, let seconds = player?.currentTime().seconds, seconds.isFinite { resumePosition = seconds }
        generation = UUID(); stopped = true; player?.pause()
        if let timeObserver { player?.removeTimeObserver(timeObserver); self.timeObserver = nil }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver); self.endObserver = nil }
        itemObserver = nil
    }

    func retry() async {
        stop(); ready = false; player = nil; percent = nil
        await start(retry: true)
    }

    func playbackError(_ code: String) -> String {
        ["TOOLS_MISSING": "Instala ffmpeg y ffprobe en la MiniTV para preparar este vídeo.",
         "VIDEO_UNSUPPORTED": "El formato de vídeo necesita conversión a H.264 o HEVC antes de verlo en Apple TV.",
         "NO_SPACE": "La MiniTV no tiene espacio libre para preparar el audio.",
         "CACHE_FULL": "La caché de reproducción de MiniTV está llena.",
         "SOURCE_NOT_FOUND": "No se encuentra el archivo de vídeo.",
         "QUEUE_FULL": "La cola de preparación está llena. Reintenta dentro de unos minutos."][code]
            ?? "No se pudo preparar el vídeo (\(code))."
    }
}

struct PlaybackView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @StateObject private var model: PlaybackModel
    @State private var attempt = 0
    init(request: PlaybackRequest) { _model = StateObject(wrappedValue: PlaybackModel(request: request)) }
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()
            if let error = model.error {
                VStack(spacing: 30) {
                    Text("No se pudo reproducir").font(.title.bold())
                    Text(error).multilineTextAlignment(.center).frame(maxWidth: 1000)
                    HStack(spacing: 30) { Button("Reintentar") { attempt += 1 }; Button("Volver") { dismiss() } }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if model.player != nil {
                NativePlayer(model: model, dismiss: { dismiss() }).ignoresSafeArea()
                VStack(spacing: 14) {
                    if let warning = model.progressError { Text(warning).font(.caption).foregroundStyle(.orange).padding(10).background(.black.opacity(0.8)) }
                    if !model.subtitle.isEmpty {
                        Text(model.subtitle).font(.system(size: 34, weight: .semibold)).multilineTextAlignment(.center)
                            .padding(.horizontal, 24).padding(.vertical, 10).background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 8))
                    }
                }.padding(.bottom, 100).allowsHitTesting(false)
            } else {
                VStack(spacing: 28) {
                    Text(model.request.title).font(.title.bold()).lineLimit(2)
                    ProgressView()
                    Text(model.status)
                    if let percent = model.percent { ProgressView(value: percent, total: 100).frame(width: 700); Text("\(Int(percent)) %") }
                    Button("Volver a la biblioteca") { dismiss() }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: attempt) { if attempt == 0 { await model.start() } else { await model.retry() } }
        .onDisappear { model.stop() }
        .onChange(of: phase) { _, value in if value != .active { model.save(); model.player?.pause() } }
    }
}

struct NativePlayer: UIViewControllerRepresentable {
    @ObservedObject var model: PlaybackModel
    var dismiss: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(dismiss: dismiss) }
    final class Coordinator: NSObject, AVPlayerViewControllerDelegate {
        let dismiss: () -> Void
        init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }
        func playerViewControllerShouldDismiss(_ playerViewController: AVPlayerViewController) -> Bool {
            dismiss(); return false
        }
    }
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.delegate = context.coordinator
        controller.player = model.player
        controller.appliesPreferredDisplayCriteriaAutomatically = true
        let subtitles = UIHostingController(rootView: SubtitleMenu(model: model))
        subtitles.title = "Subtítulos MiniTV"
        controller.customInfoViewControllers = [subtitles]
        return controller
    }
    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) { controller.player = model.player }
}

struct SubtitleMenu: View {
    @ObservedObject var model: PlaybackModel
    var body: some View {
        List {
            Text("Los idiomas integrados también están disponibles en el menú de subtítulos del reproductor.").font(.callout)
            Button(model.selectedTrack.isEmpty ? "✓ Sin subtítulos adicionales" : "Sin subtítulos adicionales") { Task { await model.selectSubtitle("") } }
            ForEach(model.tracks.indices, id: \.self) { index in
                let track = model.tracks[index]
                Button((model.selectedTrack == track["id"].string ? "✓ " : "") + Catalog.first(track["title"].string, track["language"].string, "Pista \(index + 1)")) {
                    Task { await model.selectSubtitle(track["id"].string) }
                }
            }
            if let error = model.subtitleError { Text(error).foregroundStyle(.orange) }
        }.preferredColorScheme(.dark)
    }
}
