import Foundation

// MARK: - MovieMatcher
//
// Orchestrates the full title-confirmation pipeline for a single DVD region:
//
//  1. For each OCR candidate title:
//       a. Query OMDB (primary — has IMDb IDs natively)
//       b. Query TMDB (secondary — broader catalogue)
//  2. De-duplicate results by IMDb ID
//  3. Re-score every result against *all* candidate titles
//     (a movie that scores well against multiple OCR candidates is more likely correct)
//  4. Apply a year-consistency bonus if a 4-digit year is visible in the OCR text
//  5. Return top N sorted by combined score
//
// Confidence thresholds:
//   ≥ 0.85  → auto-confirm (high confidence, may skip user confirmation)
//   0.6–0.85→ present top results for user to pick
//   < 0.6   → flag as unrecognized; show all candidates and raw OCR

public struct MatcherConfig: Sendable {
    public var omdbAPIKey: String
    public var tmdbAPIKey: String
    public var maxCandidates: Int
    /// Score at which the top result is accepted without user interaction.
    public var autoConfirmThreshold: Double
    /// Minimum score to include a result in the returned list.
    public var minimumScore: Double

    public init(
        omdbAPIKey: String = "",
        tmdbAPIKey: String = "",
        maxCandidates: Int = 5,
        autoConfirmThreshold: Double = 0.85,
        minimumScore: Double = 0.4
    ) {
        self.omdbAPIKey = omdbAPIKey
        self.tmdbAPIKey = tmdbAPIKey
        self.maxCandidates = maxCandidates
        self.autoConfirmThreshold = autoConfirmThreshold
        self.minimumScore = minimumScore
    }
}

public actor MovieMatcher {

    private let omdb: OMDBService
    private let tmdb: TMDBService
    private let config: MatcherConfig

    public init(config: MatcherConfig) {
        self.config = config
        self.omdb = OMDBService(apiKey: config.omdbAPIKey)
        self.tmdb = TMDBService(apiKey: config.tmdbAPIKey)
    }

    // MARK: - Public API

    /// Match a `DVDRegion` to real movies.  Returns a `DVDScan` with its status set.
    public func match(region: DVDRegion) async -> DVDScan {
        let candidates = region.candidateTitles
        guard !candidates.isEmpty else {
            return DVDScan(region: region, status: .unrecognized("No text found"))
        }

        do {
            let movies = try await fetchAndRank(candidates: candidates)
            if movies.isEmpty {
                return DVDScan(region: region,
                               status: .unrecognized(candidates.first ?? ""))
            }

            // Auto-confirm if the top result is very confident
            let top = movies[0]
            if top.matchScore >= config.autoConfirmThreshold {
                return DVDScan(region: region, status: .confirmed(top))
            }
            return DVDScan(region: region, status: .awaitingConfirmation(movies))

        } catch {
            return DVDScan(region: region, status: .failed(error))
        }
    }

    // MARK: - Fetch + rank pipeline

    private func fetchAndRank(candidates: [String]) async throws -> [MovieInfo] {
        // Search both APIs for each candidate title concurrently
        var allResults: [MovieInfo] = []

        await withTaskGroup(of: [MovieInfo].self) { group in
            for candidate in candidates.prefix(3) { // top 3 OCR candidates
                // OMDB
                group.addTask {
                    (try? await self.omdb.search(title: candidate)) ?? []
                }
                // TMDB
                group.addTask {
                    (try? await self.tmdb.search(title: candidate)) ?? []
                }
            }
            for await results in group {
                allResults.append(contentsOf: results)
            }
        }

        // De-duplicate by IMDb ID, keeping highest score seen so far
        var deduped: [String: MovieInfo] = [:]
        for movie in allResults {
            if let existing = deduped[movie.imdbID] {
                if movie.matchScore > existing.matchScore {
                    deduped[movie.imdbID] = movie
                }
            } else {
                deduped[movie.imdbID] = movie
            }
        }

        // Re-score against ALL candidate titles (consensus boost)
        let rescored: [MovieInfo] = deduped.values.map { movie in
            let scores = candidates.map { StringSimilarity.combinedScore($0, movie.title) }
            let maxScore = scores.max() ?? 0
            let avgScore = scores.reduce(0, +) / Double(max(scores.count, 1))
            // Blend: 70% best individual match, 30% average across candidates
            let blended = maxScore * 0.7 + avgScore * 0.3

            // Year consistency bonus: if OCR text contains the release year, +0.05
            let yearBonus = candidates.contains { $0.contains(String(movie.year)) } ? 0.05 : 0
            let finalScore = min(blended + yearBonus, 1.0)

            return MovieInfo(
                id: movie.id,
                title: movie.title,
                year: movie.year,
                imdbID: movie.imdbID,
                posterURL: movie.posterURL,
                genre: movie.genre,
                director: movie.director,
                plot: movie.plot,
                matchScore: finalScore
            )
        }

        return rescored
            .filter { $0.matchScore >= config.minimumScore }
            .sorted { $0.matchScore > $1.matchScore }
            .prefix(config.maxCandidates)
            .map { $0 }
    }
}
