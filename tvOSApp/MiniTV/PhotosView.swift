import SwiftUI

struct PhotosView: View {
    @EnvironmentObject private var session: TVSession
    @State private var library: JSON = .null
    @State private var section = "Galería"
    @State private var filter: JSON?
    @State private var loading = false
    @State private var error: String?
    @State private var selection: Int?
    var photos: [JSON] {
        let all = library["photos"].array
        guard let filter else { return all }
        if section == "Personas" {
            let ids = Set(filter["photoIds"].array.map(\.string))
            return all.filter { ids.contains($0["id"].string) }
        }
        let id = filter["id"].string
        return all.filter { $0["folderId"].string == id || $0["folderIds"].array.contains(.text(id)) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 28) {
                Text(filter?["name"].string ?? "Tus fotos").font(.title.bold())
                Spacer()
                if filter != nil { Button("Volver a \(section.lowercased())") { filter = nil } }
                else {
                    Picker("Fotos", selection: $section) {
                        ForEach(["Galería", "Álbumes", "Personas"], id: \.self) { Text($0).tag($0) }
                    }.pickerStyle(.segmented).frame(width: 720)
                }
                Button { Task { await reload() } } label: { Image(systemName: "arrow.clockwise") }.disabled(loading)
            }.padding(.horizontal, 70).padding(.top, 30)
            if loading { ProgressView("Cargando fotos…").frame(maxWidth: .infinity, minHeight: 300) }
            else if let error {
                EmptyState(title: "No se pudo abrir la fototeca", detail: error, symbol: "wifi.exclamationmark")
            } else if section != "Galería" && filter == nil {
                let groups = library[section == "Álbumes" ? "folders" : "people"].array
                if groups.isEmpty { EmptyState(title: "Todavía no hay \(section.lowercased())", detail: "Organiza la fototeca desde MiniTV y vuelve a actualizar.", symbol: "photo.on.rectangle") }
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 30)], spacing: 30) {
                        ForEach(groups.indices, id: \.self) { index in
                            Button { filter = groups[index] } label: {
                                Label(groups[index]["name"].string, systemImage: section == "Álbumes" ? "rectangle.stack" : "person.crop.rectangle")
                                    .frame(maxWidth: .infinity, minHeight: 100).padding(18)
                            }.buttonStyle(.card)
                        }
                    }.padding(70)
                }
            } else if photos.isEmpty {
                EmptyState(title: "No hay fotos aquí", detail: "Importa fotos desde MiniTV Fotos en el iPhone o desde la web.", symbol: "photo")
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 28)], spacing: 30) {
                        ForEach(photos.indices, id: \.self) { index in
                            let photo = photos[index]
                            Button { selection = index } label: {
                                VStack(alignment: .leading) {
                                    TVArtwork(source: photoURL(photo, render: "thumb")).frame(height: 220).clipped()
                                    Text(photo["name"].string).font(.caption).lineLimit(1).padding(10)
                                }
                            }.buttonStyle(.card)
                        }
                    }.padding(.horizontal, 70).padding(.vertical, 30)
                }
            }
        }
        .background(TVBackground())
        .task { await reload() }
        .fullScreenCover(isPresented: Binding(get: { selection != nil }, set: { if !$0 { selection = nil } })) {
            PhotoSlideshow(photos: photos, initialIndex: selection ?? 0).environmentObject(session)
        }
    }
    func photoURL(_ photo: JSON, render: String) -> String {
        session.api?.address.endpoint("/pictures/content", query: ["relativePath": photo["relativePath"].string, "render": render]).absoluteString ?? ""
    }
    func reload() async {
        guard let api = session.api, !loading else { return }
        loading = true; error = nil
        defer { loading = false }
        do { library = try await api.request("/pictures/library") }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

struct PhotoSlideshow: View {
    @EnvironmentObject private var session: TVSession
    @Environment(\.dismiss) private var dismiss
    let photos: [JSON]
    @State private var index: Int
    @State private var playing = false
    init(photos: [JSON], initialIndex: Int) {
        self.photos = photos
        _index = State(initialValue: min(max(initialIndex, 0), max(photos.count - 1, 0)))
    }
    var body: some View {
        VStack(spacing: 16) {
            if photos.indices.contains(index) {
                let photo = photos[index]
                let url = session.api?.address.endpoint("/pictures/content", query: ["relativePath": photo["relativePath"].string, "render": "preview"])
                TVArtwork(source: url?.absoluteString ?? "", fit: true).frame(maxWidth: .infinity, maxHeight: .infinity)
                Text(photo["name"].string).font(.callout)
                Text("\(index + 1) de \(photos.count)  ·  ◀ ▶ Cambiar foto  ·  ⏯ \(playing ? "Pausar" : "Presentación")  ·  Atrás para cerrar")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(35).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
        .focusable().focusEffectDisabled()
        .onMoveCommand { direction in
            if direction == .left { advance(-1) }
            if direction == .right { advance(1) }
        }
        .onPlayPauseCommand { playing.toggle() }
        .onExitCommand { dismiss() }
        .task(id: playing) {
            while playing && !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                advance(1)
            }
        }
    }
    func advance(_ offset: Int) { if !photos.isEmpty { index = (index + offset + photos.count) % photos.count } }
}
