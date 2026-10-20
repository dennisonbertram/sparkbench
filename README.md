# Sparkbench

**Describe a gadget. Get a circuit you can run.**

Sparkbench is an AI-assisted hardware design studio for microcontroller and discrete-component projects. Type what you want to build — *"an ESP32 with a screen, two buttons, a temperature sensor and an IMU"* — and it:

1. **Picks the parts and wires them** to pins that are actually valid for the board (shared I2C bus, ADC-capable pins, no input-only or boot-strapping pins for outputs, 5 V→3.3 V dividers, an MCP3008 when a Raspberry Pi needs analog inputs).
2. **Writes the firmware** — MicroPython for ESP32 / Raspberry Pi Pico, Python 3 + gpiozero for Raspberry Pi 4 — plus the device drivers.
3. **Simulates it**: the *exact same code* runs in MicroPython compiled to WebAssembly, against register-level models of the OLED, IMU and LCD and a real circuit solver for LEDs, buttons, pots, dividers, transistors and 555 timers. Press buttons, turn knobs, drag temperature / tilt / distance sliders.
4. **Produces the deliverables**: schematic (SVG + KiCad `.kicad_sch`/`.kicad_pro`/netlist), SPICE netlist for ngspice, parts list with prices and supplier links, a step-by-step build guide, and a full blog post.
5. **Checks the design** with plain-English electrical rules (LED without a resistor, 5 V into a 3.3 V pin, I2C address clashes, missing ground, current budget…) with one-click fixes.

Follow-ups work conversationally: *"add a buzzer"*, *"use a Raspberry Pi Pico instead"*, *"remove the LED"*.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

- **AI mode.** With `ANTHROPIC_API_KEY` set in the environment, the copilot uses Claude (`claude-opus-5-5`) to interpret requests and write custom firmware; the firmware is simulated on the server and crashes are fed back to Claude to fix. Without a key, the built-in offline planner handles requests (the badge in the Copilot panel shows which).
- **KiCad / ngspice.** If `kicad-cli` (KiCad 8+) and `ngspice` are installed, the Schematic tab can render and ERC-check the exported KiCad file, and tests cross-check our solver against ngspice.

## Supported hardware

| Boards | Parts |
|---|---|
| ESP32 DevKit V1 (MicroPython) · Raspberry Pi Pico (MicroPython) · Raspberry Pi 4 (Python + gpiozero) · no microcontroller (battery circuits) | SSD1306 OLED, 16×2 I2C LCD, push buttons, slide switch, potentiometer, DHT22, MPU-6050 IMU, HC-SR04 ultrasonic, PIR, photoresistor, NTC thermistor, soil moisture probe, LEDs, RGB LED, NeoPixel ring, buzzer, servo, relay module, resistors, capacitors, diode, NPN transistor, NE555, MCP3008, 9 V battery |

## Example projects

Open any from the welcome screen (or `/?example=<id>`): weather & motion station, traffic light, parking sensor, servo dial, plant waterer, motion alarm, night light, NeoPixel thermometer, fan thermostat, tilt meter, RGB mood lamp, 555 blinker, transistor switch.

## Tests

```bash
npm test                    # unit, simulation behaviour, KiCad and ngspice cross-checks
npm run typecheck
npm run dev & node tests/e2e/visual.mjs   # screenshot every view of every example
```

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

Part artwork uses [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (MIT). Simulation uses the [MicroPython](https://micropython.org) WebAssembly port (MIT).
