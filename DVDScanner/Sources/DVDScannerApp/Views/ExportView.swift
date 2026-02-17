import SwiftUI
import DVDScannerCore

// MARK: - Export view
//
// Shows:
//  1. A preview of all generated Plex folder names
//  2. The full shell script
//  3. Share/copy buttons

struct ExportView: View {

    @EnvironmentObject var vm: DVDScannerViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showCopiedAlert = false
    @State private var selectedTab = 0

    var body: some View {
        NavigationStack {
            TabView(selection: $selectedTab) {
                folderListTab.tabItem { Label("Folders", systemImage: "folder") }.tag(0)
                scriptTab.tabItem { Label("Script", systemImage: "terminal") }.tag(1)
            }
            .navigationTitle("Export to Plex")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    shareButton
                }
            }
        }
        .overlay(alignment: .top) {
            if showCopiedAlert {
                Text("Copied to clipboard")
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut, value: showCopiedAlert)
    }

    // MARK: - Folder list tab

    private var folderListTab: some View {
        List {
            Section {
                Text("\(vm.plexFolders.count) folder(s) ready · \(vm.scans.count - vm.confirmedCount) skipped")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Plex Folders") {
                ForEach(vm.plexFolders) { folder in
                    VStack(alignment: .leading, spacing: 4) {
                        Label(folder.folderName, systemImage: "folder.fill")
                            .font(.subheadline)
                            .lineLimit(2)
                        if let movie = folder.scan.confirmedMovie {
                            Text("IMDb \(movie.imdbID) · \(movie.year)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    .swipeActions {
                        Button(role: .destructive) {
                            // Nothing here — user must remove from main scan list
                        } label: { Label("Remove", systemImage: "trash") }
                    }
                }
            }

            if vm.plexFolders.isEmpty {
                ContentUnavailableView(
                    "No Confirmed Movies",
                    systemImage: "folder.badge.questionmark",
                    description: Text("Go back and confirm the detected DVDs.")
                )
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Shell script tab

    private var scriptTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Paste this into Terminal to create the folders:")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                Text(vm.shellScript)
                    .font(.system(.caption, design: .monospaced))
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal)
                    .textSelection(.enabled)

                Button {
                    copyScript()
                } label: {
                    Label("Copy Script", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
    }

    // MARK: - Share

    private var shareButton: some View {
        ShareLink(
            item: vm.shellScript,
            preview: SharePreview(
                "Plex Folder Setup Script",
                icon: Image(systemName: "folder.fill")
            )
        )
    }

    // MARK: - Copy to clipboard

    private func copyScript() {
        #if os(iOS)
        UIPasteboard.general.string = vm.shellScript
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(vm.shellScript, forType: .string)
        #endif
        showCopiedAlert = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            showCopiedAlert = false
        }
    }
}
