import SwiftUI
import AVFoundation

struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeUIViewController(context: Context) -> ScannerController { ScannerController(onCode: onCode) }
    func updateUIViewController(_ controller: ScannerController, context: Context) {}
    static func dismantleUIViewController(_ controller: ScannerController, coordinator: ()) { controller.stop() }
}

final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "MiniTVFotos.camera")
    private var preview: AVCaptureVideoPreviewLayer?
    private var delivered = false
    private var stopped = false // Accessed only on the camera queue.
    private let onCode: (String) -> Void
    init(onCode: @escaping (String) -> Void) { self.onCode = onCode; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard let self else { return }
            if granted { self.configure() }
            else { self.showError("Permite el acceso a la cámara en Ajustes, o pega el enlace QR desde la pantalla principal.") }
        }
    }
    private func configure() {
        queue.async { [weak self] in
            guard let self, !self.stopped else { return }
            guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                self.showError("La cámara no está disponible. Puedes pegar el enlace del QR."); return
            }
            self.session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard self.session.canAddOutput(output) else { self.showError("No se ha podido iniciar el escáner."); return }
            self.session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            DispatchQueue.main.async {
                let preview = AVCaptureVideoPreviewLayer(session: self.session)
                preview.videoGravity = .resizeAspectFill; preview.frame = self.view.bounds
                self.view.layer.insertSublayer(preview, at: 0); self.preview = preview
            }
            self.session.startRunning()
        }
    }
    private func showError(_ text: String) {
        DispatchQueue.main.async {
            let label = UILabel(); label.text = text; label.textColor = .white; label.numberOfLines = 0; label.textAlignment = .center
            label.translatesAutoresizingMaskIntoConstraints = false; self.view.addSubview(label)
            NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: self.view.leadingAnchor, constant: 32), label.trailingAnchor.constraint(equalTo: self.view.trailingAnchor, constant: -32), label.centerYAnchor.constraint(equalTo: self.view.centerYAnchor)])
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    func stop() { queue.async { self.stopped = true; self.session.stopRunning() } }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !delivered, let code = objects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first else { return }
        delivered = true; stop(); onCode(code)
    }
}
