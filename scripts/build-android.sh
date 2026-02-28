#!/usr/bin/env bash
# Build the web app and sync to Android. Use --apk to also build the debug APK.
# Usage: ./scripts/build-android.sh <SERVER_URL> [--apk]
# Run from project root (mini-telegram/), not from client/:
#   cd mini-telegram && ./scripts/build-android.sh https://your-server.com --apk
# Example: ./scripts/build-android.sh https://mini-telegram-xxxx.onrender.com --apk
# Or: VITE_API_URL=https://your-server.com ./scripts/build-android.sh --apk

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_APK=false
SERVER_URL=""
for arg in "$@"; do
  if [ "$arg" = "--apk" ]; then
    BUILD_APK=true
  else
    SERVER_URL="$arg"
  fi
done

if [ -z "$SERVER_URL" ]; then
  SERVER_URL="$VITE_API_URL"
fi
if [ -z "$SERVER_URL" ]; then
  echo "Usage: $0 <SERVER_URL> [--apk]"
  echo "Example: $0 https://mini-telegram-xxxx.onrender.com --apk"
  echo "Or: VITE_API_URL=https://your-server.com $0 --apk"
  exit 1
fi

echo "Building web app with API URL: $SERVER_URL"
cd client
export VITE_API_URL="$SERVER_URL"
npm run build
npx cap sync android

if [ "$BUILD_APK" = true ]; then
  echo ""
  echo "Building debug APK..."
  cd android
  ./gradlew assembleDebug
  cd ..
  APK_PATH="$(pwd)/android/app/build/outputs/apk/debug/app-debug.apk"
  echo ""
  echo "APK built successfully:"
  echo "  $APK_PATH"
  echo "Copy to your phone and install (allow unknown sources if prompted)."
else
  echo ""
  echo "Done. Next steps:"
  echo "  Build APK from here: $0 $SERVER_URL --apk"
  echo "  Or open Android Studio: cd client && npx cap open android"
  echo "  Then: Build → Build Bundle(s) / APK(s) → Build APK(s)"
fi
cd ..
