# The native ESP32 runtime (docs/esp32-runtime.md) packaged as a Linux image, so it runs the same
# on a Mac (Docker Desktop), a Linux laptop or a cloud worker. The server starts one container per
# session, talks to the helper over stdin/stdout, and gives it no network.
#
#   docker build -f docker/esp32-runtime.Dockerfile -t sparkbench-esp32 .
ARG UBUNTU_IMAGE=ubuntu:24.04

# ---- QEMU (lcgamboa esp32-picsimlab fork) as a shared library, plus the GPL helper
FROM ${UBUNTU_IMAGE} AS qemu
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git ca-certificates python3 python3-venv \
      libglib2.0-dev libpixman-1-dev libgcrypt20-dev libslirp-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
ENV SPARKBENCH_CACHE=/cache
RUN python3 -m venv /cache/build-tools && /cache/build-tools/bin/pip install --no-cache-dir meson ninja cmake tomli
RUN git clone https://github.com/lcgamboa/qemu.git /cache/qemu \
    && git -C /cache/qemu checkout 9c2989840853e3b47cd1d9cbd38ce8ba41af260a
COPY native/esp32 /src/native/esp32
RUN /src/native/esp32/build-qemu.sh && /src/native/esp32/build-helper.sh /cache/esp32/sparkbench-esp32-helper

# ---- The demo firmware, built from source with the pinned ESP-IDF
FROM ${UBUNTU_IMAGE} AS firmware
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends git wget flex bison gperf python3 python3-pip python3-venv \
      cmake ninja-build ccache libffi-dev libssl-dev dfu-util libusb-1.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV SPARKBENCH_CACHE=/cache IDF_TOOLS_PATH=/cache/esp-idf-tools
RUN git clone --depth 1 --branch v5.4.2 --recursive --shallow-submodules https://github.com/espressif/esp-idf.git /cache/esp-idf-v5.4.2 \
    && /cache/esp-idf-v5.4.2/install.sh esp32
RUN mkdir -p /cache/build-tools/bin
COPY native/esp32 /src/native/esp32
RUN /src/native/esp32/build-firmware.sh

# ---- Runtime: only what a session needs
FROM ${UBUNTU_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0t64 libpixman-1-0 libgcrypt20 libslirp0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=qemu /cache/qemu/build/libqemu-xtensa.so /opt/sparkbench/qemu/libqemu-xtensa.so
# Espressif mask-ROM images from the pinned QEMU checkout (not relicensed; see docs/esp32-runtime.md).
COPY --from=qemu /cache/qemu/pc-bios/esp32-v3-rom.bin /cache/qemu/pc-bios/esp32-v3-rom-app.bin /opt/sparkbench/qemu/pc-bios/
COPY --from=qemu /cache/esp32/sparkbench-esp32-helper /opt/sparkbench/sparkbench-esp32-helper
COPY --from=firmware /cache/esp32/firmware/esp32-gpio-blink-4mb.bin /opt/sparkbench/firmware/esp32-gpio-blink-4mb.bin
COPY native/esp32/helper/COPYING native/esp32/helper/LICENSE /opt/sparkbench/
RUN useradd -r -u 10001 sim && mkdir /session && chown sim /session
USER sim
WORKDIR /session
ENTRYPOINT ["/opt/sparkbench/sparkbench-esp32-helper"]
