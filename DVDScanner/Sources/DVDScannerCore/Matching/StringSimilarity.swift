import Foundation

// MARK: - String Similarity
//
// Multiple algorithms are applied and their results are blended into a
// single score in the range [0, 1].  This mirrors the multi-method
// approach used by Python's `thefuzz` library (formerly fuzzywuzzy) but
// is implemented entirely in Swift — no external dependencies.
//
// Algorithms used:
//  1. Normalised Levenshtein ratio  (character-level edit distance)
//  2. Jaro-Winkler similarity       (great for short strings / typos)
//  3. Token-sort ratio              (order-independent word comparison)
//  4. Token-set ratio               (handles extra words / partial matches)
//
// The public `combinedScore` uses all four with tuned weights.

public enum StringSimilarity {

    // MARK: - Public API

    /// Combined score [0, 1] blending all four algorithms.
    public static func combinedScore(_ a: String, _ b: String) -> Double {
        let na = normalize(a)
        let nb = normalize(b)
        guard !na.isEmpty, !nb.isEmpty else { return na == nb ? 1 : 0 }

        let lev   = levenshteinRatio(na, nb)
        let jw    = jaroWinkler(na, nb)
        let tsort = tokenSortRatio(na, nb)
        let tset  = tokenSetRatio(na, nb)

        // Weights: token-based methods get more weight because DVD titles
        // may include extra words (e.g., subtitles, "The" article) that
        // shouldn't tank the score.
        return lev * 0.2 + jw * 0.2 + tsort * 0.3 + tset * 0.3
    }

    // MARK: - Normalised Levenshtein ratio

    /// Returns 1 − (editDistance / maxLength).
    public static func levenshteinRatio(_ a: String, _ b: String) -> Double {
        let d = levenshteinDistance(a, b)
        let maxLen = max(a.count, b.count)
        guard maxLen > 0 else { return 1 }
        return 1 - Double(d) / Double(maxLen)
    }

    /// Standard dynamic-programming Levenshtein distance.
    public static func levenshteinDistance(_ a: String, _ b: String) -> Int {
        let ac = Array(a), bc = Array(b)
        let m = ac.count, n = bc.count
        if m == 0 { return n }
        if n == 0 { return m }

        var prev = Array(0...n)
        var curr = Array(repeating: 0, count: n + 1)

        for i in 1...m {
            curr[0] = i
            for j in 1...n {
                if ac[i - 1] == bc[j - 1] {
                    curr[j] = prev[j - 1]
                } else {
                    curr[j] = 1 + min(prev[j], curr[j - 1], prev[j - 1])
                }
            }
            prev = curr
        }
        return prev[n]
    }

    // MARK: - Jaro-Winkler

    /// Jaro-Winkler similarity [0, 1].  Prefix bonus p = 0.1 (standard).
    public static func jaroWinkler(_ a: String, _ b: String) -> Double {
        let jaro = jaroSimilarity(a, b)
        guard jaro > 0 else { return 0 }

        let ac = Array(a), bc = Array(b)
        var prefixLen = 0
        for i in 0..<min(4, min(ac.count, bc.count)) {
            if ac[i] == bc[i] { prefixLen += 1 } else { break }
        }
        return jaro + Double(prefixLen) * 0.1 * (1 - jaro)
    }

    private static func jaroSimilarity(_ a: String, _ b: String) -> Double {
        let ac = Array(a), bc = Array(b)
        let m = ac.count, n = bc.count
        guard m > 0, n > 0 else { return m == n ? 1 : 0 }

        let matchDist = max(max(m, n) / 2 - 1, 0)
        var aMatch = Array(repeating: false, count: m)
        var bMatch = Array(repeating: false, count: n)
        var matches = 0

        for i in 0..<m {
            let lo = max(0, i - matchDist)
            let hi = min(i + matchDist, n - 1)
            guard lo <= hi else { continue }
            for j in lo...hi {
                if !bMatch[j] && ac[i] == bc[j] {
                    aMatch[i] = true
                    bMatch[j] = true
                    matches += 1
                    break
                }
            }
        }
        guard matches > 0 else { return 0 }

        var transpositions = 0
        var k = 0
        for i in 0..<m {
            guard aMatch[i] else { continue }
            while !bMatch[k] { k += 1 }
            if ac[i] != bc[k] { transpositions += 1 }
            k += 1
        }

        let mD = Double(matches)
        return (mD / Double(m) + mD / Double(n) + (mD - Double(transpositions) / 2) / mD) / 3
    }

    // MARK: - Token-sort ratio

    /// Sort the words in each string alphabetically then compare with Levenshtein.
    /// Handles "Star Wars" vs "Wars Star"-style reorderings.
    public static func tokenSortRatio(_ a: String, _ b: String) -> Double {
        let sortedA = a.split(separator: " ").sorted().joined(separator: " ")
        let sortedB = b.split(separator: " ").sorted().joined(separator: " ")
        return levenshteinRatio(sortedA, sortedB)
    }

    // MARK: - Token-set ratio

    /// Splits into token sets; compares intersection vs sorted remainder.
    /// Robust against extra words — "The Matrix Reloaded" vs "Matrix".
    public static func tokenSetRatio(_ a: String, _ b: String) -> Double {
        let tokensA = Set(a.split(separator: " ").map(String.init))
        let tokensB = Set(b.split(separator: " ").map(String.init))

        let inter  = tokensA.intersection(tokensB).sorted().joined(separator: " ")
        let onlyA  = tokensA.subtracting(tokensB).sorted().joined(separator: " ")
        let onlyB  = tokensB.subtracting(tokensA).sorted().joined(separator: " ")

        let ab = [inter, onlyA].filter { !$0.isEmpty }.joined(separator: " ")
        let ba = [inter, onlyB].filter { !$0.isEmpty }.joined(separator: " ")

        let r1 = levenshteinRatio(inter, ab)
        let r2 = levenshteinRatio(inter, ba)
        let r3 = levenshteinRatio(ab, ba)
        return max(r1, r2, r3)
    }

    // MARK: - Helpers

    /// Lowercase, remove articles ("the", "a", "an") from the front for fairer
    /// matching, strip punctuation, collapse whitespace.
    public static func normalize(_ s: String) -> String {
        var result = s.lowercased()
        // Remove leading articles
        for article in ["the ", "a ", "an "] {
            if result.hasPrefix(article) {
                result = String(result.dropFirst(article.count))
                break
            }
        }
        // Remove punctuation except spaces
        result = result.filter { $0.isLetter || $0.isNumber || $0.isWhitespace }
        // Collapse whitespace
        result = result
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return result
    }
}
