import Foundation

// MARK: - Core movie data returned from lookup APIs

public struct MovieInfo: Identifiable, Codable, Hashable, Sendable {
    public let id: String          // IMDb tt number, e.g. "tt0133093"
    public let title: String
    public let year: Int
    public let imdbID: String      // same as id, kept explicit for clarity
    public let posterURL: URL?
    public let genre: String?
    public let director: String?
    public let plot: String?
    public let matchScore: Double  // 0.0–1.0, how well this matched OCR text

    public init(
        id: String,
        title: String,
        year: Int,
        imdbID: String,
        posterURL: URL? = nil,
        genre: String? = nil,
        director: String? = nil,
        plot: String? = nil,
        matchScore: Double = 0
    ) {
        self.id = id
        self.title = title
        self.year = year
        self.imdbID = imdbID
        self.posterURL = posterURL
        self.genre = genre
        self.director = director
        self.plot = plot
        self.matchScore = matchScore
    }
}

// MARK: - A single OCR text observation from the Vision framework

public struct TextObservation: Sendable {
    public let text: String
    public let confidence: Float
    /// Normalized bounding box in Vision coordinates (origin bottom-left, y increases upward).
    public let bounds: CGRect
    /// Relative font size (bounds.height in normalized image coords). Larger = more prominent.
    public let relativeHeight: CGFloat

    public init(text: String, confidence: Float, bounds: CGRect, relativeHeight: CGFloat) {
        self.text = text
        self.confidence = confidence
        self.bounds = bounds
        self.relativeHeight = relativeHeight
    }
}

// MARK: - One DVD detected (possibly from a larger photo of several DVDs)

public struct DVDRegion: Identifiable, Sendable {
    public let id: UUID
    /// Normalized bounding box within the original image.
    public let bounds: CGRect
    /// All text found inside this region, sorted by prominence.
    public let textObservations: [TextObservation]
    /// Cleaned title candidates extracted from the OCR text, best-first.
    public let candidateTitles: [String]
    /// Source image crop identifier (for display).
    public let cropIndex: Int

    public init(
        id: UUID = UUID(),
        bounds: CGRect,
        textObservations: [TextObservation],
        candidateTitles: [String],
        cropIndex: Int
    ) {
        self.id = id
        self.bounds = bounds
        self.textObservations = textObservations
        self.candidateTitles = candidateTitles
        self.cropIndex = cropIndex
    }
}

// MARK: - State of a single DVD scan through the pipeline

public enum DVDScanStatus: Sendable {
    case scanning
    case awaitingConfirmation([MovieInfo])
    case confirmed(MovieInfo)
    case unrecognized(String)  // OCR succeeded but no movie found; carries raw OCR text
    case failed(Error)
}

public struct DVDScan: Identifiable, Sendable {
    public let id: UUID
    public let region: DVDRegion
    public var status: DVDScanStatus

    public init(id: UUID = UUID(), region: DVDRegion, status: DVDScanStatus = .scanning) {
        self.id = id
        self.region = region
        self.status = status
    }

    /// The confirmed movie, if the user has chosen one.
    public var confirmedMovie: MovieInfo? {
        if case .confirmed(let m) = status { return m }
        return nil
    }

    /// Top OCR candidate title (first entry in the region).
    public var primaryCandidateTitle: String {
        region.candidateTitles.first ?? ""
    }
}

// MARK: - Plex-ready folder descriptor

public struct PlexFolder: Identifiable, Sendable {
    public let id: UUID
    public let scan: DVDScan
    /// The folder name as Plex expects it, e.g. "The Matrix (1999) {imdb-tt0133093}"
    public let folderName: String
    /// Suggested file base name (same as folder name).
    public let fileBaseName: String

    public init(id: UUID = UUID(), scan: DVDScan, folderName: String, fileBaseName: String) {
        self.id = id
        self.scan = scan
        self.folderName = folderName
        self.fileBaseName = fileBaseName
    }
}
