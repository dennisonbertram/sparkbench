#!/bin/sh
set -eu
CACHE=${SPARKBENCH_CACHE:-"$HOME/.cache/sparkbench"}
export PATH="$CACHE/build-tools/bin:$PATH"
QEMU=${SPARKBENCH_QEMU_SOURCE:-"$CACHE/qemu"}
PIN=9c2989840853e3b47cd1d9cbd38ce8ba41af260a
test "$(git -C "$QEMU" rev-parse HEAD)" = "$PIN" || { echo "unexpected QEMU source revision" >&2; exit 2; }
cd "$QEMU"
./configure --target-list=xtensa-softmmu --extra-cflags=-fPIC --disable-pie --enable-slirp \
  --enable-tcg --enable-system --disable-werror --disable-alsa \
  --enable-debug --enable-debug-info --enable-gcrypt
make -j"${JOBS:-$(nproc)}"
cd build
ninja -t clean qemu-system-xtensa
ninja -v -d keeprsp qemu-system-xtensa
cp qemu-system-xtensa.rsp libqemu-xtensa.rsp
sed -i 's/-pie//g; s/-o qemu-system-xtensa/-shared -o libqemu-xtensa.so/g; s/qemu-system-xtensa.p\/system_main.c.o//g' libqemu-xtensa.rsp
cc -m64 @libqemu-xtensa.rsp
printf '%s\n' "$QEMU/build/libqemu-xtensa.so"
