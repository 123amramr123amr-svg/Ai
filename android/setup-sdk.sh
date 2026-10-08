#!/usr/bin/env bash
# تنزيل وتجهيز بيئة بناء أندرويد (JDK 17 + Android SDK) بدون صلاحيات root
# الاستخدام: bash android/setup-sdk.sh
set -euo pipefail

TOOLS="$HOME/tools"
SDK="$HOME/android-sdk"
mkdir -p "$TOOLS"

if [ ! -x "$TOOLS/jdk/bin/javac" ]; then
  echo "▸ تنزيل JDK 17…"
  curl -sL -o "$TOOLS/jdk.tar.gz" "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar xzf "$TOOLS/jdk.tar.gz" -C "$TOOLS"
  rm -rf "$TOOLS/jdk"; mv "$TOOLS"/jdk-17* "$TOOLS/jdk"
  rm -f "$TOOLS/jdk.tar.gz"
fi

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "▸ تنزيل أدوات Android…"
  mkdir -p "$SDK/cmdline-tools"
  curl -sL -o "$TOOLS/cmdline-tools.zip" "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q -o "$TOOLS/cmdline-tools.zip" -d "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest"; mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -f "$TOOLS/cmdline-tools.zip"
fi

export JAVA_HOME="$TOOLS/jdk"
export PATH="$JAVA_HOME/bin:$PATH"

if [ ! -d "$SDK/build-tools/34.0.0" ] || [ ! -f "$SDK/platforms/android-34/android.jar" ]; then
  echo "▸ تنزيل مكوّنات SDK (build-tools 34 + platform 34)…"
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
  "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platform-tools" "build-tools;34.0.0" "platforms;android-34" >/dev/null
fi

echo "✅ البيئة جاهزة"
echo "   JAVA_HOME=$TOOLS/jdk"
echo "   ANDROID_HOME=$SDK"
