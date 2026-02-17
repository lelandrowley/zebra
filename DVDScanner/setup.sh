#!/bin/sh
# DVDScanner — one-command Xcode project setup
# Run this once from the DVDScanner/ folder:
#   cd path/to/zebra/DVDScanner
#   ./setup.sh

set -e

echo "==> Checking for Homebrew..."
if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Homebrew not found."
  echo "Install it first: https://brew.sh"
  exit 1
fi

echo "==> Installing XcodeGen..."
brew install xcodegen

echo "==> Generating DVDScanner.xcodeproj..."
xcodegen generate

echo ""
echo "Done! Open the project in Xcode:"
echo "  open DVDScanner.xcodeproj"
echo ""
echo "Next steps inside Xcode:"
echo "  1. Select the DVDScanner-iOS scheme (top toolbar)"
echo "  2. Choose your iPhone from the device dropdown"
echo "  3. Press Cmd+R to build and run"
echo "  4. Open Settings in the app and enter your OMDB + TMDB API keys"
