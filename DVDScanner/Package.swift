// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DVDScanner",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "DVDScannerCore", targets: ["DVDScannerCore"]),
    ],
    targets: [
        .target(
            name: "DVDScannerCore",
            dependencies: [],
            path: "Sources/DVDScannerCore"
        ),
        // DVDScannerApp sources are added directly to an Xcode project.
        // See Sources/DVDScannerApp/ — drag those files into your Xcode target.
        .testTarget(
            name: "DVDScannerCoreTests",
            dependencies: ["DVDScannerCore"],
            path: "Tests/DVDScannerCoreTests"
        )
    ]
)
