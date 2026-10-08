#!/usr/bin/env bash
# بناء ملف APK لتطبيق «مساعدي»
# المتطلبات: JDK 17 + Android SDK (build-tools 34 + platform 34)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk}"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"

for f in "$JAVA_HOME/bin/javac" "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$PLATFORM"; do
  [ -e "$f" ] || { echo "❌ غير موجود: $f"; exit 1; }
  done
export PATH="$JAVA_HOME/bin:$PATH"

BUILD="$HERE/build"
OUT="$HERE/out"
rm -rf "$BUILD"; mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/gen" "$OUT"

# 1) نسخ واجهة الويب إلى أصول التطبيق
echo "▸ نسخ ملفات الواجهة…"
rm -rf "$HERE/assets/www"
mkdir -p "$HERE/assets/www"
for item in index.html manifest.webmanifest sw.js css js icons; do
  cp -r "$ROOT/$item" "$HERE/assets/www/"
done

# 2) تجميع الموارد
# ملاحظة: aapt2 يرفض المجلدات الفارغة
for d in "$HERE"/res/mipmap-*; do :; done
echo "▸ تجميع الموارد (aapt2)…"
"$BT/aapt2" compile --dir "$HERE/res" -o "$BUILD/res.zip"

# 3) الربط وتوليد APK أساسي
# ملاحظة: aapt2 يرفض المجلدات الفارغة
MANIFEST_BAK="$BUILD/AndroidManifest.xml"
cp "$HERE/AndroidManifest.xml" "$MANIFEST_BAK"
echo "▸ ربط الموارد (aapt2 link)…"
"$BT/aapt2" link \
  -o "$BUILD/base.apk" \
  -I "$PLATFORM" \
  --manifest "$MANIFEST_BAK" \
  -A "$HERE/assets" \
  --java "$BUILD/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --no-version-vectors \
  "$BUILD/res.zip"

# 4) ترجمة جافا
# ملاحظة: aapt2 يرفض المجلدات الفارغة
echo "▸ ترجمة كود جافا (javac)…"
find "$HERE/java" -name '*.java' > "$BUILD/sources.txt"
"$JAVA_HOME/bin/javac" -nowarn -encoding UTF-8 --release 8 -cp "$PLATFORM" -d "$BUILD/classes" @"$BUILD/sources.txt"
# 5) تحويل إلى dex
# ملاحظة: aapt2 يرفض المجلدات الفارغة
echo "▸ توليد classes.dex (d8)…"
find "$BUILD/classes" -name '*.class' > "$BUILD/classes.txt"
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$BUILD/dex" @"$BUILD/classes.txt"

# 6) إضافة الـ dex إلى الـ APK
# ملاحظة: aapt2 يرفض المجلدات الفارغة
echo "▸ دمج الكود في الحزمة…"
(cd "$BUILD/dex" && zip -q -X "$BUILD/base.apk" classes.dex)

# 7) محاذاة
echo "▸ محاذاة الحزمة (zipalign)…"
"$BT/zipalign" -f -p 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

# 8) مفتاح التوقيع
KS="$HERE/keystore.jks"
if [ ! -f "$KS" ]; then
  echo "▸ إنشاء مفتاح التوقيع…"
  "$JAVA_HOME/bin/keytool" -genkeypair -v -keystore "$KS" -alias mosaaidi \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass mosaaidi -keypass mosaaidi \
    -dname "CN=Mosaaidi, OU=Mobile, O=Mosaaidi, L=Cairo, C=EG" >/dev/null 2>&1
fi

# 9) التوقيع
APK="$OUT/mosaaidi-v1.2.apk"
echo "▸ توقيع الحزمة (apksigner)…"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:mosaaidi --key-pass pass:mosaaidi \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$APK" "$BUILD/aligned.apk"

# 10) التحقق
echo "▸ التحقق من التوقيع…"
"$BT/apksigner" verify --print-certs "$APK" | head -4

echo ""
echo "✅ تم إنشاء الملف: $APK"
ls -lh "$APK" | awk '{print "   الحجم: " $5}'
