import SwiftUI
import DVDScannerCore

// MARK: - Movie confirmation screen
//
// Shows candidate matches for a single DVD scan.
// User can:
//  - Tap a candidate to confirm it
//  - Search manually if none are correct
//  - Mark as unrecognized / skip

struct MovieConfirmationView: View {

    let scan: DVDScan
    @EnvironmentObject var vm: DVDScannerViewModel

    @State private var manualSearchQuery = ""
    @State private var manualResults: [MovieInfo] = []
    @State private var isSearching = false
    @State private var showingManualSearch = false

    private var candidates: [MovieInfo] {
        if case .awaitingConfirmation(let ms) = scan.status { return ms }
        return []
    }

    var body: some View {
        List {
            ocrSection
            if !candidates.isEmpty { candidatesSection }
            if case .confirmed(let m) = scan.status { confirmedSection(m) }
            manualSearchSection
            actionsSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Confirm DVD")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Sections

    private var ocrSection: some View {
        Section("OCR Text Detected") {
            ForEach(scan.region.candidateTitles, id: \.self) { title in
                Label(title, systemImage: "text.viewfinder")
                    .font(.subheadline)
            }
        }
    }

    private var candidatesSection: some View {
        Section("Best Matches") {
            ForEach(candidates) { movie in
                MovieCandidateRow(movie: movie) {
                    vm.confirm(scanID: scan.id, with: movie)
                }
            }
        }
    }

    private func confirmedSection(_ movie: MovieInfo) -> some View {
        Section {
            MovieDetailCard(movie: movie)
        } header: {
            Label("Confirmed", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }

    private var manualSearchSection: some View {
        Section("Search Manually") {
            HStack {
                TextField("Movie title…", text: $manualSearchQuery)
                    .submitLabel(.search)
                    .onSubmit { Task { await performManualSearch() } }
                if isSearching { ProgressView() }
                else {
                    Button {
                        Task { await performManualSearch() }
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .disabled(manualSearchQuery.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            ForEach(manualResults) { movie in
                MovieCandidateRow(movie: movie) {
                    vm.confirm(scanID: scan.id, with: movie)
                }
            }
        }
    }

    private var actionsSection: some View {
        Section {
            Button(role: .destructive) {
                vm.markUnrecognized(scanID: scan.id)
            } label: {
                Label("Mark as Unrecognized", systemImage: "xmark.circle")
            }
        }
    }

    // MARK: - Manual search

    private func performManualSearch() async {
        let query = manualSearchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return }
        isSearching = true
        manualResults = []

        let matcher = MovieMatcher(config: MatcherConfig(
            omdbAPIKey: vm.omdbAPIKey,
            tmdbAPIKey: vm.tmdbAPIKey
        ))

        // Build a synthetic region with the manually typed title as the only candidate
        let dummyRegion = DVDRegion(
            bounds: .zero,
            textObservations: [],
            candidateTitles: [query],
            cropIndex: -1
        )
        let result = await matcher.match(region: dummyRegion)

        if case .awaitingConfirmation(let ms) = result.status { manualResults = ms }
        else if case .confirmed(let m) = result.status { manualResults = [m] }

        isSearching = false
    }
}

// MARK: - Reusable movie candidate row

struct MovieCandidateRow: View {

    let movie: MovieInfo
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                // Poster
                AsyncImage(url: movie.posterURL) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        Image(systemName: "film")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 44, height: 60)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 6))

                VStack(alignment: .leading, spacing: 4) {
                    Text(movie.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    HStack(spacing: 8) {
                        Text(String(movie.year))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(movie.imdbID)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    // Match score bar
                    ScoreBar(score: movie.matchScore)
                }
                Spacer()
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(.accentColor)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Match score bar

struct ScoreBar: View {
    let score: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2).fill(Color(.systemGray5))
                RoundedRectangle(cornerRadius: 2)
                    .fill(scoreColor)
                    .frame(width: geo.size.width * score)
            }
        }
        .frame(height: 4)
    }

    private var scoreColor: Color {
        score >= 0.75 ? .green : score >= 0.55 ? .orange : .red
    }
}

// MARK: - Confirmed movie detail card

struct MovieDetailCard: View {

    let movie: MovieInfo

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            AsyncImage(url: movie.posterURL) { phase in
                if case .success(let img) = phase {
                    img.resizable().scaledToFill()
                } else {
                    Color(.systemGray5)
                }
            }
            .frame(width: 70, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 6) {
                Text(movie.title).font(.headline)
                Text(String(movie.year)).font(.subheadline).foregroundStyle(.secondary)
                Text(movie.imdbID).font(.caption.monospaced()).foregroundStyle(.secondary)
                if let genre = movie.genre { Text(genre).font(.caption).foregroundStyle(.secondary) }
                if let director = movie.director { Text("Dir: \(director)").font(.caption).foregroundStyle(.secondary) }
            }
        }
        .padding(.vertical, 6)
    }
}
