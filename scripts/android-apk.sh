#!/usr/bin/env bash
# Build C2 Android APK without Android Studio.
# Capacitor 7 needs JDK 21 (Flutter's JDK 17 is not enough).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

resolve_jdk21() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    local ver
    ver="$("${JAVA_HOME}/bin/java" -version 2>&1 | head -1 || true)"
    if [[ "$ver" == *'"21.'* || "$ver" == *' version "21'* ]]; then
      echo "$JAVA_HOME"
      return
    fi
  fi
  local candidate
  for candidate in \
    "$ROOT"/.jdk/jdk-21*/Contents/Home \
    "$ROOT"/.jdk/jdk-21*
  do
    if [[ -x "$candidate/bin/java" ]]; then
      echo "$candidate"
      return
    fi
  done
  if [[ -x /usr/libexec/java_home ]]; then
    local home
    home="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
    if [[ -n "$home" && -x "$home/bin/java" ]]; then
      echo "$home"
      return
    fi
  fi
  return 1
}

if ! JDK21="$(resolve_jdk21)"; then
  echo "JDK 21 fehlt. Einmalig herunterladen:"
  echo "  mkdir -p .jdk && curl -L \"https://api.adoptium.net/v3/binary/latest/21/ga/mac/$(uname -m | sed 's/arm64/aarch64/;s/x86_64/x64/')/jdk/hotspot/normal/eclipse?project=jdk\" | tar -xz -C .jdk"
  echo "Oder: brew install --cask temurin@21"
  exit 1
fi

export JAVA_HOME="$JDK21"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using JAVA_HOME=$JAVA_HOME"
java -version

npm run build:android
cd android
./gradlew assembleDebug "$@"
APK="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "APK: $ROOT/android/$APK"
if command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -q $'\tdevice$'; then
  echo "Installieren mit: adb install -r android/$APK"
fi
