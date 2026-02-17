import SwiftUI

// MARK: - Settings screen
//
// Stores API keys and preferences in UserDefaults via @AppStorage.

struct SettingsView: View {

    @EnvironmentObject var vm: DVDScannerViewModel

    var body: some View {
        Form {
            apiKeysSection
            plexSection
            matchingSection
            aboutSection
        }
        .navigationTitle("Settings")
        #if os(macOS)
        .frame(minWidth: 420)
        #endif
    }

    // MARK: - API Keys

    private var apiKeysSection: some View {
        Section {
            apiKeyField(
                label: "OMDB API Key",
                placeholder: "Get free key at omdbapi.com",
                binding: $vm.omdbAPIKey
            )
            Link("Get OMDB key (free, 1 000/day)",
                 destination: URL(string: "https://www.omdbapi.com/apikey.aspx")!)
                .font(.caption)

            apiKeyField(
                label: "TMDB API Key",
                placeholder: "Get free key at themoviedb.org",
                binding: $vm.tmdbAPIKey
            )
            Link("Get TMDB key (free)",
                 destination: URL(string: "https://www.themoviedb.org/settings/api")!)
                .font(.caption)

        } header: {
            Text("API Keys")
        } footer: {
            Text("Both keys are optional but strongly recommended. Without them, no movie lookup is performed.")
        }
    }

    // MARK: - Plex

    private var plexSection: some View {
        Section {
            Toggle("Include IMDb tag in folder name", isOn: $vm.useIMDbTag)
            Text("Example: The Matrix (1999) {imdb-tt0133093}")
                .font(.caption)
                .foregroundStyle(.secondary)

            LabeledContent("Root Folder") {
                TextField("e.g. /Volumes/Media/Movies", text: $vm.plexRootPath)
                    .multilineTextAlignment(.trailing)
            }
        } header: {
            Text("Plex")
        } footer: {
            Text("Root folder is prepended to paths in the exported shell script.")
        }
    }

    // MARK: - Matching thresholds

    private var matchingSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Auto-confirm threshold: \(Int(vm.autoConfirmThreshold * 100))%")
                Slider(value: $vm.autoConfirmThreshold, in: 0.5...1.0, step: 0.05)
            }
        } header: {
            Text("Matching")
        } footer: {
            Text("Results scored above this threshold are confirmed automatically without user review.")
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        Section("About") {
            LabeledContent("Version", value: "1.0")
            LabeledContent("OCR Engine", value: "Apple Vision (on-device)")
            LabeledContent("Databases", value: "OMDB + TMDB")
            LabeledContent("Plex Format", value: "Movie Title (Year) {imdb-ttXXX}")
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func apiKeyField(label: String, placeholder: String, binding: Binding<String>) -> some View {
        LabeledContent(label) {
            SecureField(placeholder, text: binding)
                .multilineTextAlignment(.trailing)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
        }
    }
}
