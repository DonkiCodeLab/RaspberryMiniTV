import ExpoModulesCore

public class MiniTVTransferModule: Module {
    public func definition() -> ModuleDefinition {
        Name("MiniTVTransfer")
        AsyncFunction("previewPairing") { (text: String) throws -> String in try PairingLink(text).server.absoluteString }
        AsyncFunction("connect") { (text: String) async throws in
            _ = try PairingLink(text)
            try await self.connect(text)
        }
        AsyncFunction("prepare") { () async throws in
            await ImportModel.shared.prepare()
            try await self.checkError()
        }
        AsyncFunction("start") { () async in await ImportModel.shared.start() }
        AsyncFunction("pause") { () async in await ImportModel.shared.pause() }
        AsyncFunction("report") { () async throws -> String in try await self.report() }
        AsyncFunction("getState") { () async -> [String: Any] in await self.state() }
    }
    @MainActor private func connect(_ text: String) async throws {
        let model = ImportModel.shared
        model.receive(text)
        try checkError()
        await model.connect()
        try checkError()
    }
    @MainActor private func checkError() throws {
        if let message = ImportModel.shared.error { throw PhotoAppError.message(message) }
    }
    @MainActor private func report() throws -> String {
        ImportModel.shared.makeReport()
        guard let url = ImportModel.shared.reportURL else { throw PhotoAppError.message("No se ha podido crear el informe.") }
        return url.absoluteString
    }
    @MainActor private func state() -> [String: Any] {
        let model = ImportModel.shared
        return [
            "connected": model.connected, "server": model.connection?.server.absoluteString ?? "",
            "running": model.running, "preparing": model.preparing, "limited": model.limited,
            "hasJob": model.hasJob, "canResume": model.canResume, "message": model.message,
            "error": model.error ?? "", "total": model.total, "imported": model.imported,
            "existing": model.existing, "failed": model.failed, "percentage": model.percentage,
            "fileName": model.fileName, "fileProgress": model.fileProgress ?? -1,
            "recent": model.recent.map { "\($0.label) · \($0.name)" + ($0.detail.isEmpty ? "" : "\n\($0.detail)") },
            "backgroundNotice": model.backgroundNotice ?? "iOS continúa los archivos preparados y decide cuándo preparar más. Si cierras la app a la fuerza, vuelve a abrirla para continuar."
        ]
    }
}
