import SwiftUI

struct MainView: View {
    @EnvironmentObject private var session: TVSession
    var body: some View {
        TabView {
            NavigationStack { HomeView() }.tabItem { Label("Inicio", systemImage: "house") }
            NavigationStack { LibraryView() }.tabItem { Label("Biblioteca", systemImage: "rectangle.stack") }
            NavigationStack { SearchView() }.tabItem { Label("Buscar", systemImage: "magnifyingglass") }
            NavigationStack { PhotosView() }.tabItem { Label("Fotos", systemImage: "photo.on.rectangle") }
            NavigationStack { DeviceView() }.tabItem { Label("MiniTV", systemImage: "tv") }
            NavigationStack { SettingsView() }.tabItem { Label("Ajustes", systemImage: "gearshape") }
        }
        .background(TVBackground())
        .task { await session.reload() }
    }
}

struct HomeView: View {
    @EnvironmentObject private var session: TVSession
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 48) {
                HStack {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("MiniTV", systemImage: "tv.fill").font(.system(size: 56, weight: .heavy)).foregroundStyle(.yellow)
                        Text("Hola, \(session.userName). ¿Qué te apetece hoy?").font(.title3).foregroundStyle(.secondary)
                    }
                    Spacer()
                    NavigationLink { ProfilesView() } label: { Label("Cambiar perfil", systemImage: "person.crop.circle") }
                    Button { Task { await session.reload() } } label: { Image(systemName: "arrow.clockwise") }
                        .disabled(session.loading).accessibilityLabel("Actualizar biblioteca")
                }
                HStack(spacing: 24) {
                    ForEach(MediaKind.allCases) { kind in
                        let count = session.items.filter { $0.kind == kind }.count
                        NavigationLink { LibraryView(initialKind: kind) } label: {
                            VStack(alignment: .leading, spacing: 14) {
                                Image(systemName: kind.symbol).font(.largeTitle).foregroundStyle(.yellow)
                                Text(kind.title).font(.headline)
                                Text(count == 1 ? "1 título" : "\(count) títulos").foregroundStyle(.secondary).font(.callout)
                            }.frame(width: 300, alignment: .leading).padding(24)
                        }.buttonStyle(.card)
                    }
                }
                if session.loading { ProgressView("Cargando tu biblioteca…") }
                if !session.continuing.isEmpty { Shelf(title: "Seguir disfrutando", items: session.continuing) }
                let favorites = session.items.filter { session.favorite($0) }
                if !favorites.isEmpty { Shelf(title: "Tus favoritos", items: favorites) }
                Shelf(title: "Una película para hoy", items: session.items.filter { $0.kind == .movie })
                Shelf(title: "Tus series", items: session.items.filter { $0.kind == .series })
                if session.items.isEmpty && !session.loading {
                    EmptyState(title: "Tu biblioteca aparecerá aquí", detail: "Comprueba que MiniTV está encendida y que contiene archivos. Puedes volver a intentarlo con Actualizar.", symbol: "wifi")
                }
            }.padding(.horizontal, 70).padding(.vertical, 40)
        }.background(TVBackground())
    }
}

struct Shelf: View {
    let title: String
    let items: [MediaItem]
    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 24) {
                Text(title).font(.title2.bold())
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 32) {
                        ForEach(items.prefix(30)) { item in MediaCard(item: item).frame(width: 250) }
                    }.padding(14)
                }.scrollClipDisabled()
            }
        }
    }
}

struct LibraryView: View {
    @EnvironmentObject private var session: TVSession
    @State private var kind: MediaKind
    @State private var favoritesOnly = false
    init(initialKind: MediaKind = .movie) { _kind = State(initialValue: initialKind) }
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                Picker("Biblioteca", selection: $kind) { ForEach(MediaKind.allCases) { Text($0.title).tag($0) } }
                    .pickerStyle(.segmented).frame(maxWidth: 1050)
                Spacer()
                Button { favoritesOnly.toggle() } label: {
                    Label(favoritesOnly ? "Favoritos" : "Todos", systemImage: favoritesOnly ? "heart.fill" : "heart")
                }
            }.padding(.horizontal, 70).padding(.top, 25)
            let filtered = session.items.filter { $0.kind == kind && (!favoritesOnly || session.favorite($0)) }
            if filtered.isEmpty {
                EmptyState(title: favoritesOnly ? "Todavía no hay favoritos" : "No hay \(kind.title.lowercased())",
                           detail: "Añade contenido a MiniTV desde la web y actualiza la biblioteca.", symbol: kind.symbol)
            } else { MediaGrid(items: filtered).id(kind.rawValue + String(favoritesOnly)) }
        }.background(TVBackground())
    }
}

struct SearchView: View {
    @EnvironmentObject private var session: TVSession
    @State private var query = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Encuentra algo que te guste").font(.title.bold())
                .padding(.horizontal, 70).padding(.top, 30)
            TextField("Título, autor o plataforma", text: $query).padding(.horizontal, 70)
            let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
            let results = session.items.filter { ($0.title + " " + $0.subtitle).localizedCaseInsensitiveContains(needle) }
            if needle.isEmpty { EmptyState(title: "Busca en toda tu biblioteca", detail: "Puedes escribir con el mando, el teclado del iPhone o dictar desde el teclado de tvOS si está disponible.", symbol: "magnifyingglass") }
            else if results.isEmpty { EmptyState(title: "Sin resultados", detail: "Prueba con otro título, autor o plataforma.", symbol: "magnifyingglass") }
            else { MediaGrid(items: results) }
        }.background(TVBackground())
    }
}

struct MediaGrid: View {
    let items: [MediaItem]
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 245, maximum: 300), spacing: 36)], alignment: .leading, spacing: 44) {
                ForEach(items) { MediaCard(item: $0) }
            }.padding(.horizontal, 70).padding(.vertical, 30)
        }
    }
}

struct MediaCard: View {
    @EnvironmentObject private var session: TVSession
    let item: MediaItem
    var body: some View {
        NavigationLink { DetailView(item: item) } label: {
            VStack(alignment: .leading, spacing: 12) {
                TVArtwork(source: item.artwork, symbol: item.kind.symbol)
                    .frame(height: 300).clipped().overlay(alignment: .topTrailing) {
                        if session.favorite(item) { Image(systemName: "heart.fill").foregroundStyle(.yellow).padding(14) }
                    }
                Text(item.title).font(.headline).lineLimit(2).frame(height: 58, alignment: .topLeading)
                Text(Catalog.first(item.subtitle, item.kind.title)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }.padding(12)
        }.buttonStyle(.card).accessibilityLabel(item.title)
    }
}

struct TVArtwork: View {
    @EnvironmentObject private var session: TVSession
    let source: String
    var symbol = "photo"
    var fit = false
    @State private var image: UIImage?
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(colors: [.purple.opacity(0.4), .indigo.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let image {
                    Image(uiImage: image).resizable().aspectRatio(contentMode: fit ? .fit : .fill)
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                } else { Image(systemName: symbol).font(.system(size: 72, weight: .light)).foregroundStyle(.white.opacity(0.55)) }
            }
        }
        .task(id: source) {
            image = nil
            guard let api = session.api, let url = api.resourceURL(source) else { return }
            if let data = try? await api.resource(url), !Task.isCancelled { image = UIImage(data: data) }
        }
        .accessibilityHidden(true)
    }
}

struct EmptyState: View {
    let title: String
    let detail: String
    let symbol: String
    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: symbol).font(.system(size: 64)).foregroundStyle(.yellow)
            Text(title).font(.title2.bold())
            Text(detail).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 850)
        }.frame(maxWidth: .infinity, minHeight: 330).padding(40)
    }
}

struct DetailView: View {
    @EnvironmentObject private var session: TVSession
    let item: MediaItem
    @State private var overview = ""
    @State private var season = 0
    @State private var busy = false
    var seasons: [Int] { Array(Set(item.episodes.map(\.season))).sorted() }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                HStack(alignment: .top, spacing: 60) {
                    TVArtwork(source: item.artwork, symbol: item.kind.symbol, fit: true).frame(width: 350, height: 500)
                    VStack(alignment: .leading, spacing: 26) {
                        Text(item.kind.title.uppercased()).font(.headline).foregroundStyle(.yellow)
                        Text(item.title).font(.system(size: 50, weight: .bold))
                        Text(item.subtitle).foregroundStyle(.secondary)
                        Text(Catalog.first(overview, item.overview, "Este título forma parte de tu biblioteca MiniTV."))
                            .font(.callout).lineLimit(7)
                        HStack(spacing: 24) {
                            if item.kind == .movie {
                                Button { session.play(item) } label: {
                                    Label(session.progress(item.progressKey)["seconds"].double > 0 && !session.progress(item.progressKey)["completed"].bool ? "Continuar" : "Reproducir", systemImage: "play.fill")
                                }
                                if session.progress(item.progressKey)["seconds"].double > 0 {
                                    Button("Desde el inicio") { session.play(item, restart: true) }
                                }
                            } else if item.kind == .book {
                                Button { session.reader = item } label: { Label("Leer en Apple TV", systemImage: "book") }
                            } else if item.kind == .game {
                                Button("Iniciar en MiniTV") { launchGame() }.disabled(busy)
                            }
                            Button { Task { await session.toggleFavorite(item) } } label: {
                                Image(systemName: session.favorite(item) ? "heart.fill" : "heart")
                            }.accessibilityLabel(session.favorite(item) ? "Quitar de favoritos" : "Añadir a favoritos")
                        }
                        if item.kind == .game {
                            Text("El juego se ejecuta en la Raspberry MiniTV. Para jugar utiliza la pantalla y el mando conectados a ella. Esta app no incluye un emulador de juegos para Apple TV.")
                                .font(.callout).foregroundStyle(.secondary)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                if item.kind == .series {
                    Picker("Temporada", selection: $season) {
                        ForEach(seasons, id: \.self) { Text($0 == 0 ? "Especiales" : "Temporada \($0)").tag($0) }
                    }.frame(maxWidth: 850)
                    LazyVStack(spacing: 16) {
                        ForEach(item.episodes.filter { $0.season == season }.sorted { $0.number < $1.number }) { episode in
                            Button { session.play(item, episode: episode) } label: {
                                HStack(spacing: 24) {
                                    Image(systemName: "play.circle.fill").foregroundStyle(.yellow)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(episode.code + " · " + episode.title).lineLimit(1)
                                        let saved = session.progress(episode.progressKey)
                                        Text(saved["completed"].bool ? "Visto" : saved["seconds"].double > 0 ? "Continuar en \(Int(saved["seconds"].double / 60)) min" : "Reproducir en Apple TV")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }.padding(14).frame(maxWidth: .infinity)
                            }
                        }
                    }
                    if item.episodes.isEmpty { Text("Esta serie aún no tiene episodios descargados.").foregroundStyle(.secondary) }
                }
            }.padding(70)
        }
        .background(TVBackground())
        .onPlayPauseCommand { if item.kind == .movie { session.play(item) } }
        .task {
            season = seasons.first ?? 0
            guard item.tmdbID > 0, let api = session.api else { return }
            let kind = item.kind == .series ? "tv" : "movie"
            var query = ["language": "es-ES"]
            if kind == "movie" { query["append_to_response"] = "external_ids" }
            if let detail = try? await api.request("/tmdb/json/\(kind)/\(item.tmdbID)", query: query) { overview = detail["overview"].string }
        }
    }
    func launchGame() {
        busy = true
        Task {
            await session.command("/games/play", body: .object(["relativePath": .text(item.path)]), success: "Juego iniciado en la MiniTV.")
            busy = false
        }
    }
}
