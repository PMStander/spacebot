#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Spacebot"
APP_BUNDLE="/Applications/$APP_NAME.app"

echo "Building $APP_NAME..."
echo ""

# Build frontend (Tauri embeds the dev/dist URL, but we need it built for production mode)
echo "Building frontend..."
cd "$SCRIPT_DIR/interface"
npm install --silent
npm run build
cd "$SCRIPT_DIR"

echo ""

# Use dev-fast profile by default; pass --release for production builds
if [ "$1" = "--release" ]; then
  CARGO_PROFILE="release"
  TARGET_DIR="release"
  echo "Cleaning old artifacts before release build..."
  cargo clean --manifest-path "$SCRIPT_DIR/src-tauri/Cargo.toml" --release
  echo "Building Tauri app (release — with LTO, will be slow)..."
else
  CARGO_PROFILE="dev-fast"
  TARGET_DIR="dev-fast"
  echo "Building Tauri app (dev-fast — no LTO)..."
fi

# Build the Tauri desktop binary (includes the webview window)
cargo build --manifest-path "$SCRIPT_DIR/src-tauri/Cargo.toml" --profile "$CARGO_PROFILE"

echo ""
echo "Assembling $APP_NAME.app..."

# Create bundle structure
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy the Tauri binary
cp "$SCRIPT_DIR/src-tauri/target/$TARGET_DIR/spacebot-desktop" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Generate AppIcon.icns from the source PNG using built-in macOS tools
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
ICON_SRC="$SCRIPT_DIR/src-tauri/icons/icon.png"
sips -z 16   16   "$ICON_SRC" --out "$ICONSET/icon_16x16.png"      >/dev/null 2>&1
sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_16x16@2x.png"   >/dev/null 2>&1
sips -z 32   32   "$ICON_SRC" --out "$ICONSET/icon_32x32.png"      >/dev/null 2>&1
sips -z 64   64   "$ICON_SRC" --out "$ICONSET/icon_32x32@2x.png"   >/dev/null 2>&1
sips -z 128  128  "$ICON_SRC" --out "$ICONSET/icon_128x128.png"    >/dev/null 2>&1
sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null 2>&1
sips -z 256  256  "$ICON_SRC" --out "$ICONSET/icon_256x256.png"    >/dev/null 2>&1
sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null 2>&1
sips -z 512  512  "$ICON_SRC" --out "$ICONSET/icon_512x512.png"    >/dev/null 2>&1
sips -z 1024 1024 "$ICON_SRC" --out "$ICONSET/icon_512x512@2x.png" >/dev/null 2>&1
iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

# Write Info.plist
APP_ID="sh.spacebot.desktop"
APP_VERSION="0.1.7"
cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>$APP_ID</string>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleVersion</key>
    <string>$APP_VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>$APP_VERSION</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
</dict>
</plist>
PLIST

echo ""
echo "Installed to $APP_BUNDLE"
echo "Launching..."
open "$APP_BUNDLE"
