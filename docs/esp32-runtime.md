# Native ESP32 firmware runtime

Sparkbench's optional ESP32 runtime executes a real classic ESP32 image in the
pinned lcgamboa QEMU `esp32-picsimlab` machine. The browser talks to the local
Vite API; the API starts one isolated GPL helper process per session. The
helper loads QEMU dynamically and forwards only QEMU GPIO direction/output and
UART TX callbacks. The electrical model feeds GPIO inputs back into QEMU.

## Pinned setup

The source pins are QEMU `9c2989840853e3b47cd1d9cbd38ce8ba41af260a` in
`~/.cache/sparkbench/qemu`, and ESP-IDF `v5.4.2` peeled commit
`f5c3654a1c2d2a01f7f67def7a0dc48e691f63c0` in
`~/.cache/sparkbench/esp-idf-v5.4.2`. IDF tools are in
`~/.cache/sparkbench/esp-idf-tools`; Meson/CMake/Ninja are in
`~/.cache/sparkbench/build-tools`.

One-time source setup and host dependencies:

```sh
mkdir -p ~/.cache/sparkbench
git clone https://github.com/lcgamboa/qemu.git ~/.cache/sparkbench/qemu
git -C ~/.cache/sparkbench/qemu checkout 9c2989840853e3b47cd1d9cbd38ce8ba41af260a
git clone --depth 1 --branch v5.4.2 --recursive https://github.com/espressif/esp-idf.git ~/.cache/sparkbench/esp-idf-v5.4.2
sudo apt-get install build-essential git python3-venv libglib2.0-dev libpixman-1-dev libgcrypt20-dev libslirp-dev pkg-config
python3 -m venv ~/.cache/sparkbench/build-tools
~/.cache/sparkbench/build-tools/bin/pip install meson ninja cmake tomli
IDF_TOOLS_PATH=~/.cache/sparkbench/esp-idf-tools \
  ~/.cache/sparkbench/esp-idf-v5.4.2/install.sh esp32
```

Build the helper, QEMU shared library, and real merged firmware image:

```sh
cd /path/to/sparkbench
npm ci
native/esp32/build-qemu.sh
native/esp32/build-helper.sh
native/esp32/build-firmware.sh
npm run dev
```

The scripts place all outputs under `~/.cache/sparkbench` by default. The
firmware script builds bootloader, partitions, and application using ESP-IDF,
merges them, and pads the result to exactly 4 MiB. No firmware image, QEMU
library, ROM, toolchain, or generated build directory belongs in git.

## Scope and limits

Only digital GPIO and UART transmit (TX) serial are advertised. UART receive,
I2C, SPI, RMT, Wi-Fi, PWM, and other peripherals are not implemented. I2C, SPI,
and RMT callback use reports an error when the pinned QEMU fork invokes those
callbacks; peripherals that execute without one of these callbacks may not be
detected. This is not a validator for arbitrary firmware behavior.

The QEMU bridge maps GPIO0–31. A circuit may wire only GPIOs exposed by the
ESP32 DevKit V1 pin definitions and numbered below 32 (currently GPIO1–5,
GPIO12–19, GPIO21–23, and GPIO25–27). A wired GPIO32 or higher is rejected.
Internal pull-up/down configuration is not forwarded from firmware; GPIO input
circuits must provide their own external pull-up or pull-down. The circuit
feedback loop runs at approximately 10 ms and is not cycle accurate. Supported
circuit parts are the ESP32 DevKit V1, resistor, LED, pushbutton, and slide
switch.

Uploaded firmware must be an exactly 4 MiB merged classic ESP32 flash image
using the fixed bootloader, partition-table, and application offsets:
bootloader at `0x1000`, partition table at `0x8000`, and application at
`0x10000`. Preflight checks the ESP image magic/chip ID, bounded segment counts
and lengths, and an application partition entry at `0x10000`. This is a
structural preflight only: it does not verify image checksums, signatures,
secure boot, flash encryption, or general firmware compatibility.

The QEMU watchdog is disabled. The helper captures UART TX output from the
simulated chip; it does not provide a UART RX console.

The default demo is a real ESP-IDF program: GPIO2 blinks at about 500 ms when
GPIO4 is released and remains on while GPIO4 is pulled low. It prints a boot
marker and button state over UART0. `main.py` in the example is descriptive
only and is never executed by native mode.

## Security and licensing

The API is loopback and same-origin by default, bounds requests/output, uses
private per-session flash/eFuse copies, limits sessions to 120 seconds and two
concurrent instances, and never passes client paths or commands to a shell.
The helper has 130 CPU-seconds and a 4 GiB address-space limit per session.
This is intended for trusted local use, not a hardened hostile multi-tenant
sandbox. Firmware networking is disabled in the QEMU arguments.

The helper is GPL-2.0-or-later; its complete license text is included in
`native/esp32/helper/COPYING`. It dynamically links the GPL QEMU library,
which remains under QEMU's own GPL-2.0 and third-party notices. QEMU's
`pc-bios/esp32-v3-rom*.bin` files are sourced from `pc-bios` at the pinned
QEMU revision and listed in its `pc-bios/meson.build`. Their embedded
Espressif mask-ROM contents are not relicensed as MIT or GPL by QEMU or this
repository. The MIT Sparkbench repository does not redistribute those blobs;
use the pinned local QEMU checkout as the ROM source.

## Verification

```sh
npm test -- tests/sim/esp32-firmware.test.ts
SPARKBENCH_ESP32_INTEGRATION=1 npm test -- tests/sim/esp32-native.test.ts
npm test -- tests/unit/firmware-client.test.ts
npm test -- tests/sim/behavior.test.ts tests/sim/examples.test.ts tests/sim/internet.test.ts tests/sim/gpiozero.test.ts
npm run typecheck
npm run build
```

The integration gate is intentionally strict: when enabled it fails if the
pinned QEMU library, helper, ROM files, or merged firmware are missing.
