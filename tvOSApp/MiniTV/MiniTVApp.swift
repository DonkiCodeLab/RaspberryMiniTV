import SwiftUI
import AVFAudio

@main
struct MiniTVApp: App {
    @StateObject private var session = TVSession()
    @Environment(\.scenePhase) private var phase
    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
    }
    var body: some Scene {
        WindowGroup {
            Group {
                if session.api == nil { ConnectionView() }
                else { MainView() }
            }
            .environmentObject(session)
            .preferredColorScheme(.dark)
            .tint(.yellow)
            .alert("MiniTV", isPresented: Binding(get: { session.error != nil }, set: { if !$0 { session.error = nil } })) {
                Button("Aceptar", role: .cancel) { session.error = nil }
            } message: { Text(session.error ?? "") }
            .alert("MiniTV", isPresented: Binding(get: { session.notice != nil }, set: { if !$0 { session.notice = nil } })) {
                Button("Aceptar", role: .cancel) { session.notice = nil }
            } message: { Text(session.notice ?? "") }
            .fullScreenCover(item: $session.playback, onDismiss: { Task { await session.loadProfile() } }) { request in
                PlaybackView(request: request)
            }
            .fullScreenCover(item: $session.reader, onDismiss: { Task { await session.loadProfile() } }) { book in
                BookReaderView(book: book).environmentObject(session)
            }
            .onChange(of: phase) { _, value in
                if value == .active, session.api != nil { Task { await session.loadProfile() } }
            }
        }
    }
}

struct ConnectionView: View {
    @EnvironmentObject private var session: TVSession
    @State private var address = UserDefaults.standard.string(forKey: "minitv.server") ?? ""
    @State private var pin = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        HStack(spacing: 100) {
            VStack(alignment: .leading, spacing: 28) {
                Label("MiniTV", systemImage: "tv.fill").font(.system(size: 66, weight: .heavy)).foregroundStyle(.yellow)
                Text("Tu biblioteca.\nEn pantalla grande.").font(.system(size: 52, weight: .bold))
                Text("Películas, series, fotos, libros y juegos.\nMuévete con el mando y pulsa para elegir.")
                    .font(.title3).foregroundStyle(.secondary)
            }.frame(maxWidth: 760, alignment: .leading)
            VStack(alignment: .leading, spacing: 26) {
                Text("Conecta tu MiniTV").font(.title2.bold())
                Text("Conecta ambos dispositivos a la misma red. Introduce la dirección y el PIN que usas para abrir la web.")
                    .foregroundStyle(.secondary).font(.callout)
                TextField("http://192.168.1.50:5050", text: $address)
                    .textContentType(.URL).keyboardType(.URL).autocorrectionDisabled()
                SecureField("PIN de MiniTV", text: $pin).keyboardType(.numberPad)
                if let error { Text(error).font(.callout).foregroundStyle(.orange) }
                Button {
                    busy = true; error = nil
                    Task {
                        do { try await session.connect(address: address, pin: pin) }
                        catch { self.error = error.localizedDescription }
                        busy = false
                    }
                } label: {
                    HStack { if busy { ProgressView() }; Text(busy ? "Conectando…" : "Conectar") }.frame(maxWidth: .infinity)
                }.disabled(busy || address.isEmpty || pin.isEmpty)
            }.frame(width: 580)
        }
        .padding(90).frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TVBackground())
    }
}

struct TVBackground: View {
    var body: some View {
        LinearGradient(colors: [Color(red: 0.12, green: 0.08, blue: 0.24), Color(red: 0.025, green: 0.035, blue: 0.07)],
                       startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
    }
}
