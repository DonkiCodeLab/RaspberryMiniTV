import AppKit

// Original vector-drawn brand assets, rendered at each required tvOS size.
let root = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "tvOSApp/MiniTV/Assets.xcassets", isDirectory: true)
let fm = FileManager.default
let info: [String: Any] = ["author": "com.donkicodelab.minitv.tv", "version": 1]
func manifest(_ url: URL, _ values: [String: Any] = [:]) throws {
    try fm.createDirectory(at: url, withIntermediateDirectories: true)
    var object = values; object["info"] = info
    try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]).write(to: url.appendingPathComponent("Contents.json"))
}
let yellow = NSColor(calibratedRed: 1, green: 0.83, blue: 0.12, alpha: 1)
func draw(_ url: URL, width: Int, height: Int, layer: Int?) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
    let cg = context.cgContext
    cg.scaleBy(x: CGFloat(width) / 400, y: CGFloat(height) / 240)
    if layer == nil || layer == 2 {
        NSGradient(starting: NSColor(calibratedRed: 0.2, green: 0.12, blue: 0.36, alpha: 1),
                   ending: NSColor(calibratedRed: 0.025, green: 0.035, blue: 0.08, alpha: 1))!.draw(in: NSRect(x: 0, y: 0, width: 400, height: 240), angle: -45)
        NSColor.white.withAlphaComponent(0.025).setFill()
        NSBezierPath(ovalIn: NSRect(x: -80, y: 100, width: 300, height: 300)).fill()
        NSBezierPath(ovalIn: NSRect(x: 300, y: -160, width: 300, height: 300)).fill()
    }
    if layer == nil || layer == 1 {
        let antenna = NSBezierPath(); antenna.move(to: NSPoint(x: 200, y: 177)); antenna.line(to: NSPoint(x: 172, y: 203));
        antenna.move(to: NSPoint(x: 200, y: 177)); antenna.line(to: NSPoint(x: 234, y: 205)); antenna.lineWidth = 6
        antenna.lineCapStyle = .round; yellow.setStroke(); antenna.stroke()
        yellow.setFill(); NSBezierPath(roundedRect: NSRect(x: 91, y: 52, width: 218, height: 132), xRadius: 23, yRadius: 23).fill()
        NSColor(calibratedRed: 0.1, green: 0.065, blue: 0.18, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 102, y: 63, width: 196, height: 110), xRadius: 14, yRadius: 14).fill()
        yellow.setFill(); NSBezierPath(roundedRect: NSRect(x: 130, y: 39, width: 140, height: 7), xRadius: 3, yRadius: 3).fill()
    }
    if layer == nil || layer == 0 {
        let text = "MiniTV" as NSString
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 43, weight: .heavy), .foregroundColor: NSColor.white]
        let size = text.size(withAttributes: attrs)
        text.draw(at: NSPoint(x: (400 - size.width) / 2, y: 91), withAttributes: attrs)
    }
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: url)
}
try manifest(root)
let brand = root.appendingPathComponent("App Icon & Top Shelf Image.brandassets")
var assets: [[String: String]] = []
for (name, w, h, scales) in [("App Icon", 400, 240, [1, 2]), ("App Store Icon", 1280, 768, [1])] {
    let stack = brand.appendingPathComponent(name + ".imagestack")
    try manifest(stack, ["layers": ["Foreground", "Television", "Background"].map { ["filename": $0 + ".imagestacklayer"] }])
    for (layer, label) in ["Foreground", "Television", "Background"].enumerated() {
        let folder = stack.appendingPathComponent(label + ".imagestacklayer/Content.imageset")
        try manifest(folder, ["images": scales.map { ["idiom": "tv", "filename": "layer-\($0)x.png", "scale": "\($0)x"] }])
        for scale in scales { try draw(folder.appendingPathComponent("layer-\(scale)x.png"), width: w * scale, height: h * scale, layer: layer) }
    }
    assets.append(["filename": name + ".imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "\(w)x\(h)"])
}
for (name, width, role) in [("Top Shelf", 1920, "top-shelf-image"), ("Top Shelf Wide", 2320, "top-shelf-image-wide")] {
    let folder = brand.appendingPathComponent(name + ".imageset")
    try manifest(folder, ["images": [1, 2].map { ["idiom": "tv", "filename": "shelf-\($0)x.png", "scale": "\($0)x"] }])
    for scale in [1, 2] { try draw(folder.appendingPathComponent("shelf-\(scale)x.png"), width: width * scale, height: 720 * scale, layer: nil) }
    assets.append(["filename": name + ".imageset", "idiom": "tv", "role": role, "size": "\(width)x720"])
}
try manifest(brand, ["assets": assets])
try draw(root.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("icon-preview.png"), width: 800, height: 480, layer: nil)
print("Generated tvOS icon layers and Top Shelf assets")
