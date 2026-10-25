import SwiftUI
import BackgroundTasks

final class MiniTVAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: ImportModel.processingIdentifier, using: .main) { task in
            guard let task = task as? BGProcessingTask else { task.setTaskCompleted(success: false); return }
            Task { @MainActor in ImportModel.shared.handleProcessing(task) }
        }
        _ = ImportModel.shared
        return true
    }
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        guard identifier == BackgroundTransfers.identifier else { completionHandler(); return }
        BackgroundTransfers.shared.eventsCompletion = completionHandler
        _ = ImportModel.shared
    }
}

@main
struct MiniTVFotosApp: App {
    @UIApplicationDelegateAdaptor(MiniTVAppDelegate.self) private var delegate
    @StateObject private var model = ImportModel.shared
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(model)
                .onOpenURL { model.receive($0.absoluteString) }
                .onChange(of: phase) { _, next in
                    if next == .background { model.enteredBackground() }
                    else if next == .active { model.becameActive() }
                }
        }
    }
}
