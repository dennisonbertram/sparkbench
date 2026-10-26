# Firmware emulators: local Docker and cloud

Status: proposal. The ESP32 runner (step 1) is built on branch `emulators` and verified on a Mac (Colima). The demo firmware boots in the container with Espressif's real ROM boot log on the serial console, blinks GPIO2, and holds the LED on while the virtual button on GPIO4 is pressed. The container is removed after the session.

## Goal

Run the program the user would really put on the board, the same way it would get there:
compile it, flash it, boot it. Sparkbench's circuit model still provides everything outside
the chip (LEDs, buttons, sensors, power). Today's browser simulator runs MicroPython against a
behavioral model of the board. That is fast and stays as the default. The emulator path is the
"does this exact firmware work" check.

## Shape

```
 project ──► build ──► firmware image ──► run ──► pin/serial events ──► circuit model ──► UI
 (code)     (container)  (.bin/.uf2/.elf)  (container)   ▲                    │
                                                         └── input pins ◄─────┘
```

There are two kinds of container per board family:

- **Builder** (`sparkbench-build-<family>`): takes source and returns a flash image.
  - Arduino sketches: `arduino-cli` with the board's core.
  - ESP-IDF: `idf.py build merge-bin`.
  - MicroPython: the official firmware image with the user's `main.py` written into its
    filesystem partition. This is the same result as copying `main.py` to a real board.
  - Builders need the network for toolchains. Bake those into the image and run with
    `--network none`.
- **Runner** (`sparkbench-<family>`): boots the image in an emulator and speaks the runner
  protocol on stdin/stdout. One container per session, with:
  - no network;
  - capped CPU, memory and processes;
  - a read-only root;
  - only the session folder mounted.

### Runner protocol (NDJSON, already used by the ESP32 helper)

- In:
  - `{"type":"sync","mask":…,"values":…}` sets input pins.
  - `{"type":"stop"}` stops the session.
- Out:
  - `{"type":"gpio","gpio":n,"value":0|1}`
  - `{"type":"direction",…}`
  - `{"type":"serial","value":byte}`
  - `{"type":"tick","timeUs":…}`
  - `{"type":"error","message":…}`

Planned additions, so emulated chips can talk to Sparkbench's virtual sensors:
- named pins, not just GPIO numbers below 32;
- `uart_rx` (input to the chip);
- `i2c`/`spi` transactions answered by the part models;
- `pwm` and `adc`.

The server side is the same for every family: `server/esp32.ts`, generalized into
`server/emulator.ts` with a per-family adapter that maps board pins to emulator pins.

## Where it runs

| Mode | How | Who it's for |
|---|---|---|
| **Local, native** | the helper binary on a Linux host | contributors on Linux |
| **Local, Docker** (built, verified) | one container per session, with the flash image copied in (no folder mounts, so any Docker host works), chosen automatically when the image exists | Mac/Windows/Linux users running Sparkbench locally |
| **Cloud** | a worker pool runs the same images, and the browser connects to it over WebSocket | hosted Sparkbench |

Cloud notes:
- Railway can't start containers from a container. The emulator pool needs a host that can, such as:
  - Fly.io Machines (Firecracker microVMs, started per session);
  - a small VM fleet with Docker plus gVisor (`--runtime=runsc`).
- The hosted app keeps doing auth through the multitenancy branch. It asks the pool for a
  session and receives a short-lived signed token. The pool enforces per-workspace minutes,
  using the same budget table as AI usage.
- The emulator images are identical in both places. "Local" and "cloud" are only a choice of
  runner endpoint.

Licensing:
- The QEMU forks and the helper are GPL. They are separate programs we talk to over a pipe, so
  the MIT app is unaffected.
- Espressif ROM images ship only inside the runner image, built from the pinned upstream
  source. They are never committed to this repository.

## Boards

| Board | Chip | Emulator | What works / is missing | Plan |
|---|---|---|---|---|
| ESP32 DevKit V1 | ESP32 (Xtensa LX6) | lcgamboa QEMU fork (PICSimLab callbacks) | GPIO 0-31 and UART TX work. Missing: UART RX, I²C, SPI, PWM, Wi-Fi bridging | **Now** (Docker runner built). Next: an Arduino/MicroPython builder; I²C/SPI to part models through the fork's callbacks |
| ESP32-S3 / C3 | Xtensa LX7 / RISC-V | Espressif's QEMU fork (`idf.py qemu`; prebuilt for Linux/macOS, x86_64 and arm64) | Runs ESP-IDF apps. Its GPIO is not wired to an external pin API | Add a GPIO character-device bridge to the fork, then the same adapter |
| Raspberry Pi Pico | RP2040 | `rp2040js` (MIT, JavaScript) | Runs real UF2s, including MicroPython and Arduino. GPIO, UART, I²C, SPI, PIO | **No container needed**: runs in the browser worker. Best next target |
| Raspberry Pi 4 | BCM2711 | QEMU `raspi4b` (GPIO controller emulated; ADC/PWM/PCIe/Ethernet missing) | Boots Linux. Getting GPIO to the host needs a QEMU GPIO-to-chardev bridge (qtest or a small device patch) | Later. Boot time and image size make it a cloud-first target. The behavioral Python sim stays the default |
| Nicla Vision | STM32H747 (M7+M4) | Renode (STM32H7 support is active; the H753 reference platform has a digital twin) | Expect: M7 core, GPIO, UART, I²C. Missing: the camera (GC2145), the M4 core, the dual-core mailbox | Renode runner: a `.repl` for the H747 plus a Renode external-pin bridge. MicroPython (OpenMV) and Arduino builders |
| Nicla Voice | nRF52832 + Syntiant NDP120 | Renode has an nRF52840 model; nRF52832 support needs checking | The NDP120 neural decision processor can't be emulated | Lowest priority. GPIO/UART/I²C only; audio and wake-word features are marked not emulated |

## Steps

1. **ESP32 in Docker** (done on this branch).
   - `docker/esp32-runtime.Dockerfile`.
   - The server uses it automatically when no native build exists.
2. **Builder for ESP32.**
   - "Run real firmware" builds from the project's code: MicroPython plus `main.py`, or an
     Arduino sketch.
   - Users no longer have to upload a `.bin`.
3. **Pico in the browser with rp2040js** (no server at all).
4. **Generalize the runner** (`server/emulator.ts`, named pins, UART RX, I²C to part models).
5. **Renode runner** for Nicla Vision (and STM32/nRF boards generally).
6. **Cloud pool**: the hosted app gets runner tokens, with per-workspace minutes.
7. **Pi 4** via QEMU, cloud-first.

## Risks

- **Emulator fidelity.** Every runner must report which capabilities it really models. The UI
  must never present "ran in emulator" as "works on hardware". The ESP32 work already does this
  through `capabilities`.
- **Image sizes.** ESP-IDF and Arduino cores are GBs, and Pi OS images are large. Pre-pull them
  on the cloud pool. Locally, download them on first use, with progress.
- **Hostile firmware in the cloud.** Use microVM or gVisor isolation, no network, hard time and
  CPU limits, and one session per container.
