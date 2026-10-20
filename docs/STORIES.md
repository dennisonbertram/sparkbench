# Sparkbench — User Stories

Sparkbench is an AI-assisted hardware design studio: describe a gadget in plain
English, get a wired circuit, a schematic, simulated firmware you can poke at,
a parts list, a build guide and a write-up — then export to KiCad / ngspice.

Personas
- **Newbie Nia** — has never wired a microcontroller. Wants to see something work fast and not be scared.
- **Maker Max** — has built Arduino projects, wants to go faster and avoid frying parts.
- **Engineer Eli** — wants real artifacts (KiCad schematic, SPICE netlist, BOM CSV) to move into a proper flow.
- **Teacher Tess** — wants repeatable example projects and printable build instructions for a class.

Status legend: ☐ todo · ◐ partial · ☑ done (verified by automated test or visual pass)

## A. First contact / onboarding
- ☑ A1 As Nia, on first load I immediately understand what the tool does and what to click first (one obvious "Describe your project" box + example gallery).
- ☑ A2 As Nia, I can open a ready-made example and press ▶ Simulate within 10 seconds of landing.
- ☑ A3 As Nia, I see a short guided tour (3–5 steps) explaining Breadboard, Schematic, Code, Simulate, Outputs; I can skip it and re-open it.
- ◐ A4 As Nia, every panel has an empty state that tells me what to do next.
- ☑ A5 As Nia, jargon (GPIO, I2C, pull-up, net) is explained by hover tooltips / glossary.

## B. Describe → design (the AI copilot)
- ☑ B1 As Max, I type "ESP32 with an OLED screen, two buttons, temperature sensor and IMU" and get a complete design: parts, wiring, firmware, docs.
- ☑ B2 As Nia, the AI explains *what it did and why* (chosen parts, pin choices) in plain language.
- ☑ B3 As Max, I can follow up conversationally: "add a buzzer", "use a Raspberry Pi Pico instead", "remove the LED", "move the button to GPIO 14".
- ◐ B4 As Max, if my request is ambiguous or impossible (e.g. 40 analog sensors on a Pico) the AI tells me and proposes an alternative.
- ☑ B5 As Eli, the AI works with a real LLM (Claude) when an API key is configured, and with a deterministic offline planner when it isn't — and the UI tells me which mode I'm in.
- ☑ B6 As Max, the AI picks pins that are actually valid for the board (input-only pins, ADC-capable pins, boot-strapping pins, shared I2C bus).
- ☑ B7 As Max, the AI-generated firmware is simulated automatically; if it crashes, the error is fed back and fixed (agent loop) or clearly shown to me.

## C. Parts & wiring (breadboard view)
- ☑ C1 As Nia, I see realistic pictures of the board and parts with coloured wires between pins.
- ☑ C2 As Max, I can add a part from a searchable, categorised library (with description, voltage, price).
- ☑ C3 As Max, I can drag parts around; wires follow.
- ☑ C4 As Max, I can create a wire by clicking a pin then another pin, and delete a wire/part.
- ☑ C5 As Nia, hovering a pin shows its name and what it's connected to.
- ☑ C6 As Max, I can edit part properties (resistor value, LED colour, button label).

## D. Schematic
- ☑ D1 As Eli, I get a clean schematic (standard symbols, reference designators R1/U1/SW1, net labels) generated from the design.
- ☑ D2 As Eli, the schematic updates when wiring changes.
- ☑ D3 As Eli, I can export a KiCad 8+/10 schematic (.kicad_sch) + project that opens in KiCad and passes ERC sanity, and a KiCad netlist.
- ◐ D4 As Eli, I can download the schematic as SVG/PNG for documentation.
- ☑ D5 As Nia, I can click a net in the schematic and see it highlighted in the breadboard view.

## E. Firmware / code
- ☑ E1 As Max, I get readable MicroPython firmware (ESP32 / Pico) or Python + gpiozero (Raspberry Pi) with comments.
- ☑ E2 As Max, I can edit the code in an editor with syntax highlighting; the simulation runs *exactly this code*.
- ☑ E3 As Max, required drivers (ssd1306.py, mpu6050.py, …) are included as separate files, matching what I'd copy onto the real board.
- ☑ E4 As Nia, errors (syntax / runtime) show the line number in plain language with a hint.

## F. Simulation
- ☑ F1 As Nia, I press ▶ and the board boots: LEDs light, the OLED draws, serial output appears in a console.
- ☑ F2 As Nia, I can press on-screen buttons, turn knobs, and set sensor values (temperature slider, tilt the IMU, distance, motion, light).
- ☑ F3 As Max, I see pin states / PWM duty / I2C traffic live.
- ☑ F4 As Max, I can stop, restart, and change speed of the simulation.
- ☑ F5 As Eli, analog/discrete circuits (LED+resistor, transistor switch, RC, 555 blinker, divider) are solved with a real circuit solver; LED currents and over-current are reported.
- ☑ F6 As Eli, I can export a SPICE netlist and run it in ngspice; results match the built-in solver.
- ☑ F7 As Nia, wiring mistakes (sensor not connected, LED without resistor, 5 V on a 3.3 V pin) show up as clear simulation warnings, not silent failures.

## G. Design checks (ERC / DRC)
- ☑ G1 As Max, I see a checklist of problems: unconnected required pins, missing ground, voltage mismatch, I2C address clash, LED without resistor, input-only pin used as output, strapping pins, current budget.
- ☑ G2 As Nia, every check has a plain-English explanation and a one-click fix where possible.

## H. Outputs (the deliverables)
- ☑ H1 Schematic (in-app SVG + KiCad export).
- ☑ H2 Working simulator (in-app, shareable).
- ☑ H3 Parts list / BOM with quantities, descriptions, approximate prices and supplier search links; CSV export.
- ☑ H4 Full blog post (Markdown/HTML) explaining the project, with schematic and code.
- ☑ H5 Step-by-step build instructions (wiring table, assembly steps, flashing firmware, testing, troubleshooting).
- ☑ H6 As Eli, I can download everything as a single ZIP (code, KiCad, SPICE, BOM, docs).

## I. Projects lifecycle
- ☑ I1 As Max, my project autosaves in the browser and I can come back to it.
- ☑ I2 As Max, I can start new, rename, duplicate, and delete projects.
- ☑ I3 As Tess, I can import/export the project JSON to share it.
- ☑ I4 As Max, undo/redo for edits.

## J. Boards & tooling coverage
- ☑ J1 ESP32 DevKit (MicroPython), Raspberry Pi Pico (MicroPython), Raspberry Pi 4 (Python/gpiozero), and pure discrete circuits (no MCU).
- ☑ J2 At least 10 complete example projects, each with schematic, simulation, BOM, blog, build guide.
- ☑ J3 Open-source toolchain interop: KiCad (schematic/netlist), ngspice (SPICE), MicroPython / mpremote (flashing instructions).

## K. Quality
- ◐ K1 Works at laptop widths (1280px) and degrades sensibly on narrow screens.
- ☑ K2 No console errors during the main flows.
- ☑ K3 Automated tests cover the planner, pin assignment, netlist, checks, exporters, circuit solver and every example project's simulation.

## L. AI pair-engineering (added after the first build)
- ☑ L1 As Max, I can open the Code tab and ask the AI in plain words to change the program ("blink twice as fast", "show Fahrenheit"); I see a diff and accept or discard it.
- ☑ L2 As Max, every AI code change is run in the simulator before I see it; if it crashes, the AI fixes it automatically (up to two rounds) and tells me.
- ☑ L3 As Nia, when my program crashes I get a "Fix this crash with AI" button next to the error.
- ☑ L4 As Max, the AI uses my Claude Code login when there is no API key, so it works out of the box on my machine.
- ☑ L5 As Tess, when the AI writes custom code, the build guide and blog describe what *that* code does.

## M. Connected and advanced projects
- ☑ M1 As Max, I can build internet-connected projects (ESP32 / Raspberry Pi Wi-Fi): weather from Open-Meteo, time over NTP; the simulator makes real HTTP requests (with offline sample data) and has a "Wi-Fi in range" switch.
- ☑ M2 As Max, I can use an e-paper (e-ink) display over SPI, and see exactly what the panel would show, including its slow refresh.
- ☑ M3 As Tess, I can open advanced examples (e-ink weather station, internet alarm clock, Simon game, step counter, Pi weather dashboard) that go beyond the default behaviour.

Verification: `npm test` (unit, simulation behaviour for every example, KiCad ERC/netlist, ngspice cross-checks), `node tests/e2e/visual.mjs` (screenshots of every view of every example), `node tests/e2e/ai-design.mjs` and `node tests/e2e/ai-code.mjs` (live Claude flows).

## N. Any component (datasheet-driven)
- ☑ N1 As Eli, I can add a component that isn't in the library by typing its part number or datasheet URL; the AI finds the datasheet and extracts pins, voltages, interface, price and build tips, which I review before adding.
- ☑ N2 As Max, the new part is wired for me (power at an allowed voltage, ground, I2C/SPI bus pins, an ADC pin for analog outputs, free GPIOs for digital pins), drawn on the breadboard, and appears in the schematic, KiCad export, BOM, checks and docs.
- ☑ N3 As Nia, I can simulate it: analog sensors get a slider that sets the real output voltage, digital sensors a toggle, actuators light up when driven, and I2C parts answer at their address with datasheet register values.
- ☑ N4 As Max, the AI writes a MicroPython driver from the datasheet and uses the part's datasheet knowledge when changing my code.
- ☑ N5 As Tess, each datasheet becomes a reusable Claude Code skill (`.claude/skills/part-<mpn>/SKILL.md`) that also appears as "Your components" in the parts library.

## O. Check the real build (vision)
- ☑ O1 As Max, I can take a phone photo of my breadboard in the Build guide and Claude compares it with the design, listing each mistake (part, what's wrong, exactly what to move) with a confidence.
- ☑ O2 As Nia, when something can't be seen in the photo (LED direction, legs hidden under a part), I'm told what to check by eye and how to take a better photo. I'm never given a plain "looks right" for something that wasn't actually checked.
- ☑ O3 As Tess, there is a measured eval of how well photo checks work (`scripts/vision-eval/`): ground-truth breadboard layouts, injected beginner faults, clean and phone-photo renders, two prompt conditions, scored detection / localisation / false alarms.

## P. Exact build plan and circuit board
- ☑ P1 As Sam, every project comes with a hole-by-hole breadboard layout (Pico, ESP32, Raspberry Pi via a T-Cobbler, chips, modules, off-board parts) that Sparkbench has checked makes exactly the schematic's connections.
- ☑ P2 As Sam, **Build it step by step** shows one step at a time, draws only what's placed so far, rings the holes to use, and remembers where I stopped.
- ☑ P3 As Priya, the **Circuit board** tab turns my design into a routed 2-layer PCB:
  - KiCad places the parts, Freerouting routes them, and both sides get a ground pour and M3 mounting holes;
  - KiCad checks it against factory limits (DRC) and against the schematic (parity);
  - I get Gerbers, drill, BOM, CPL, the KiCad project and a STEP model, plus plain-English ordering steps.
- ☑ P4 As Tess, `npx tsx scripts/make-pcb.ts --all` builds every example's board: all 19 route fully with 0 DRC errors and 0 schematic-parity differences.
