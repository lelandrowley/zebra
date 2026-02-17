import Foundation

// MARK: - OMDB API Service
//
// Free tier: 1 000 requests/day.  Register at https://www.omdbapi.com/apikey.aspx
//
// Key endpoints used:
//   Search:      GET http://www.omdbapi.com/?s={title}&type=movie&apikey={key}
//   Detail by ID: GET http://www.omdbapi.com/?i={imdbID}&apikey={key}

public actor OMDBService {

    public enum OMDBError: Error, LocalizedError {
        case missingAPIKey
        case noResults(String)
        case apiError(String)
        case decodingError

        public var errorDescription: String? {
            switch self {
            case .missingAPIKey:   return "OMDB API key not configured."
            case .noResults(let t): return "No OMDB results for "\(t)"."
            case .apiError(let m): return "OMDB error: \(m)"
            case .decodingError:   return "Failed to decode OMDB response."
            }
        }
    }

    private let apiKey: String
    private let session: URLSession

    public init(apiKey: String, session: URLSession = .shared) {
        self.apiKey = apiKey
        self.session = session
    }

    // MARK: - Search by title

    /// Returns up to `limit` movie results matching `title`, scored against the query.
    public func search(title: String, limit: Int = 5) async throws -> [MovieInfo] {
        guard !apiKey.isEmpty else { throw OMDBError.missingAPIKey }

        var components = URLComponents(string: "https://www.omdbapi.com/")!
        components.queryItems = [
            URLQueryItem(name: "s", value: title),
            URLQueryItem(name: "type", value: "movie"),
            URLQueryItem(name: "apikey", value: apiKey),
        ]
        guard let url = components.url else { throw OMDBError.apiError("Bad URL") }

        let (data, _) = try await session.data(from: url)
        let response = try JSONDecoder().decode(OMDBSearchResponse.self, from: data)

        guard response.response == "True", let results = response.search else {
            if let err = response.error { throw OMDBError.apiError(err) }
            throw OMDBError.noResults(title)
        }

        // Enrich each result with a similarity score vs the query
        let movies: [MovieInfo] = results.prefix(limit).compactMap { item in
            guard let year = parseYear(item.year) else { return nil }
            return MovieInfo(
                id: item.imdbID,
                title: item.title,
                year: year,
                imdbID: item.imdbID,
                posterURL: item.poster.flatMap { URL(string: $0) },
                matchScore: StringSimilarity.combinedScore(title, item.title)
            )
        }
        return movies.sorted { $0.matchScore > $1.matchScore }
    }

    // MARK: - Fetch full detail by IMDb ID

    /// Returns a fully populated `MovieInfo` for the given `imdbID` (e.g. "tt0133093").
    public func movie(byIMDbID imdbID: String) async throws -> MovieInfo {
        guard !apiKey.isEmpty else { throw OMDBError.missingAPIKey }

        var components = URLComponents(string: "https://www.omdbapi.com/")!
        components.queryItems = [
            URLQueryItem(name: "i", value: imdbID),
            URLQueryItem(name: "plot", value: "short"),
            URLQueryItem(name: "apikey", value: apiKey),
        ]
        guard let url = components.url else { throw OMDBError.apiError("Bad URL") }

        let (data, _) = try await session.data(from: url)
        let item = try JSONDecoder().decode(OMDBDetailResponse.self, from: data)

        guard item.response == "True" else {
            throw OMDBError.apiError(item.error ?? "Unknown error")
        }
        guard let year = parseYear(item.year) else {
            throw OMDBError.decodingError
        }
        return MovieInfo(
            id: item.imdbID,
            title: item.title,
            year: year,
            imdbID: item.imdbID,
            posterURL: item.poster.flatMap { URL(string: $0) },
            genre: item.genre,
            director: item.director,
            plot: item.plot,
            matchScore: 1.0
        )
    }

    // MARK: - Year parsing

    private func parseYear(_ raw: String?) -> Int? {
        guard let raw else { return nil }
        // Year may be "2003", "2003–2007", "2003–", etc.
        let digits = raw.prefix(4)
        return Int(digits)
    }

    // MARK: - Codable response types (private)

    private struct OMDBSearchResponse: Codable {
        let search: [OMDBSearchItem]?
        let response: String
        let error: String?

        enum CodingKeys: String, CodingKey {
            case search = "Search"
            case response = "Response"
            case error = "Error"
        }
    }

    private struct OMDBSearchItem: Codable {
        let title: String
        let year: String
        let imdbID: String
        let poster: String?

        enum CodingKeys: String, CodingKey {
            case title = "Title"
            case year = "Year"
            case imdbID
            case poster = "Poster"
        }
    }

    private struct OMDBDetailResponse: Codable {
        let title: String
        let year: String
        let imdbID: String
        let poster: String?
        let genre: String?
        let director: String?
        let plot: String?
        let response: String
        let error: String?

        enum CodingKeys: String, CodingKey {
            case title = "Title"
            case year = "Year"
            case imdbID
            case poster = "Poster"
            case genre = "Genre"
            case director = "Director"
            case plot = "Plot"
            case response = "Response"
            case error = "Error"
        }
    }
}
