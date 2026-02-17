import Vision
import CoreImage
import Foundation

// MARK: - Scan mode

public enum DVDScanMode {
    /// Photo of DVD cases laid flat/stacked — detect rectangular regions, one per case.
    case cases
    /// Photo of a shelf showing DVD spines — scan full image for vertical title strips.
    case shelf
    /// Let the extractor decide based on image aspect ratio and content.
    case automatic
}

// MARK: - DVDTitleExtractor
//
// Uses Apple's Vision framework for:
//  1. VNDetectRectanglesRequest  – find individual DVD case outlines in a photo
//  2. VNRecognizeTextRequest     – high-accuracy OCR on each region
//
// No external dependencies; runs fully on-device.

public actor DVDTitleExtractor {

    public init() {}

    // MARK: - Public entry point

    /// Detect all DVDs in `cgImage` and return one `DVDRegion` per disc found.
    public func extract(from cgImage: CGImage, mode: DVDScanMode = .automatic) async throws -> [DVDRegion] {
        let effectiveMode = mode == .automatic ? inferMode(from: cgImage) : mode

        switch effectiveMode {
        case .shelf:
            // Treat whole image as one region; the OCR will find spine text.
            let texts = try await recognizeText(in: cgImage, roi: CGRect(x: 0, y: 0, width: 1, height: 1))
            let region = buildRegion(
                bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                observations: texts,
                index: 0
            )
            return [region]

        case .cases, .automatic:
            let rects = try await detectRectangles(in: cgImage)

            if rects.isEmpty {
                // Fallback: single region covering the whole image
                let texts = try await recognizeText(in: cgImage, roi: CGRect(x: 0, y: 0, width: 1, height: 1))
                return [buildRegion(bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                                    observations: texts, index: 0)]
            }

            // Process each detected rectangle concurrently
            var regions: [DVDRegion] = []
            for (index, rect) in rects.enumerated() {
                let texts = try await recognizeText(in: cgImage, roi: rect)
                regions.append(buildRegion(bounds: rect, observations: texts, index: index))
            }
            return regions
        }
    }

    // MARK: - Mode inference

    private func inferMode(from image: CGImage) -> DVDScanMode {
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        // Very wide images are likely shelf photos
        return (w / h > 2.5) ? .shelf : .cases
    }

    // MARK: - Rectangle detection

    private func detectRectangles(in image: CGImage) async throws -> [CGRect] {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNDetectRectanglesRequest { req, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let boxes = (req.results as? [VNRectangleObservation] ?? [])
                    .filter { $0.confidence > 0.65 }
                    .map(\.boundingBox)
                    .sorted { $0.minX < $1.minX } // left to right
                continuation.resume(returning: boxes)
            }
            request.minimumAspectRatio = 0.25   // allow portrait DVD cases
            request.maximumAspectRatio = 1.0
            request.minimumSize = 0.08           // ignore tiny rectangles
            request.minimumConfidence = 0.65
            request.maximumObservations = 30     // up to 30 DVDs per photo

            let handler = VNImageRequestHandler(cgImage: image, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    // MARK: - Text recognition

    private func recognizeText(in image: CGImage, roi: CGRect) async throws -> [TextObservation] {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { req, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let observations: [TextObservation] = (req.results as? [VNRecognizedTextObservation] ?? [])
                    .compactMap { obs in
                        guard let top = obs.topCandidates(1).first else { return nil }
                        return TextObservation(
                            text: top.string,
                            confidence: top.confidence,
                            bounds: obs.boundingBox,
                            relativeHeight: obs.boundingBox.height
                        )
                    }
                continuation.resume(returning: observations)
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US", "en-GB"]
            // Confine OCR to the detected rectangle region
            request.regionOfInterest = roi

            let handler = VNImageRequestHandler(cgImage: image, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    // MARK: - Title candidate extraction

    private func buildRegion(
        bounds: CGRect,
        observations: [TextObservation],
        index: Int
    ) -> DVDRegion {
        let candidates = extractCandidateTitles(from: observations)
        return DVDRegion(
            bounds: bounds,
            textObservations: observations,
            candidateTitles: candidates,
            cropIndex: index
        )
    }

    /// Rank observations and pull out the most likely movie title strings.
    ///
    /// Heuristics applied (highest-weight first):
    ///  - Relative font size (larger text = more likely to be the main title)
    ///  - Position: upper 60% of cover for front-face photos; all positions for spines
    ///  - Confidence score from Vision
    ///  - Negative filters: ratings badges, studio boilerplate, format labels
    private func extractCandidateTitles(from observations: [TextObservation]) -> [String] {
        guard !observations.isEmpty else { return [] }

        let usable = observations.filter { obs in
            let t = obs.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.count >= 2
                && obs.confidence > 0.45
                && !isBoilerplate(t)
        }

        // Score each observation
        let scored = usable.map { obs -> (obs: TextObservation, score: Double) in
            var score = Double(obs.relativeHeight) * 10.0   // font size weight
            score += Double(obs.confidence) * 3.0
            // Bonus for text in the upper portion of the region (Vision y is 0=bottom)
            if obs.bounds.midY > 0.5 { score += 2.0 }
            return (obs, score)
        }.sorted { $0.score > $1.score }

        // Take top 8 candidates
        var candidates: [String] = scored.prefix(8).map { $0.obs.text }

        // Also try merging the top 2 observations if they're vertically adjacent
        // (handles two-line titles like "STAR / WARS")
        if scored.count >= 2 {
            let top2 = scored.prefix(2).map(\.obs)
            let merged = attemptMerge(top2)
            if let merged, !candidates.contains(merged) {
                candidates.insert(merged, at: 0)
            }
        }

        return Array(candidates.prefix(5))
    }

    // MARK: - Boilerplate filter

    private static let boilerplatePatterns: [String] = [
        "blu-ray", "blu ray", "4k ultra hd", "4k uhd", "ultra hd", "uhd",
        "dolby", "dts", "atmos", "truehd",
        "widescreen", "fullscreen", "anamorphic",
        "director's cut", "extended edition", "special edition",
        "collector's edition", "theatrical cut", "unrated",
        "bonus features", "special features", "behind the scenes",
        "rated pg", "rated r", "rated g", "pg-13", "nc-17", "tv-ma", "tv-14", "tv-pg",
        "not rated", "nr", "unrated",
        "www.", ".com", ".net", "©", "copyright", "all rights reserved",
        "columbia", "universal", "paramount", "warner", "disney", "dreamworks",
        "twentieth century", "20th century", "lionsgate", "mgm", "sony",
        "aspect ratio", "subtitles", "closed caption",
    ]

    private func isBoilerplate(_ text: String) -> Bool {
        let lower = text.lowercased()
        // Pure numbers or single characters
        if text.allSatisfy({ $0.isNumber || $0 == "." }) { return true }
        // Very short
        if text.count <= 1 { return true }
        // Matches a boilerplate pattern
        return Self.boilerplatePatterns.contains(where: { lower.contains($0) })
    }

    // MARK: - Multi-line title merge

    /// If two observations are vertically close and combined look like a single title, merge them.
    private func attemptMerge(_ observations: [TextObservation]) -> String? {
        guard observations.count >= 2 else { return nil }
        // Vision y increases upward; check vertical gap
        let sorted = observations.sorted { $0.bounds.midY > $1.bounds.midY }
        let gap = sorted[0].bounds.minY - sorted[1].bounds.maxY
        guard gap < 0.06 else { return nil } // must be within 6% of image height
        return sorted.map(\.text).joined(separator: " ")
    }
}
