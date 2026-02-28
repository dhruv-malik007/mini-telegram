#!/usr/bin/env bash
# Build the web app and sync to Android. Then open Android Studio to build the APK.
# Usage: ./scripts/build-android.sh [SERVER_URL]
# Example: ./scripts/build-android.sh https://mini-telegram-xxxx.onrender.com
# Or set VITE_API_URL before running: VITE_API_URL=https://your-server.com ./scripts/build-android.sh

set -e
cd "$(dirname "$0")/.."

SERVER_URL="${1:-$VITE_API_URL}"
if [ -z "$SERVER_URL" ]; then
  echo "Usage: $0 <SERVER_URL>"
  echo "Example: $0 https://mini-telegram-xxxx.onrender.com"
  echo "Or: VITE_API_URL=https://your-server.com $0"
  exit 1
fi

echo "Building web app with API URL: $SERVER_URL"
cd client
export VITE_API_URL="$SERVER_URL"
npm run build
npx cap sync android
cd ..

echo ""
echo "Done. Next steps:"
echo "  1. Open Android Studio: cd client && npx cap open android"
echo "  2. In Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)"
echo "  3. APK will be at: client/android/app/build/outputs/apk/debug/app-debug.apk"
echo "  4. Copy the APK to your phone and install it."
