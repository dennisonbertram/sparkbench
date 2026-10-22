#!/bin/bash
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CACHE=${SPARKBENCH_CACHE:-"$HOME/.cache/sparkbench"}
IDF_PATH=${IDF_PATH:-"$CACHE/esp-idf-v5.4.2"}
IDF_TOOLS_PATH=${IDF_TOOLS_PATH:-"$CACHE/esp-idf-tools"}
BUILD_DIR=${SPARKBENCH_ESP32_BUILD_DIR:-"$CACHE/esp32/firmware-build"}
OUT=${SPARKBENCH_ESP32_FIRMWARE:-"$CACHE/esp32/firmware/esp32-gpio-blink-4mb.bin"}
PIN=f5c3654a1c2d2a01f7f67def7a0dc48e691f63c0

test -f "$IDF_PATH/export.sh" || { echo "ESP-IDF v5.4.2 is missing: $IDF_PATH" >&2; exit 2; }
test "$(git -C "$IDF_PATH" rev-parse HEAD)" = "$PIN" || { echo "unexpected ESP-IDF source revision" >&2; exit 2; }
mkdir -p "$BUILD_DIR" "$(dirname -- "$OUT")"
export IDF_TOOLS_PATH IDF_PATH
export PATH="$CACHE/build-tools/bin:$PATH"
source "$IDF_PATH/export.sh" >/dev/null
idf.py -C "$ROOT/firmware" -B "$BUILD_DIR" -D SDKCONFIG="$BUILD_DIR/sdkconfig" set-target esp32
idf.py -C "$ROOT/firmware" -B "$BUILD_DIR" build
idf.py -C "$ROOT/firmware" -B "$BUILD_DIR" merge-bin -o "$OUT"
test "$(wc -c < "$OUT")" -le $((4 * 1024 * 1024)) || { echo "merged image exceeds 4 MiB" >&2; exit 1; }
truncate -s $((4 * 1024 * 1024)) "$OUT"
printf '%s\n' "$OUT"
