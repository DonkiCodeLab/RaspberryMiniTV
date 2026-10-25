import SwiftUI

private let yellow = Color(red: 1, green: 0.84, blue: 0.24)
private let panel = Color(red: 0.10, green: 0.15, blue: 0.19)

struct ContentView: View {
    @EnvironmentObject private var model: ImportModel
    @State private var scanner = false
    @State private var paste = false
    @State private var link = ""
    @State private var restart = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        Image(systemName: "tv.fill").font(.title).foregroundStyle(yellow)
                        Text("MiniTV Fotos").font(.title2.bold())
                        Spacer()
                        Image(systemName: "wifi").foregroundStyle(model.connected ? yellow : .secondary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("TUS RECUERDOS, EN CASA").font(.caption.weight(.heavy)).tracking(2).foregroundStyle(yellow)
                        Text(model.hasJob ? "De tu bolsillo\na tu biblioteca." : "Tus fotos.\nTu MiniTV.")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                        Text("Originales, sin cables y sin volver a subir lo que ya tienes.").foregroundStyle(.secondary)
                    }
                    connectionCard
                    if let pair = model.pendingPair {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Confirma tu MiniTV", systemImage: "link").font(.headline)
                            Text(pair.server.absoluteString).font(.callout.monospaced()).textSelection(.enabled)
                            Text("Las fotos se enviarán a esta dirección cuando pulses Exportar.").font(.footnote).foregroundStyle(.secondary)
                            Button("Conectar con esta MiniTV") { Task { await model.connect() } }.buttonStyle(.borderedProminent).foregroundStyle(Color.black).disabled(model.connecting)
                            Button("Cancelar enlace") { model.pendingPair = nil }.disabled(model.connecting)
                        }.card()
                    }
                    if let error = model.error {
                        VStack(alignment: .leading, spacing: 10) {
                            Label(error, systemImage: "exclamationmark.triangle.fill").font(.callout)
                            Button("Abrir Ajustes del iPhone") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                        }.foregroundStyle(Color.orange).card().accessibilityLabel(error)
                    }
                    if model.hasJob { progressCard }
                    if let notice = model.backgroundNotice {
                        Label(notice, systemImage: "clock.arrow.circlepath").font(.footnote).foregroundStyle(.secondary)
                    }
                    if model.limited {
                        Label("Acceso limitado: solo se exportan las fotos que has autorizado. Puedes dar acceso completo en Ajustes.", systemImage: "photo.badge.checkmark")
                            .font(.footnote).foregroundStyle(yellow)
                    }
                    if model.connected && !model.running && !model.connecting && model.pendingPair == nil {
                        VStack(spacing: 12) {
                            if model.canResume {
                                Button { model.start() } label: { Label("Continuar importación", systemImage: "play.fill").frame(maxWidth: .infinity) }
                                    .buttonStyle(.borderedProminent).foregroundStyle(Color.black).controlSize(.large).disabled(model.preparing)
                            }
                            Button {
                                if model.hasJob { restart = true } else { Task { await model.prepare() } }
                            } label: {
                                Label(model.preparing ? "Leyendo fototeca…" : model.hasJob ? "Nueva importación de la fototeca" : "Exportar todas mis fotos", systemImage: "arrow.up.circle.fill").frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent).foregroundStyle(Color.black).controlSize(.large).disabled(model.preparing)
                            if model.failed > 0 {
                                Button("Reintentar solo las fallidas") { Task { await model.prepare(onlyFailures: true) } }.disabled(model.preparing)
                            }
                            Text("Se exportan las fotos accesibles con tu permiso. Incluye la imagen fija de las Live Photos; los vídeos quedan fuera de esta versión. Los originales de iCloud se descargarán si hace falta.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    if model.running {
                        Button { model.pause() } label: { Label("Pausar importación", systemImage: "pause.fill").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large)
                        Text("Puedes salir de la app o bloquear el iPhone: las subidas preparadas continúan por Wi-Fi. iOS decide cuándo dar tiempo para preparar más fotos. No fuerces el cierre de la app.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if !model.recent.isEmpty { results }
                    Text("Tus fotos permanecen en el iPhone. MiniTV Fotos envía una copia a tu biblioteca.").font(.footnote).foregroundStyle(.secondary)
                }.padding(24).frame(maxWidth: 600)
                    .frame(maxWidth: .infinity)
            }
            .background(Color(red: 0.05, green: 0.09, blue: 0.12))
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $scanner) {
                NavigationStack {
                    QRScanner { value in scanner = false; model.receive(value) }
                        .ignoresSafeArea(edges: .bottom).navigationTitle("Escanea el QR de MiniTV")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { scanner = false } } }
                }
            }
            .sheet(isPresented: $paste) {
                NavigationStack {
                    Form {
                        Section("Enlace del QR") {
                            TextField("minitvphotos://pair?…", text: $link, axis: .vertical).textInputAutocapitalization(.never).autocorrectionDisabled()
                            Button("Leer enlace") { paste = false; model.receive(link); link = "" }.disabled(link.isEmpty)
                        }
                    }.navigationTitle("Pegar enlace").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { paste = false } } }
                }.presentationDetents([.medium])
            }
            .confirmationDialog("¿Empezar una nueva importación?", isPresented: $restart, titleVisibility: .visible) {
                Button("Exportar fototeca de nuevo") { Task { await model.prepare() } }
            } message: { Text("Se sustituirá el informe anterior. Las fotos ya guardadas en la MiniTV se comprobarán y no se duplicarán.") }
        }.tint(yellow).preferredColorScheme(.dark)
    }

    private var connectionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label(model.connected ? "MiniTV conectada" : "Conecta tu biblioteca", systemImage: model.connected ? "checkmark.circle.fill" : "qrcode.viewfinder")
                    .font(.headline).foregroundStyle(model.connected ? yellow : .primary)
                if model.connecting { ProgressView() }
            }
            if let connection = model.connection {
                Text(connection.server.absoluteString).font(.footnote.monospaced()).foregroundStyle(.secondary)
                if connection.expired { Text("El enlace ha caducado. Escanea un QR nuevo.").font(.footnote).foregroundStyle(.orange) }
            } else { Text("En la web: Dashboard → Subidas → Fotos. Abre el QR y escanéalo aquí.").font(.callout).foregroundStyle(.secondary) }
            if !model.running {
                HStack {
                    Button { scanner = true } label: { Label("Escanear QR", systemImage: "qrcode.viewfinder") }.buttonStyle(.borderedProminent).foregroundStyle(Color.black)
                    Button("Pegar enlace") { paste = true }
                }.font(.callout).lineLimit(1).minimumScaleFactor(0.85).disabled(model.connecting || model.preparing)
                if model.connection != nil { Button("Desconectar") { Task { await model.disconnect() } }.font(.footnote).disabled(model.connecting || model.preparing) }
            }
        }.card()
    }

    private var progressCard: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle().stroke(.white.opacity(0.08), lineWidth: 12)
                Circle().trim(from: 0, to: model.percentage).stroke(yellow, style: StrokeStyle(lineWidth: 12, lineCap: .round)).rotationEffect(.degrees(-90))
                VStack(spacing: 3) {
                    Text(model.percentage, format: .percent.precision(.fractionLength(1))).font(.system(size: 40, weight: .bold, design: .rounded)).monospacedDigit()
                    Text("fotos revisadas").font(.caption).foregroundStyle(.secondary)
                }
            }.frame(width: 194, height: 194).padding(.top, 10)
                .accessibilityElement(children: .ignore).accessibilityLabel("Progreso").accessibilityValue("\(model.completed) de \(model.total) fotos revisadas")
            Text("\(model.completed.formatted()) de \(model.total.formatted()) fotos").font(.headline).monospacedDigit()
            if model.queued > 0 { Label("\(model.queued) preparadas para subir en segundo plano", systemImage: "arrow.up.doc.on.clipboard").font(.caption).foregroundStyle(yellow) }
            HStack(spacing: 8) {
                metric(model.imported, "Nuevas", "arrow.up.circle", yellow)
                metric(model.existing, "Ya estaban", "checkmark.circle", .mint)
                metric(model.failed, "Fallidas", "exclamationmark.circle", .orange)
            }
            Text(model.message).font(.callout).multilineTextAlignment(.center)
            if !model.fileName.isEmpty { Text(model.fileName).font(.caption.monospaced()).foregroundStyle(.secondary).lineLimit(2) }
            if let progress = model.fileProgress {
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: progress)
                    Text("Envío de esta foto: \(Int(progress * 100)) %").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                }
            }
        }.card()
    }
    private func metric(_ count: Int, _ title: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(count.formatted()).font(.title2.bold()).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity).padding(.vertical, 14).background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 14))
    }
    private var results: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Últimos resultados").font(.title3.bold())
            Text("Se muestran hasta 50 fotos. El informe incluye todos los resultados de esta importación.").font(.footnote).foregroundStyle(.secondary)
            if let url = model.reportURL { ShareLink(item: url) { Label("Compartir informe CSV", systemImage: "square.and.arrow.up") } }
            else { Button("Preparar informe completo") { model.makeReport() }.disabled(model.running) }
            ForEach(model.recent) { item in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: item.state == "failed" ? "exclamationmark.circle" : item.state == "new" ? "arrow.up.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(item.state == "failed" ? .orange : item.state == "new" ? yellow : .mint)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.callout).lineLimit(2)
                        if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 0)
                    Text(item.label).font(.caption).foregroundStyle(.secondary)
                }
            }
        }.card()
    }
}

private extension View {
    func card() -> some View { padding(20).frame(maxWidth: .infinity, alignment: .leading).background(panel, in: RoundedRectangle(cornerRadius: 24)) }
}
