import ExpoModulesCore
import BackgroundTasks

public class MiniTVTransferDelegate: ExpoAppDelegateSubscriber {
    public func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: ImportModel.processingIdentifier, using: .main) { task in
            guard let processing = task as? BGProcessingTask else { task.setTaskCompleted(success: false); return }
            Task { @MainActor in ImportModel.shared.handleProcessing(processing) }
        }
        _ = ImportModel.shared
        return true
    }
    public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == BackgroundTransfers.identifier else { completionHandler(); return }
        BackgroundTransfers.shared.eventsCompletion = completionHandler
        _ = ImportModel.shared
    }
    public func applicationDidEnterBackground(_ application: UIApplication) { ImportModel.shared.enteredBackground() }
    public func applicationDidBecomeActive(_ application: UIApplication) { ImportModel.shared.becameActive() }
}
