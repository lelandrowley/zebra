# DVDScanner

iPhone / Mac app that photographs your DVD collection, identifies every title, and generates Plex-ready folder names.

## How it works

```
Photo → OCR (Vision) → Title candidates → OMDB + TMDB lookup
      → Fuzzy matching → User confirmation → Plex folder names
```

### Pipeline detail

| Step | Technology | Notes |
|------|-----------|-------|
| Rectangle detection | `VNDetectRectanglesRequest` | Finds individual DVD cases in a multi-disc photo |
| Text recognition | `VNRecognizeTextRequest` (`.accurate`) | On-device, no network required |
| Title filtering | Heuristics (font size, position, boilerplate list) | Removes ratings, studio names, format labels |
| Primary lookup | [OMDB API](https://www.omdbapi.com/) | Returns IMDb IDs directly |
| Secondary lookup | [TMDB API](https://www.themoviedb.org/) | Broader catalogue, resolves IMDb IDs via `/external_ids` |
| Similarity scoring | Levenshtein + Jaro-Winkler + token-sort + token-set | Blended score 0–1 |
| Auto-confirm | Score ≥ 0.85 (configurable) | Skips user confirmation for high-confidence matches |
| Plex naming | `Movie Title (Year) {imdb-ttXXXXXXX}` | Official Plex format |

### Plex folder format

```
Movies/
  The Matrix (1999) {imdb-tt0133093}/
    The Matrix (1999) {imdb-tt0133093}.mkv   ← place your rip here
  Inception (2010) {imdb-tt1375666}/
    Inception (2010) {imdb-tt1375666}.mkv
```

The IMDb tag is optional (toggle in Settings) but strongly recommended — Plex uses it for instant, unambiguous matching.

---

## Project structure

```
DVDScanner/
├── Package.swift                          Swift package (core library + tests)
├── Sources/
│   ├── DVDScannerCore/                    Platform-agnostic library
│   │   ├── Models/MovieInfo.swift         Data models
│   │   ├── OCR/DVDTitleExtractor.swift    Vision-based OCR + rectangle detection
│   │   ├── Matching/
│   │   │   ├── StringSimilarity.swift     Levenshtein, Jaro-Winkler, token ratios
│   │   │   └── MovieMatcher.swift         Full pipeline orchestration
│   │   ├── API/
│   │   │   ├── OMDBService.swift          OMDB API client
│   │   │   └── TMDBService.swift          TMDB API client
│   │   └── Plex/PlexFolderGenerator.swift Plex naming + shell script export
│   └── DVDScannerApp/                     SwiftUI app (add to Xcode project)
│       ├── DVDScannerApp.swift
│       ├── DVDScannerViewModel.swift
│       └── Views/
│           ├── ContentView.swift
│           ├── MovieConfirmationView.swift
│           ├── ExportView.swift
│           └── SettingsView.swift
└── Tests/DVDScannerCoreTests/             Unit tests (no API keys required)
```

---

## Xcode setup

1. **Create a new Xcode project**
   - File → New → Project → iOS App (or Multiplatform App)
   - Product name: `DVDScanner`, Interface: SwiftUI, Language: Swift

2. **Add the Swift Package**
   - File → Add Package Dependencies…
   - Add local package: point to this `DVDScanner/` directory
   - Link `DVDScannerCore` to your app target

3. **Add app source files**
   - Drag everything from `Sources/DVDScannerApp/` into your Xcode target
   - Make sure "Add to target" is checked

4. **Info.plist permissions** (iOS only)
   Add these keys:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Used to photograph your DVDs</string>
   <key>NSPhotoLibraryUsageDescription</key>
   <string>Used to import photos of your DVDs</string>
   ```

5. **API keys** — enter in-app Settings screen (stored in UserDefaults):
   - [OMDB free key](https://www.omdbapi.com/apikey.aspx) — 1 000 requests/day
   - [TMDB free key](https://www.themoviedb.org/settings/api) — unlimited (rate-limited)

6. **Build & run** on device or simulator (iOS 16+ / macOS 13+)

---

## Photography tips for best OCR results

| Scenario | Recommendation |
|----------|---------------|
| Multiple cases | Lay DVDs flat, avoid overlap, use even lighting |
| Shelf scan | Hold phone level; ensure spines are readable |
| Lighting | Natural light or diffused lamp — avoid flash glare on plastic |
| Focus | Tap the DVD titles to ensure camera focuses on text |
| Angle | Shoot straight-on; tilt causes keystone distortion |

---

## Running tests

```sh
cd DVDScanner
swift test
```

Tests cover string similarity algorithms and Plex folder generation — no network calls required.
