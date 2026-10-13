#!/usr/bin/env bash
# بناء ملف APK بدون Gradle: aapt2 + javac + d8 + zipalign + apksigner
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="$ROOT/.tools/android-sdk"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
JAVA_HOME="$ROOT/.tools/jdk-17.0.20.1+1"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

WORK="$ROOT/build"
OUT="$ROOT/dist"
KEYSTORE="$ROOT/.tools/debug.keystore"

rm -rf "$WORK"
mkdir -p "$WORK/compiled" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/assets" "$OUT"

echo "==> تجهيز أصول الويب"
cp "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$WORK/assets/"
cp -r "$ROOT/assets" "$ROOT/icons" "$WORK/assets/"

echo "==> تجميع الموارد (aapt2 compile)"
find "$ROOT/android/res" -type f -print0 | while IFS= read -r -d '' f; do
  "$BT/aapt2" compile "$f" -o "$WORK/compiled"
done

echo "==> ربط الموارد + بناء الهيكل (aapt2 link)"
"$BT/aapt2" link \
  -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  -R "$WORK"/compiled/*.flat \
  --java "$WORK/gen" \
  --min-sdk-version 21 \
  --target-sdk-version 34 \
  -A "$WORK/assets" \
  --auto-add-overlay

echo "==> تصريف الجافا (javac)"
javac -nowarn -source 8 -target 8 -bootclasspath "$PLATFORM" -encoding UTF-8 \
  -d "$WORK/classes" \
  $(find "$WORK/gen" -name '*.java') \
  $(find "$ROOT/android/src" -name '*.java') 2>&1 | grep -v -e 'bootstrap class path' -e 'source value 8' -e 'target value 8' -e 'deprecat' || true

echo "==> توليد classes.dex (d8)"
"$BT/d8" --lib "$PLATFORM" --min-api 21 --output "$WORK/dex" \
  $(find "$WORK/classes" -name '*.class')

echo "==> إضافة dex إلى الحزمة"
python3 - "$WORK/base.apk" "$WORK/dex/classes.dex" <<'PY'
import sys, zipfile, shutil, os
apk, dex = sys.argv[1], sys.argv[2]
tmp = apk + '.tmp'
with zipfile.ZipFile(apk, 'r') as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for it in zin.infolist():
        if it.filename == 'classes.dex':
            continue
        zout.writestr(it, zin.read(it.filename))
    zout.write(dex, 'classes.dex')
shutil.move(tmp, apk)
print('   classes.dex مضاف')
PY

echo "==> محاذاة (zipalign)"
"$BT/zipalign" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"

echo "==> مفتاح التوقيع"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -alias androiddebugkey \
    -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

echo "==> التوقيع (apksigner)"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/ai-agents-space.apk" "$WORK/aligned.apk"

"$BT/apksigner" verify --print-certs "$OUT/ai-agents-space.apk" | head -3

echo ""
echo "✅ تم البناء: $OUT/ai-agents-space.apk"
ls -lh "$OUT/ai-agents-space.apk"
