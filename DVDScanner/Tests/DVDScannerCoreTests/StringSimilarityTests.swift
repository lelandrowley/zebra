import XCTest
@testable import DVDScannerCore

final class StringSimilarityTests: XCTestCase {

    // MARK: - Levenshtein distance

    func testLevenshteinIdentical() {
        XCTAssertEqual(StringSimilarity.levenshteinDistance("matrix", "matrix"), 0)
    }

    func testLevenshteinEmpty() {
        XCTAssertEqual(StringSimilarity.levenshteinDistance("", "abc"), 3)
        XCTAssertEqual(StringSimilarity.levenshteinDistance("abc", ""), 3)
    }

    func testLevenshteinSingleEdit() {
        XCTAssertEqual(StringSimilarity.levenshteinDistance("cat", "bat"), 1)
    }

    // MARK: - Jaro-Winkler

    func testJaroWinklerIdentical() {
        XCTAssertEqual(StringSimilarity.jaroWinkler("hello", "hello"), 1.0)
    }

    func testJaroWinklerCompletelyDifferent() {
        // "abc" and "xyz" share no characters within match window
        let score = StringSimilarity.jaroWinkler("abc", "xyz")
        XCTAssertLessThan(score, 0.5)
    }

    func testJaroWinklerPrefixBonus() {
        // Words sharing a long prefix should score higher than words that match
        // only in the middle.
        let withPrefix = StringSimilarity.jaroWinkler("star wars", "star trek")
        let noPrefix   = StringSimilarity.jaroWinkler("marvelous", "avengers")
        XCTAssertGreaterThan(withPrefix, noPrefix)
    }

    // MARK: - Token-sort ratio

    func testTokenSortHandlesWordReorder() {
        let score = StringSimilarity.tokenSortRatio("star wars", "wars star")
        XCTAssertGreaterThan(score, 0.9, "Reordered words should still score high")
    }

    // MARK: - Token-set ratio

    func testTokenSetHandlesExtraWords() {
        // "The Matrix Reloaded" vs "Matrix" should score reasonably high
        let score = StringSimilarity.tokenSetRatio("the matrix reloaded", "matrix")
        XCTAssertGreaterThan(score, 0.6)
    }

    // MARK: - Combined score

    func testCombinedExactMatch() {
        let score = StringSimilarity.combinedScore("The Matrix", "The Matrix")
        XCTAssertGreaterThan(score, 0.95)
    }

    func testCombinedArticleNormalization() {
        // "The Matrix" and "Matrix" should score very close after normalization
        let score = StringSimilarity.combinedScore("The Matrix", "Matrix")
        XCTAssertGreaterThan(score, 0.80)
    }

    func testCombinedUnrelatedStrings() {
        let score = StringSimilarity.combinedScore("The Matrix", "Shrek 2")
        XCTAssertLessThan(score, 0.4)
    }

    func testCombinedOCRTypo() {
        // Simulates OCR misreading "GLADIATOR" as "GLADI4T0R"
        let score = StringSimilarity.combinedScore("GLADIATOR", "GLADI4T0R")
        XCTAssertGreaterThan(score, 0.55, "Mild OCR errors should still yield a usable score")
    }

    // MARK: - Normalize

    func testNormalizeStripsArticle() {
        XCTAssertEqual(StringSimilarity.normalize("The Dark Knight"), "dark knight")
        XCTAssertEqual(StringSimilarity.normalize("A Beautiful Mind"), "beautiful mind")
        XCTAssertEqual(StringSimilarity.normalize("An Inconvenient Truth"), "inconvenient truth")
    }

    func testNormalizeCollapseWhitespace() {
        XCTAssertEqual(StringSimilarity.normalize("  Star   Wars  "), "star wars")
    }
}
