#!/usr/bin/env bash
# تنزيل مكتبات النظام المطلوبة لـ Chrome واستخراجها محليًا (بدون صلاحيات جذر)
set -e
BASE=/workspace/.tools
APT_OPTS="-o Dir::State::lists=$BASE/apt/lists \
 -o Dir::Etc::sourcelist=$BASE/apt/sources.list \
 -o Dir::Etc::sourceparts=/dev/null \
 -o Dir::Cache=$BASE/apt/cache \
 -o APT::Get::List-Cleanup=0 \
 -o Acquire::Retries=3"

mkdir -p "$BASE/apt/lists/partial" "$BASE/apt/cache/archives/partial" "$BASE/apt/debs" "$BASE/chlibs"
cat > "$BASE/apt/sources.list" <<'EOF'
deb http://deb.debian.org/debian bookworm main
EOF

echo "==> تحديث الفهرس"
apt-get $APT_OPTS update 2>&1 | tail -2

PKGS="libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 \
libcups2 libxkbcommon0 libgbm1 libasound2 libcairo2 libpango-1.0-0 libx11-6 libxcb1 libxext6 \
libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxrender1 libxi6 libxtst6 libexpat1 \
libfontconfig1 libfreetype6 libpng16-16 libpixman-1-0 libwayland-client0 libwayland-server0 \
libxau6 libxdmcp6 libbsd0 libuuid1 libselinux1 libpcre2-8-0 libzstd1 liblzma5 libbz2-1.0 \
libffi8 libgraphite2-3 libthai0 libdatrie1 libfribidi0 libharfbuzz0b libgcrypt20 libsystemd0 \
libapparmor1 libavahi-client3 libavahi-common3 libgnutls30 libhogweed6 libnettle8 libp11-kit0 \
libidn2-0 libunistring2 libtasn1-6 libgmp10 libcap2 libmount1 libblkid1 libglib2.0-data \
shared-mime-info xdg-user-dirs libdrm2 libxshmfence1 libxdamage1 libxfixes3"

echo "==> حساب الاعتماديات"
ALL=$(apt-cache $APT_OPTS depends --recurse --no-recommends --no-suggests \
  --no-conflicts --no-breaks --no-replaces --no-enhances $PKGS 2>/dev/null \
  | grep -E '^[a-zA-Z]' | awk '{print $1}' | sort -u | tr '\n' ' ')
echo "عدد الحزم: $(echo $ALL | wc -w)"

echo "==> التنزيل"
cd "$BASE/apt/debs"
for p in $ALL; do
  apt-get $APT_OPTS download "$p" >/dev/null 2>&1 || true
done
ls *.deb 2>/dev/null | wc -l

echo "==> الاستخراج"
for f in *.deb; do
  dpkg -x "$f" "$BASE/chlibs" >/dev/null 2>&1 || true
done
echo "تم. مكتبات مستخرجة في $BASE/chlibs"
