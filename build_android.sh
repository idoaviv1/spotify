#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/frontend"

echo "📦 Building web assets..."
npm run build

echo "⚡ Syncing Capacitor Android..."
npx cap sync android

echo "🔨 Building APK with Gradle (Java 21)..."
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=/home/idodi/Android/Sdk ./gradlew assembleDebug

APK_SRC="$DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
DEST_DIR="/media/windows/Shared-APK/homeify"
mkdir -p "$DEST_DIR"

VERSION=$(node -p "require('../package.json').version || '1.0.0'")
STAMP=$(date -u +%Y%m%d-%H%M)
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nogit)
NAME="Homeify-${VERSION}-${STAMP}-${SHA}-debug.apk"

cp "$APK_SRC" "$DEST_DIR/$NAME"
cp "$APK_SRC" "$DEST_DIR/Homeify.apk"
cp "$APK_SRC" "$DEST_DIR/Homeify-Galaxy-S22-Ultra.apk"

echo "✅ Success! Android APK generated at:"
ls -lh "$DEST_DIR"/Homeify*
