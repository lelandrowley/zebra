import SwiftUI
import PhotosUI
import DVDScannerCore

// MARK: - App-level ViewModel
//
// Owns the full pipeline state.  Bind this to the SwiftUI environment.
//
// Pipeline:
//   1. User picks image(s) → photosPickerItems
//   2. Load CGImage from each item
//   3. DVDTitleExtractor detects DVD regions + runs OCR
//   4. MovieMatcher searches OMDB + TMDB per region
//   5. User confirms/edits each DVDScan
//   6. PlexFolderGenerator produces folder names + shell script

@MainActor
public final class DVDScannerViewModel: ObservableObject {

    // MARK: - Published state

    @Published public var photosPickerItems: [PhotosPickerItem] = []
    @Published public var scans: [DVDScan] = []
    @Published public var isProcessing = false
    @Published public var processingProgress: Double = 0   // 0.0–1.0
    @Published public var processingMessage = ""
    @Published public var errorMessage: String?
    @Published public var plexFolders: [PlexFolder] = []
    @Published public var showingExport = false

    // MARK: - Configuration (stored in UserDefaults)

    @AppStorage("omdbAPIKey") public var omdbAPIKey = ""
    @AppStorage("tmdbAPIKey") public var tmdbAPIKey = ""
    @AppStorage("plexRootPath") public var plexRootPath = ""
    @AppStorage("useIMDbTag") public var useIMDbTag = true
    @AppStorage("autoConfirmThreshold") public var autoConfirmThreshold = 0.85

    // MARK: - Sub-services

    private let extractor = DVDTitleExtractor()

    private var matcher: MovieMatcher {
        MovieMatcher(config: MatcherConfig(
            omdbAPIKey: omdbAPIKey,
            tmdbAPIKey: tmdbAPIKey,
            autoConfirmThreshold: autoConfirmThreshold
        ))
    }

    private var generator: PlexFolderGenerator {
        PlexFolderGenerator(
            style: useIMDbTag ? .withIMDbID : .basic,
            rootPath: plexRootPath.isEmpty ? nil : plexRootPath
        )
    }

    public init() {}

    // MARK: - Process selected photos

    public func processSelectedPhotos() async {
        guard !photosPickerItems.isEmpty else { return }
        isProcessing = true
        processingProgress = 0
        processingMessage = "Loading images…"
        scans = []
        errorMessage = nil

        var cgImages: [CGImage] = []
        for item in photosPickerItems {
            if let data = try? await item.loadTransferable(type: Data.self),
               let source = CGImageSourceCreateWithData(data as CFData, nil),
               let img = CGImageSourceCreateImageAtIndex(source, 0, nil) {
                cgImages.append(img)
            }
        }

        guard !cgImages.isEmpty else {
            errorMessage = "Could not load images from the selected photos."
            isProcessing = false
            return
        }

        // Step 1: OCR all images
        processingMessage = "Detecting DVDs…"
        var allRegions: [DVDRegion] = []
        for (i, img) in cgImages.enumerated() {
            processingProgress = Double(i) / Double(cgImages.count) * 0.4
            let regions = (try? await extractor.extract(from: img, mode: .automatic)) ?? []
            allRegions.append(contentsOf: regions)
        }
        processingProgress = 0.4

        if allRegions.isEmpty {
            errorMessage = "No DVD regions detected.  Try a clearer, well-lit photo."
            isProcessing = false
            return
        }

        // Step 2: Match each region against movie databases concurrently
        processingMessage = "Looking up \(allRegions.count) DVD(s)…"
        let total = Double(allRegions.count)
        var completedScans: [DVDScan] = []

        await withTaskGroup(of: DVDScan.self) { group in
            for region in allRegions {
                group.addTask {
                    await self.matcher.match(region: region)
                }
            }
            for await scan in group {
                completedScans.append(scan)
                processingProgress = 0.4 + (Double(completedScans.count) / total) * 0.6
            }
        }

        // Sort by region left-to-right position (natural reading order)
        scans = completedScans.sorted { $0.region.bounds.minX < $1.region.bounds.minX }
        processingProgress = 1.0
        processingMessage = "Done."
        isProcessing = false
    }

    // MARK: - User confirmation

    public func confirm(scanID: UUID, with movie: MovieInfo) {
        guard let idx = scans.firstIndex(where: { $0.id == scanID }) else { return }
        scans[idx] = DVDScan(id: scanID, region: scans[idx].region, status: .confirmed(movie))
        regeneratePlexFolders()
    }

    public func markUnrecognized(scanID: UUID) {
        guard let idx = scans.firstIndex(where: { $0.id == scanID }) else { return }
        let raw = scans[idx].region.candidateTitles.first ?? "Unknown"
        scans[idx] = DVDScan(id: scanID, region: scans[idx].region, status: .unrecognized(raw))
        regeneratePlexFolders()
    }

    public func removeScan(scanID: UUID) {
        scans.removeAll { $0.id == scanID }
        regeneratePlexFolders()
    }

    // MARK: - Export

    public func regeneratePlexFolders() {
        plexFolders = generator.generate(from: scans)
    }

    public var shellScript: String {
        generator.shellScript(from: plexFolders)
    }

    public var confirmedCount: Int { scans.filter { $0.confirmedMovie != nil }.count }
    public var pendingCount: Int {
        scans.filter { if case .awaitingConfirmation = $0.status { return true }; return false }.count
    }
}
