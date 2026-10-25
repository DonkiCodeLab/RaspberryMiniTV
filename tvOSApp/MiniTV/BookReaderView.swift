import SwiftUI
import CoreGraphics

@MainActor
final class BookReader: ObservableObject {
    @Published var page = 1
    @Published var total = 0
    @Published var text = ""
    @Published var image: UIImage?
    @Published var busy = false
    @Published var error: String?
    @Published var saveError: String?
    private var pdfURL: URL?
    private var api: MiniTVAPI?
    private var userID = ""
    private var book: MediaItem?
    private var generation = UUID()
    private var pending: JSON?
    private var saving = false
    // EPUB text pages are separate from the browser's CFI locations.
    static func key(_ book: MediaItem) -> String { profileKey(book.format == "epub" ? "tv-book" : "book", book.path) }

    func open(_ book: MediaItem, api: MiniTVAPI, userID: String, initialPage: Int) async {
        self.api = api; self.userID = userID; self.book = book
        busy = true; error = nil
        do {
            if book.format != "epub" {
                guard ["pdf", "cbr", "cbz"].contains(book.format) else { throw TVError("Este formato de libro no es compatible con el lector de Apple TV.") }
                var request = URLRequest(url: api.address.endpoint("/books/content", query: ["relativePath": book.path, "render": "pdf"]))
                request.setValue(api.pin, forHTTPHeaderField: "X-Web-Pin")
                let (file, response) = try await MiniTVAPI.session.download(for: request)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    try? FileManager.default.removeItem(at: file)
                    throw TVError("No se pudo descargar el libro. Comprueba el PIN y que MiniTV puede abrirlo.")
                }
                let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
                try FileManager.default.moveItem(at: file, to: destination)
                if Task.isCancelled { try? FileManager.default.removeItem(at: destination); throw CancellationError() }
                pdfURL = destination
                guard let document = CGPDFDocument(destination as CFURL), !document.isEncrypted || document.isUnlocked else {
                    throw TVError("El PDF no se puede abrir o necesita una contraseña.")
                }
                total = document.numberOfPages
                guard total > 0 else { throw TVError("El libro no tiene páginas.") }
            } else {
                let first = try await api.request("/tv/books/text", query: ["relativePath": book.path, "page": "1"])
                total = first["total"].int
                guard total > 0 else { throw TVError("Actualiza DeviceApp para activar el lector EPUB de Apple TV.") }
            }
            busy = false
            await show(min(max(1, initialPage), total))
        } catch is CancellationError { busy = false }
        catch { busy = false; self.error = error.localizedDescription }
    }

    func show(_ number: Int) async {
        guard let book, let api, !busy, (1...max(total, 1)).contains(number) else { return }
        busy = true; error = nil
        let token = generation
        defer { busy = false }
        do {
            if let url = pdfURL {
                let image = try await Task.detached(priority: .userInitiated) { try Self.render(url, page: number) }.value
                guard token == generation, !Task.isCancelled else { return }
                self.image = image
            } else {
                let value = try await api.request("/tv/books/text", query: ["relativePath": book.path, "page": String(number)])
                guard token == generation, !Task.isCancelled else { return }
                text = value["text"].string
            }
            page = number
            save()
        } catch { if token == generation, !Task.isCancelled { self.error = error.localizedDescription } }
    }

    nonisolated static func render(_ url: URL, page number: Int) throws -> UIImage {
        guard let document = CGPDFDocument(url as CFURL), let page = document.page(at: number) else { throw TVError("No se pudo dibujar la página.") }
        let bounds = page.getBoxRect(.cropBox)
        guard bounds.width > 0, bounds.height > 0 else { throw TVError("La página tiene un tamaño no válido.") }
        let rotated = page.rotationAngle % 180 != 0
        let width = rotated ? bounds.height : bounds.width
        let height = rotated ? bounds.width : bounds.height
        let scale = min(2400 / width, 1800 / height)
        let size = CGSize(width: width * scale, height: height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size))
            let cg = context.cgContext
            cg.translateBy(x: 0, y: size.height); cg.scaleBy(x: 1, y: -1)
            cg.concatenate(page.getDrawingTransform(.cropBox, rect: CGRect(origin: .zero, size: size), rotate: 0, preserveAspectRatio: true))
            cg.drawPDFPage(page)
        }
    }

    func save() {
        guard let book, let api, total > 0 else { return }
        pending = .object(["progress": .object([Self.key(book): .object([
            "kind": .text("book"), "page": .number(Double(page)), "total": .number(Double(total)), "completed": .bool(page == total)
        ])])])
        guard !saving else { return }
        saving = true
        Task {
            defer { saving = false }
            while let patch = pending {
                pending = nil
                do { _ = try await api.request("/users/\(userID)/state", method: "PATCH", body: patch); saveError = nil }
                catch { saveError = "No se ha podido guardar la página. Comprueba la conexión." }
            }
        }
    }
    func close() {
        generation = UUID()
        if let pdfURL { try? FileManager.default.removeItem(at: pdfURL); self.pdfURL = nil }
    }
}

struct BookReaderView: View {
    @EnvironmentObject private var session: TVSession
    @Environment(\.dismiss) private var dismiss
    let book: MediaItem
    @StateObject private var reader = BookReader()
    @State private var zoom: CGFloat = 1
    @State private var offset: CGFloat = 0
    @State private var attempt = 0
    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text(book.title).font(.title3.bold()).lineLimit(1)
                Spacer()
                Text("\(reader.page) / \(reader.total)").foregroundStyle(.secondary)
            }
            if let error = reader.error {
                EmptyState(title: "No se pudo abrir el libro", detail: error, symbol: "book.closed")
                Button("Reintentar") { attempt += 1 }
                Button("Cerrar") { dismiss() }
            } else {
                GeometryReader { geometry in
                    ZStack {
                        Color(white: 0.94)
                        if let image = reader.image {
                            Image(uiImage: image).resizable().scaledToFit().frame(width: geometry.size.width, height: geometry.size.height)
                                .scaleEffect(zoom).offset(y: offset)
                        } else {
                            Text(reader.text).font(.system(size: 29 * zoom)).foregroundStyle(.black)
                                .frame(maxWidth: 1450, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                                .frame(maxHeight: .infinity, alignment: .topLeading).padding(40).offset(y: offset)
                        }
                        if reader.busy { ProgressView().tint(.black).padding(30).background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 20)) }
                    }.clipped()
                }
                .focusable().focusEffectDisabled()
                .onMoveCommand { direction in
                    switch direction {
                    case .left: turn(-1)
                    case .right: turn(1)
                    case .up: offset = min(offset + 100, zoom > 1 ? 500 : 0)
                    case .down: offset = max(offset - 100, -1000)
                    default: break
                    }
                }
                .onPlayPauseCommand { zoom = zoom == 1 ? 1.5 : 1; offset = 0 }
            }
            if let error = reader.saveError { Text(error).font(.caption).foregroundStyle(.orange) }
            Text("◀ ▶ Página  ·  ▲ ▼ Desplazar  ·  ⏯ Ampliar  ·  Atrás para cerrar").font(.caption).foregroundStyle(.secondary)
        }.padding(40).background(Color.black).onExitCommand { dismiss() }
        .task(id: attempt) {
            guard let api = session.api else { return }
            reader.close()
            await reader.open(book, api: api, userID: session.userID, initialPage: max(1, session.state["progress"][BookReader.key(book)]["page"].int))
        }
        .onDisappear { reader.close() }
    }
    func turn(_ delta: Int) {
        guard !reader.busy else { return }
        offset = 0
        Task { await reader.show(reader.page + delta) }
    }
}
