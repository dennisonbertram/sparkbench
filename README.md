# Sparkbench

**Describe a gadget. Get a circuit you can run.**

Sparkbench is an AI-assisted hardware design studio for microcontroller and discrete-component projects. Type what you want to build — *"an ESP32 with a screen, two buttons, a temperature sensor and an IMU"* — and it:

1. **Picks the parts and wires them** to pins that are actually valid for the board (shared I2C bus, ADC-capable pins, no input-only or boot-strapping pins for outputs, 5 V→3.3 V dividers, an MCP3008 when a Raspberry Pi needs analog inputs).
2. **Writes the firmware** — MicroPython for ESP32 / Raspberry Pi Pico, Python 3 + gpiozero for Raspberry Pi 4 — plus the device drivers.
3. **Simulates it**: the *exact same code* runs in MicroPython compiled to WebAssembly, against register-level models of the OLED, IMU and LCD and a real circuit solver for LEDs, buttons, pots, dividers, transistors and 555 timers. Press buttons, turn knobs, drag temperature / tilt / distance sliders.
4. **Produces the deliverables**: schematic (SVG + KiCad `.kicad_sch`/`.kicad_pro`/netlist), SPICE netlist for ngspice, parts list with prices and supplier links, a step-by-step build guide, and a full blog post.
5. **Checks the design** with plain-English electrical rules (LED without a resistor, 5 V into a 3.3 V pin, I2C address clashes, missing ground, current budget…) with one-click fixes.

**Any component, from its datasheet.** Not in the library? Type a part number (or paste a datasheet URL) under *+ Add part → Add any component*. Claude finds and reads the datasheet, extracts the pinout, supply range, interface (I2C address, SPI…), price, build tips and — for protocol parts — writes a MicroPython driver. You review it, and Sparkbench wires it in, draws it, simulates it (analog/digital sensors, actuators, I2C register devices), and puts it in the schematic, KiCad export, BOM and docs. Each fetched part is saved as a **Claude Code skill** in `.claude/skills/part-<mpn>/` (`SKILL.md` + `part.json` + driver), so the in-app AI and Claude Code itself both reuse that datasheet knowledge. The repo ships skills for the TMP36, BME280 and VL53L0X.

Follow-ups work conversationally: *"add a buzzer"*, *"use a Raspberry Pi Pico instead"*, *"move button A to GPIO 14"*, *"make it beep when it's too hot"*. In the **Code** tab, an AI pair-programmer edits the firmware on request ("show the temperature in Fahrenheit"), runs the new code in the simulator first (auto-fixing crashes), and shows you a diff to accept.

## From idea to a manufactured device

The full journey is specified (with how each story is tested) in [docs/PRODUCT-VISION.md](docs/PRODUCT-VISION.md). In short:

- **Understand the idea.** Clarifying questions when a request is vague, a requirements card, design from a photo or sketch, and **acceptance tests written from your words**. These run in the simulator on every change: the Tests tab reads the screen, LEDs, buzzer and serial output.
- **Build a prototype.**
  - An exact **hole-by-hole breadboard layout**, verified against the schematic, with a step-by-step build mode;
  - an illustrated tools list, and live LCSC stock and prices with a one-file cart.
- **Check the real thing.** The **Your board** panel connects over Web Serial and installs MicroPython (esptool-js / Pico UF2). It also:
  - copies the program and runs a **self-test** (compared with the simulator);
  - shows the serial monitor, guided multimeter checks, and "Ask AI what is wrong";
  - offers Wi-Fi (OTA) updates for the ESP32.
  - Separately, the **photo wiring check** compares a photo of your breadboard with the design.
- **Make it permanent.** The **Circuit board** tab:
  - places and routes the board (KiCad + Freerouting), then checks DRC and schematic parity against JLCPCB / PCBWay / OSH Park rules;
  - lets you drag parts and re-route, and prints pin names, a logo, the revision and a QR code on the silkscreen;
  - offers a **Product** version (bare ESP32 module, USB, regulator, USB-serial, surface-mount parts);
  - exports Gerbers, BOM with LCSC numbers, CPL, assembly drawing, TEST.md and COMPLIANCE.md, plus V-scored panels (KiKit);
  - shows live parts cost at 5 / 50 / 500 boards, and a **3D-printable case** (STL + STEP, four styles, 3D preview);
  - tracks revisions (Rev A → B with computed changes).
- **Power and code.**
  - Battery life from a simulated run of your firmware, with the regulator, charger and protection advice;
  - plain-English explanations when you hover any line of code;
  - an **Arduino/C++ version** compiled with arduino-cli.
- **Together.** A gallery with remixes, classes graded in the simulator with a teacher dashboard, and live co-editing with comments, all on your own Sparkbench server.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

- **AI mode.** The copilot and code assistant use Claude (`claude-opus-5-5`): through the Anthropic SDK when `ANTHROPIC_API_KEY` is set, or otherwise through your logged-in **Claude Code** CLI (`claude -p`). Claude turns requests into a parts-level design and writes custom firmware; every firmware change is simulated on the server and crashes are fed back to Claude to fix. With neither available (or `SPARKBENCH_AI=off`), the built-in offline planner handles requests — the badge in the Copilot panel shows which.
- **KiCad / ngspice.** If `kicad-cli` (KiCad 8+) and `ngspice` are installed, the Schematic tab can render and ERC-check the exported KiCad file, and tests cross-check our solver against ngspice.

## Supported hardware

| Boards | Parts |
|---|---|
| ESP32 DevKit V1 (MicroPython, Wi-Fi) · Raspberry Pi Pico (MicroPython) · Raspberry Pi 4 (Python + gpiozero, network) · no microcontroller (battery circuits) | 2.9" e-paper (SPI), SSD1306 OLED, 16×2 I2C LCD, push buttons, slide switch, potentiometer, DHT22, MPU-6050 IMU, HC-SR04 ultrasonic, PIR, photoresistor, NTC thermistor, soil moisture probe, LEDs, RGB LED, NeoPixel ring, buzzer, servo, relay module, 5 V pump / fan, resistors, capacitors, diode, NPN transistor, NE555, MCP3008, 9 V battery |

## Example projects

Open any of the 19 from the welcome screen (or `/?example=<id>`):

- **Beginner / intermediate:** weather & motion station (ESP32, OLED, DHT22, MPU-6050, 2 buttons), traffic light, parking sensor, servo dial, plant waterer (Raspberry Pi + MCP3008 + pump relay), motion alarm, night light, NeoPixel thermometer, fan thermostat, tilt meter, RGB mood lamp, 555 blinker, 555 tone generator, transistor switch.
- **Advanced (hand-written firmware):** e-ink weather station (Wi-Fi + Open-Meteo + 2.9" e-paper), internet alarm clock (NTP + LCD), Simon memory game, step counter (IMU peak detection), Raspberry Pi weather dashboard.

`npx tsx scripts/build-project.ts --all-examples` writes every deliverable for every example to `out/<project>/` (firmware, schematic.svg, KiCad schematic/project/netlist/footprints, SPICE netlist, bom.csv, BUILD.md, BLOG.md, simulation log, design-check report).

## Tests

```bash
npm test                    # unit, simulation behaviour, KiCad and ngspice cross-checks
npm run typecheck
npm run dev & node tests/e2e/visual.mjs   # screenshot every view of every example
node tests/e2e/photo-check.mjs            # live: upload breadboard photos in the Build guide, check Claude's verdict
node tests/e2e/build-mode.mjs             # step-by-step breadboard build mode
node tests/e2e/pcb.mjs <example>          # Circuit board tab: design, check and download a PCB
node tests/e2e/pcb-product.mjs            # product version (bare ESP32 module, SMD parts)
node tests/e2e/pcb-panel.mjs              # V-scored panel
node tests/e2e/case.mjs <example>         # printable case + 3D preview, all styles
node tests/e2e/board-editor.mjs           # drag parts, re-route
node tests/e2e/board.mjs [--ai]           # Your board with a simulated USB board (raw REPL)
node tests/e2e/ota.mjs                    # Wi-Fi updates to real MicroPython (needs `micropython`)
node tests/e2e/ai-intent.mjs              # live: idea → requirements → acceptance tests pass
node tests/e2e/ai-clarify.mjs             # live: vague idea → questions → design
node tests/e2e/sketch-design.mjs          # live: design from a hand sketch
node tests/e2e/explain.mjs --ai           # hover explanations
node tests/e2e/arduino.mjs                # live: Arduino version compiles (needs arduino-cli + cores)
node tests/e2e/sourcing.mjs               # live LCSC prices + cart
node tests/e2e/power.mjs                  # power card
node tests/e2e/community.mjs              # two people: gallery, live editing, class + teacher dashboard
npx tsx tests/e2e/grading.mts             # grading tells a right project from a wrong one
npx tsx scripts/evals/design-eval.mts     # AI design eval
npx tsx scripts/evals/code-eval.mts       # AI code-change eval
npx tsx scripts/breadboard-all.ts         # plan + verify the breadboard layout of every example
```

### Photo wiring check eval

`scripts/vision-eval/` measures how reliably Claude spots wiring mistakes in a photo of a breadboard. It renders five reference builds (Pico blink, traffic light, button, night light, 555 blinker) on a modelled 830-point breadboard (`src/core/breadboard.ts`) and injects typical beginner faults: reversed LED, a leg one hole off, the wrong Pico pin, a missing ground wire, a jumper on the wrong rail, a shorted resistor. Every fault is verified to change the circuit's connectivity. Each build is rendered clean and as a tilted, blurred, JPEG "phone photo". The model sees only a neutral file name, so the name can't give the answer away.

```bash
npx tsx scripts/vision-eval/check.ts    # sanity: layouts match their circuits, faults change them
npx tsx scripts/vision-eval/render.ts   # → test-results/vision/images
npx tsx scripts/vision-eval/run.ts      # asks Claude, writes test-results/vision/REPORT.md
```

## Circuit boards

The **Circuit board** tab (or `npx tsx scripts/make-pcb.ts <example|--all>`) makes a manufacturable 2-layer PCB with open-source tools:

1. `src/core/pcb.ts` writes the board spec: a footprint per part and each pad's net. Net names come from KiCad's own netlist of the exported schematic, and any disagreement is reported.
2. `scripts/pcb/make_pcb.py` (KiCad's Python, `pcbnew`) places parts to minimise wire length, then draws a rounded outline, M3 mounting holes and silkscreen.
3. [Freerouting](https://github.com/freerouting/freerouting) routes the board, offline with analytics disabled. `pcbnew` then pours ground on both layers.
4. `kicad-cli` runs DRC with schematic parity against common factory limits (0.15 mm track and space, 0.3 mm drill). It then exports Gerbers, drill files, positions, a 3D render and STEP. Sparkbench adds a JLCPCB-style BOM and CPL.

Needs KiCad 8+ and Java 21+ with `freerouting-2.5.0.jar` in `~/.cache/sparkbench/freerouting/`; panels need KiKit (`python3 -m pip install --target ~/.cache/sparkbench/kikit-lib kikit` with KiCad's Python). Arduino builds need `arduino-cli` with the `esp32:esp32` and `rp2040:rp2040` cores. Live part prices use JLCPCB's public parts search (cached for a day). The paths can be overridden with the `KICAD_APP`, `JAVA` and `FREEROUTING_JAR` environment variables. The native `freerouting-cli` build crashes in 2.5.0, so use the jar.

## How it fits together

```
prompt ─▶ planner (offline) or Claude ─▶ DesignSpec ─▶ buildProject: parts + pin allocation + wires + firmware
                                                         │
          ┌──────────────────────┬───────────────────────┼──────────────────────┬───────────────────┐
          ▼                      ▼                       ▼                      ▼                   ▼
   breadboard view        simulator (worker)       schematic / KiCad       SPICE (ngspice)     BOM, guide, blog
   (Wokwi elements)   MicroPython-wasm + MNA solver
                      + I2C device models
```

- `src/core` — data model, parts library, boards, planner, codegen, circuit solver, exporters, docs
- `src/sim` — simulation engine, Python hardware shims (`machine`, `gpiozero`, `smbus2`…), device models, Web Worker
- `src/ui` — React app
- `server` — Vite middleware: Claude copilot, kicad-cli and ngspice endpoints

Part artwork uses [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (MIT). Simulation uses the [MicroPython](https://micropython.org) WebAssembly port (MIT). Internet examples use the free [Open-Meteo](https://open-meteo.com) API (the simulator makes real requests from the browser and falls back to sample data offline).
