#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CACHE=${SPARKBENCH_CACHE:-"$HOME/.cache/sparkbench"}
OUT=${1:-"$CACHE/esp32/sparkbench-esp32-helper"}
mkdir -p "$(dirname -- "$OUT")"
cc -std=c11 -O2 -Wall -Wextra -Werror -fPIE -pie \
  "$ROOT/helper/main.c" -ldl -lpthread -o "$OUT"
printf '%s\n' "$OUT"
