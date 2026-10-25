import SwiftUI

struct DeviceView: View {
    @EnvironmentObject private var session: TVSession
    @State private var health: JSON = .null
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                Text("Tu MiniTV").font(.largeTitle.bold())
                Text(session.serverName).foregroundStyle(.secondary)
                if let error { Text(error).foregroundStyle(.orange) }
                HStack(spacing: 30) {
                    stat("Espacio libre", "\(health["storage"]["freeGb"].string) GB", "externaldrive")
                    stat("Espacio usado", "\(health["storage"]["percentUsed"].string) %", "chart.pie")
                    stat("Reproduciendo en MiniTV", health["running"].bool ? health["playing"].string : "En reposo", "tv")
                }
                NavigationLink { DownloadsView() } label: { Label("Descargas", systemImage: "arrow.down.circle") }
                Text("Controles de la Raspberry MiniTV").font(.title2.bold())
                HStack(spacing: 28) {
                    Button("Bajar volumen") { command("/volume/down") }
                    Button("Subir volumen") { command("/volume/up") }
                    Button("Detener reproducción") { command("/stop") }
                }.disabled(busy)
                Text("Estos controles actúan sobre la Raspberry. El volumen del Apple TV se controla con los botones de volumen del Siri Remote.")
                    .font(.callout).foregroundStyle(.secondary)
                Button("Actualizar estado") { Task { await reload() } }
            }.padding(70)
        }.background(TVBackground())
        .task {
            while !Task.isCancelled {
                await reload()
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
            }
        }
    }
    func stat(_ name: String, _ value: String, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: symbol).font(.largeTitle).foregroundStyle(.yellow)
            Text(name).font(.callout).foregroundStyle(.secondary)
            Text(value.isEmpty ? "—" : value).font(.title2.bold()).lineLimit(2)
        }.padding(30).frame(maxWidth: .infinity, minHeight: 220, alignment: .leading)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
    }
    func command(_ path: String) {
        busy = true
        Task { await session.command(path, success: "Orden enviada a la MiniTV."); await reload(); busy = false }
    }
    func reload() async {
        guard let api = session.api else { return }
        do { health = try await api.request("/health"); error = nil }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

struct DownloadsView: View {
    @EnvironmentObject private var session: TVSession
    @State private var jobs: [JSON] = []
    @State private var error: String?
    @State private var busy = false
    @State private var cancel: JSON?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                Text("Descargas").font(.largeTitle.bold())
                Text("Las descargas continúan en la MiniTV aunque cierres esta app.").foregroundStyle(.secondary)
                if let error { Text(error).foregroundStyle(.orange) }
                if jobs.isEmpty { EmptyState(title: "No hay descargas", detail: "Las tareas que inicies en la web aparecerán aquí.", symbol: "arrow.down.circle") }
                ForEach(jobs.indices, id: \.self) { index in
                    let job = jobs[index]
                    VStack(alignment: .leading, spacing: 18) {
                        Text(Catalog.first(job["movie"]["name"].string, job["series"]["name"].string, job["book"]["name"].string, job["name"].string, job["id"].string)).font(.title3.bold())
                        let state = job["state"].string
                        Text("\(stateLabel(state)) · \(Int(job["progress"].double)) % · \(Int(job["rateBytes"].double / 1024)) KB/s").foregroundStyle(.secondary)
                        ProgressView(value: min(100, max(0, job["progress"].double)), total: 100)
                        if !job["error"].string.isEmpty { Text(job["error"].string).font(.callout).foregroundStyle(.orange) }
                        HStack(spacing: 24) {
                            if ["queued", "downloading", "fetching"].contains(state) { Button("Pausar") { action(job, "pause") } }
                            if state == "paused" { Button("Reanudar") { action(job, "resume") } }
                            if ["error", "failed"].contains(state) { Button("Reintentar") { action(job, "retry") } }
                            if !["complete", "cancelled", "importing", "metadata"].contains(state) { Button("Cancelar descarga", role: .destructive) { cancel = job } }
                        }.disabled(busy)
                    }.padding(30).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
                }
                Button("Actualizar") { Task { await reload() } }
            }.padding(70)
        }.background(TVBackground())
        .confirmationDialog("¿Cancelar esta descarga en MiniTV?", isPresented: Binding(get: { cancel != nil }, set: { if !$0 { cancel = nil } }), titleVisibility: .visible) {
            Button("Cancelar descarga", role: .destructive) { if let cancel { action(cancel, "cancel") }; cancel = nil }
            Button("Seguir descargando", role: .cancel) { cancel = nil }
        }
        .task {
            while !Task.isCancelled {
                await reload()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
    func stateLabel(_ state: String) -> String {
        ["queued": "En cola", "downloading": "Descargando", "fetching": "Obteniendo torrent", "paused": "En pausa", "metadata": "Importando", "complete": "Completada", "cancelled": "Cancelada", "error": "Error", "failed": "Error"][state] ?? state
    }
    func reload() async {
        guard let api = session.api else { return }
        do { let value = try await api.request("/torrents"); jobs = value["jobs"].array; error = value["serviceError"].string.isEmpty ? nil : value["serviceError"].string }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    func action(_ job: JSON, _ action: String) {
        guard let api = session.api else { return }
        busy = true
        Task {
            defer { busy = false }
            do { _ = try await api.request("/torrents/" + job["id"].string, method: "POST", body: .object(["action": .text(action)])); await reload() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct ProfilesView: View {
    @EnvironmentObject private var session: TVSession
    @State private var name = ""
    @State private var busy = false
    var body: some View {
        List {
            Section("¿Quién está viendo MiniTV?") {
                ForEach(session.users.indices, id: \.self) { index in
                    let user = session.users[index]
                    Button { Task { busy = true; await session.selectUser(user["id"].string); busy = false } } label: {
                        HStack { Label(user["name"].string, systemImage: "person.crop.circle"); Spacer(); if user["id"].string == session.userID { Image(systemName: "checkmark").foregroundStyle(.yellow) } }
                    }.disabled(busy)
                }
            }
            Section("Nuevo perfil") {
                TextField("Nombre", text: $name)
                Button("Crear perfil") {
                    guard let api = session.api else { return }
                    busy = true
                    Task {
                        defer { busy = false }
                        do {
                            let result = try await api.request("/users", method: "POST", body: .object(["name": .text(name), "avatar": .text("avatar-01")]))
                            session.users.append(result["user"]); name = ""
                            await session.selectUser(result["user"]["id"].string)
                        } catch { session.error = error.localizedDescription }
                    }
                }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }.navigationTitle("Perfiles")
    }
}

struct SettingsView: View {
    @EnvironmentObject private var session: TVSession
    @State private var disconnect = false
    var body: some View {
        List {
            Section("Conexión") {
                Text(session.api?.address.url.absoluteString ?? "")
                Button("Actualizar biblioteca") { Task { await session.reload() } }.disabled(session.loading)
                Button("Cambiar MiniTV o PIN") { disconnect = true }
            }
            Section("Tu cuenta y tu MiniTV") {
                NavigationLink { ProfilesView() } label: { Label("Perfiles", systemImage: "person.2") }
                NavigationLink { DeviceSettingsView() } label: { Label("Idioma, tiempo y alarmas", systemImage: "slider.horizontal.3") }
            }
            Section("Usar el mando") {
                Text("Desliza o pulsa la cruceta para moverte. Pulsa el centro para abrir. Atrás vuelve a la pantalla anterior. Durante un vídeo, usa Play/Pausa y la barra del reproductor para avanzar o retroceder.")
                Text("En fotos: izquierda y derecha cambian de imagen; Play/Pausa activa la presentación. En libros: izquierda y derecha cambian de página; arriba y abajo desplazan el texto.")
            }
            Section("Acerca de MiniTV para Apple TV") {
                Text("Los vídeos, fotos y libros se abren en Apple TV. Los juegos se inician en la Raspberry. Las subidas, el editor de fichas, la revisión de caras, los servicios de IA y la administración avanzada se gestionan desde la web.")
                Text("MiniTV · tvOS 17 o posterior · Versión 1.0")
            }
        }.navigationTitle("Ajustes")
        .confirmationDialog("¿Desconectar esta MiniTV?", isPresented: $disconnect, titleVisibility: .visible) {
            Button("Desconectar", role: .destructive) { session.disconnect() }
            Button("Cancelar", role: .cancel) { }
        } message: { Text("Se elimina el PIN de este Apple TV. La biblioteca y los perfiles permanecen en MiniTV.") }
    }
}

struct DeviceSettingsView: View {
    @EnvironmentObject private var session: TVSession
    @State private var location = ""
    @State private var language = "es"
    @State private var alarms: [JSON] = []
    @State private var loaded = false
    @State private var busy = false
    @State private var loadError: String?
    @State private var attempt = 0
    var body: some View {
        List {
            Section("Idioma de MiniTV") {
                Picker("Idioma", selection: $language) { Text("Español").tag("es"); Text("Català").tag("ca"); Text("English").tag("en") }
                Button("Guardar idioma") { save("/settings/language", .object(["language": .text(language)])) }
            }
            Section("El tiempo en la Raspberry") {
                TextField("Ciudad", text: $location)
                Button("Guardar ubicación") { save("/settings/weather", .object(["location": .text(location)])) }
            }
            Section("Alarmas de MiniTV") {
                ForEach(alarms.indices, id: \.self) { index in
                    Toggle("Alarma \(index + 1)", isOn: Binding(get: { alarms[index]["enabled"].bool }, set: { update(index, "enabled", .bool($0)) }))
                    TextField("Hora (HH:mm)", text: Binding(get: { alarms[index]["time"].string }, set: { update(index, "time", .text($0)) }))
                }
                Button("Guardar alarmas") {
                    guard alarms.allSatisfy({ $0["time"].string.range(of: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil }) else {
                        session.error = "Escribe las horas con el formato HH:mm, por ejemplo 07:30."; return
                    }
                    save("/settings/alarms", .object(["alarms": .array(alarms)]))
                }
            }
        }.disabled(!loaded || busy).navigationTitle("Ajustes de la Raspberry")
        .overlay {
            if let loadError {
                VStack(spacing: 24) {
                    Text(loadError).frame(maxWidth: 900).multilineTextAlignment(.center)
                    Button("Reintentar") { attempt += 1 }
                }.padding(40).background(.black)
            } else if !loaded { ProgressView("Cargando ajustes…") }
        }
        .task(id: attempt) {
            guard let api = session.api else { return }
            loadError = nil
            do {
                async let weather = api.request("/settings/weather")
                async let lang = api.request("/settings/language")
                async let alarms = api.request("/settings/alarms")
                let (w, l, a) = try await (weather, lang, alarms)
                location = w["location"].string; language = l["language"].string; self.alarms = a["alarms"].array; loaded = true
            } catch { loadError = error.localizedDescription }
        }
    }
    func update(_ index: Int, _ key: String, _ value: JSON) { var object = alarms[index].object; object[key] = value; alarms[index] = .object(object) }
    func save(_ path: String, _ body: JSON) {
        busy = true
        Task { await session.command(path, body: body, success: "Ajustes guardados en MiniTV."); busy = false }
    }
}
