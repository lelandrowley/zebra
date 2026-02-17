import SwiftUI

@main
struct DVDScannerApp: App {

    @StateObject private var viewModel = DVDScannerViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
        #if os(macOS)
        // Settings window (macOS only)
        Settings {
            SettingsView()
                .environmentObject(viewModel)
        }
        #endif
    }
}
