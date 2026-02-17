import XCTest
@testable import DVDScannerCore

final class PlexFolderGeneratorTests: XCTestCase {

    private func makeMovie(title: String, year: Int, imdbID: String) -> MovieInfo {
        MovieInfo(id: imdbID, title: title, year: year, imdbID: imdbID, matchScore: 1.0)
    }

    // MARK: - Folder name format

    func testBasicNamingStyle() {
        let gen = PlexFolderGenerator(style: .basic)
        let movie = makeMovie(title: "The Matrix", year: 1999, imdbID: "tt0133093")
        XCTAssertEqual(gen.folderName(for: movie), "The Matrix (1999)")
    }

    func testWithIMDbIDStyle() {
        let gen = PlexFolderGenerator(style: .withIMDbID)
        let movie = makeMovie(title: "The Matrix", year: 1999, imdbID: "tt0133093")
        XCTAssertEqual(gen.folderName(for: movie), "The Matrix (1999) {imdb-tt0133093}")
    }

    // MARK: - Special character sanitization

    func testSanitizesForwardSlash() {
        let gen = PlexFolderGenerator(style: .basic)
        let movie = makeMovie(title: "AC/DC: Let There Be Rock", year: 1980, imdbID: "tt0080398")
        let name = gen.folderName(for: movie)
        XCTAssertFalse(name.contains("/"), "Forward slash must be removed from folder names")
    }

    func testSanitizesColon() {
        let gen = PlexFolderGenerator(style: .basic)
        let movie = makeMovie(title: "Batman: Mask of the Phantasm", year: 1993, imdbID: "tt0106364")
        let name = gen.folderName(for: movie)
        XCTAssertFalse(name.contains(":"))
    }

    func testSanitizesQuotes() {
        let gen = PlexFolderGenerator(style: .basic)
        let movie = makeMovie(title: #"She Said "Yes""#, year: 2020, imdbID: "tt9999999")
        let name = gen.folderName(for: movie)
        XCTAssertFalse(name.contains("\""))
    }

    // MARK: - Root path prepending

    func testRootPathPrepended() {
        let gen = PlexFolderGenerator(style: .basic, rootPath: "/Volumes/Media/Movies")
        let movie = makeMovie(title: "Inception", year: 2010, imdbID: "tt1375666")
        XCTAssertEqual(
            gen.folderPath(for: movie),
            "/Volumes/Media/Movies/Inception (2010)"
        )
    }

    func testEmptyRootPathNotPrepended() {
        let gen = PlexFolderGenerator(style: .basic, rootPath: "")
        let movie = makeMovie(title: "Inception", year: 2010, imdbID: "tt1375666")
        XCTAssertEqual(gen.folderPath(for: movie), "Inception (2010)")
    }

    // MARK: - Shell script generation

    func testShellScriptContainsMkdir() {
        let gen = PlexFolderGenerator(style: .withIMDbID, rootPath: "/tmp/Movies")
        let movie = makeMovie(title: "Gladiator", year: 2000, imdbID: "tt0172495")
        let region = DVDRegion(bounds: .zero, textObservations: [], candidateTitles: [], cropIndex: 0)
        let scan = DVDScan(region: region, status: .confirmed(movie))
        let folders = gen.generate(from: [scan])
        let script = gen.shellScript(from: folders)
        XCTAssertTrue(script.contains("mkdir -p"))
        XCTAssertTrue(script.contains("Gladiator"))
        XCTAssertTrue(script.contains("tt0172495"))
    }

    func testShellScriptSkipsUnconfirmedScans() {
        let gen = PlexFolderGenerator(style: .basic)
        let region = DVDRegion(bounds: .zero, textObservations: [], candidateTitles: [], cropIndex: 0)
        let scan = DVDScan(region: region, status: .unrecognized("Some Title"))
        let folders = gen.generate(from: [scan])
        XCTAssertTrue(folders.isEmpty)
    }

    // MARK: - Trailing periods stripped

    func testTrailingPeriodStripped() {
        let gen = PlexFolderGenerator(style: .basic)
        let movie = makeMovie(title: "Mr.", year: 2015, imdbID: "tt0000001")
        let name = gen.folderName(for: movie)
        XCTAssertFalse(name.hasSuffix("."))
    }
}
