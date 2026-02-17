import SwiftUI
import PhotosUI
import DVDScannerCore

// MARK: - Main app screen

struct ContentView: View {

    @EnvironmentObject var vm: DVDScannerViewModel

    var body: some View {
        NavigationStack {
            Group {
                if vm.scans.isEmpty && !vm.isProcessing {
                    EmptyStateView()
                } else if vm.isProcessing {
                    ProcessingView()
                } else {
                    ScanResultsView()
                }
            }
            .navigationTitle("DVD Scanner")
            .toolbar { toolbarContent }
        }
        .sheet(isPresented: $vm.showingExport) {
            ExportView()
                .environmentObject(vm)
        }
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        #if os(iOS)
        ToolbarItem(placement: .navigationBarTrailing) { photoPickerButton }
        ToolbarItem(placement: .navigationBarLeading) { settingsLink }
        #else
        ToolbarItem { photoPickerButton }
        ToolbarItem { settingsLink }
        #endif

        if !vm.scans.isEmpty {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    vm.regeneratePlexFolders()
                    vm.showingExport = true
                } label: {
                    Label("Export", systemImage: "square.and.arrow.up")
                }
                .disabled(vm.confirmedCount == 0)
            }
        }
    }

    private var photoPickerButton: some View {
        PhotosPicker(
            selection: $vm.photosPickerItems,
            maxSelectionCount: 20,
            matching: .images
        ) {
            Label("Scan DVDs", systemImage: "camera.viewfinder")
        }
        .onChange(of: vm.photosPickerItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await vm.processSelectedPhotos() }
        }
    }

    private var settingsLink: some View {
        NavigationLink(destination: SettingsView().environmentObject(vm)) {
            Label("Settings", systemImage: "gear")
        }
    }
}

// MARK: - Empty state

struct EmptyStateView: View {

    @EnvironmentObject var vm: DVDScannerViewModel

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "opticaldisc")
                .font(.system(size: 72))
                .foregroundStyle(.secondary)

            Text("Scan Your DVD Collection")
                .font(.title2.bold())

            Text("Take or import a photo of your DVDs.\nThe app will identify each title and create\nthe correct Plex folder structure.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            PhotosPicker(
                selection: $vm.photosPickerItems,
                maxSelectionCount: 20,
                matching: .images
            ) {
                Label("Choose Photos", systemImage: "photo.on.rectangle.angled")
                    .font(.headline)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .onChange(of: vm.photosPickerItems) { _, items in
                guard !items.isEmpty else { return }
                Task { await vm.processSelectedPhotos() }
            }

            if vm.omdbAPIKey.isEmpty || vm.tmdbAPIKey.isEmpty {
                Label("Add API keys in Settings for best results", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding()
    }
}

// MARK: - Processing state

struct ProcessingView: View {

    @EnvironmentObject var vm: DVDScannerViewModel

    var body: some View {
        VStack(spacing: 20) {
            ProgressView(value: vm.processingProgress) {
                Text(vm.processingMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .progressViewStyle(.linear)
            .padding(.horizontal, 40)

            Text("\(Int(vm.processingProgress * 100))%")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}

// MARK: - Results list

struct ScanResultsView: View {

    @EnvironmentObject var vm: DVDScannerViewModel

    var body: some View {
        List {
            if vm.pendingCount > 0 {
                Section {
                    Text("\(vm.pendingCount) DVD(s) need confirmation")
                        .foregroundStyle(.orange)
                        .font(.subheadline)
                } header: { Text("Status") }
            }

            Section("Detected DVDs (\(vm.scans.count))") {
                ForEach(vm.scans) { scan in
                    NavigationLink(destination: MovieConfirmationView(scan: scan)
                        .environmentObject(vm)) {
                        DVDScanRowView(scan: scan)
                    }
                }
                .onDelete { offsets in
                    offsets.forEach { vm.removeScan(scanID: vm.scans[$0].id) }
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}

// MARK: - Single row in the results list

struct DVDScanRowView: View {

    let scan: DVDScan

    var body: some View {
        HStack(spacing: 12) {
            statusIcon
            VStack(alignment: .leading, spacing: 4) {
                Text(rowTitle)
                    .font(.headline)
                    .lineLimit(1)
                Text(rowSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            if case .awaitingConfirmation = scan.status {
                Image(systemName: "chevron.right")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusIcon: some View {
        Group {
            switch scan.status {
            case .confirmed:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            case .awaitingConfirmation:
                Image(systemName: "questionmark.circle.fill").foregroundStyle(.orange)
            case .unrecognized:
                Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
            case .scanning:
                ProgressView()
            case .failed:
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
            }
        }
        .font(.title3)
    }

    private var rowTitle: String {
        switch scan.status {
        case .confirmed(let m):              return "\(m.title) (\(m.year))"
        case .awaitingConfirmation(let ms):  return ms.first?.title ?? scan.primaryCandidateTitle
        case .unrecognized(let raw):         return raw.isEmpty ? "Unrecognized" : raw
        case .scanning:                      return "Scanning…"
        case .failed:                        return "Error"
        }
    }

    private var rowSubtitle: String {
        switch scan.status {
        case .confirmed(let m):
            return "IMDb: \(m.imdbID) · \(Int(m.matchScore * 100))% match"
        case .awaitingConfirmation(let ms):
            return "\(ms.count) candidates — tap to confirm"
        case .unrecognized:
            return "No match found — tap to search manually"
        case .scanning:
            return ""
        case .failed(let e):
            return e.localizedDescription
        }
    }
}
