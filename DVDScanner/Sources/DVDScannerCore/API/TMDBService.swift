import Foundation

// MARK: - TMDB API Service
//
// Free API key at https://www.themoviedb.org/settings/api
// Used as a fallback / cross-reference when OMDB results are weak.
//
// Key endpoints:
//   Search:        GET https://api.themoviedb.org/3/search/movie?query={title}&api_key={key}
//   External IDs:  GET https://api.themoviedb.org/3/movie/{id}/external_ids?api_key={key}
//   Poster image:  https://image.tmdb.org/t/p/w342/{poster_path}

public actor TMDBService {

    public enum TMDBError: Error, LocalizedError {
        case missingAPIKey
        case noResults(String)
        case apiError(String)
        case noIMDbID(Int)

        public var errorDescription: String? {
            switch self {
            case .missingAPIKey:      return "TMDB API key not configured."
            case .noResults(let t):   return "No TMDB results for "\(t)"."
            case .apiError(let m):    return "TMDB error: \(m)"
            case .noIMDbID(let id):   return "TMDB movie \(id) has no IMDb ID."
            }
        }
    }

    private let apiKey: String
    private let session: URLSession
    private static let baseURL = "https://api.themoviedb.org/3"
    private static let imageBase = "https://image.tmdb.org/t/p/w342"

    public init(apiKey: String, session: URLSession = .shared) {
        self.apiKey = apiKey
        self.session = session
    }

    // MARK: - Search by title

    /// Returns up to `limit` movies matching `title`, each with an IMDb ID resolved.
    public func search(title: String, limit: Int = 5) async throws -> [MovieInfo] {
        guard !apiKey.isEmpty else { throw TMDBError.missingAPIKey }

        var components = URLComponents(string: "\(Self.baseURL)/search/movie")!
        components.queryItems = [
            URLQueryItem(name: "query", value: title),
            URLQueryItem(name: "api_key", value: apiKey),
            URLQueryItem(name: "include_adult", value: "false"),
        ]
        guard let url = components.url else { throw TMDBError.apiError("Bad URL") }

        let (data, _) = try await session.data(from: url)
        let response = try JSONDecoder().decode(TMDBSearchResponse.self, from: data)

        guard !response.results.isEmpty else { throw TMDBError.noResults(title) }

        // Resolve IMDb IDs concurrently for the top results
        let topResults = Array(response.results.prefix(limit))
        var movies: [MovieInfo] = []

        await withTaskGroup(of: MovieInfo?.self) { group in
            for item in topResults {
                group.addTask {
                    try? await self.toMovieInfo(item: item, queryTitle: title)
                }
            }
            for await movie in group {
                if let movie { movies.append(movie) }
            }
        }

        return movies.sorted { $0.matchScore > $1.matchScore }
    }

    // MARK: - Fetch external IDs (to get IMDb tt number)

    public func imdbID(forTMDBMovieID tmdbID: Int) async throws -> String {
        guard !apiKey.isEmpty else { throw TMDBError.missingAPIKey }

        var components = URLComponents(string: "\(Self.baseURL)/movie/\(tmdbID)/external_ids")!
        components.queryItems = [URLQueryItem(name: "api_key", value: apiKey)]
        guard let url = components.url else { throw TMDBError.apiError("Bad URL") }

        let (data, _) = try await session.data(from: url)
        let ext = try JSONDecoder().decode(TMDBExternalIDs.self, from: data)

        guard let imdb = ext.imdb_id, !imdb.isEmpty else {
            throw TMDBError.noIMDbID(tmdbID)
        }
        return imdb
    }

    // MARK: - Helpers

    private func toMovieInfo(item: TMDBSearchResult, queryTitle: String) async throws -> MovieInfo {
        let imdb = try await imdbID(forTMDBMovieID: item.id)
        let year = parseYear(item.release_date)
        let posterURL: URL? = item.poster_path.flatMap {
            URL(string: Self.imageBase + $0)
        }
        return MovieInfo(
            id: imdb,
            title: item.title,
            year: year ?? 0,
            imdbID: imdb,
            posterURL: posterURL,
            matchScore: StringSimilarity.combinedScore(queryTitle, item.title)
        )
    }

    private func parseYear(_ dateString: String?) -> Int? {
        guard let s = dateString, s.count >= 4 else { return nil }
        return Int(s.prefix(4))
    }

    // MARK: - Codable types (private)

    private struct TMDBSearchResponse: Codable {
        let results: [TMDBSearchResult]
    }

    private struct TMDBSearchResult: Codable {
        let id: Int
        let title: String
        let release_date: String?
        let poster_path: String?
    }

    private struct TMDBExternalIDs: Codable {
        let imdb_id: String?
    }
}
