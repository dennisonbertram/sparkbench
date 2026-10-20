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
- A1 As Nia, on first load I immediately understand what the tool does and what to click first (one obvious "Describe your project" box + example gallery).
- A2 As Nia, I can open a ready-made example and press ▶ Simulate within 10 seconds of landing.
- A3 As Nia, I see a short guided tour (3–5 steps) explaining Breadboard, Schematic, Code, Simulate, Outputs; I can skip it and re-open it.
- A4 As Nia, every panel has an empty state that tells me what to do next.
- A5 As Nia, jargon (GPIO, I2C, pull-up, net) is explained by hover tooltips / glossary.

## B. Describe → design (the AI copilot)
- B1 As Max, I type "ESP32 with an OLED screen, two buttons, temperature sensor and IMU" and get a complete design: parts, wiring, firmware, docs.
- B2 As Nia, the AI explains *what it did and why* (chosen parts, pin choices) in plain language.
- B3 As Max, I can follow up conversationally: "add a buzzer", "use a Raspberry Pi Pico instead", "remove the LED", "move the button to GPIO 14".
- B4 As Max, if my request is ambiguous or impossible (e.g. 40 analog sensors on a Pico) the AI tells me and proposes an alternative.
- B5 As Eli, the AI works with a real LLM (Claude) when an API key is configured, and with a deterministic offline planner when it isn't — and the UI tells me which mode I'm in.
- B6 As Max, the AI picks pins that are actually valid for the board (input-only pins, ADC-capable pins, boot-strapping pins, shared I2C bus).
- B7 As Max, the AI-generated firmware is simulated automatically; if it crashes, the error is fed back and fixed (agent loop) or clearly shown to me.

## C. Parts & wiring (breadboard view)
- C1 As Nia, I see realistic pictures of the board and parts with coloured wires between pins.
- C2 As Max, I can add a part from a searchable, categorised library (with description, voltage, price).
- C3 As Max, I can drag parts around; wires follow.
- C4 As Max, I can create a wire by clicking a pin then another pin, and delete a wire/part.
- C5 As Nia, hovering a pin shows its name and what it's connected to.
- C6 As Max, I can edit part properties (resistor value, LED colour, button label).

## D. Schematic
- D1 As Eli, I get a clean schematic (standard symbols, reference designators R1/U1/SW1, net labels) generated from the design.
- D2 As Eli, the schematic updates when wiring changes.
- D3 As Eli, I can export a KiCad 8+/10 schematic (.kicad_sch) + project that opens in KiCad and passes ERC sanity, and a KiCad netlist.
- D4 As Eli, I can download the schematic as SVG/PNG for documentation.
- D5 As Nia, I can click a net in the schematic and see it highlighted in the breadboard view.

## E. Firmware / code
- E1 As Max, I get readable MicroPython firmware (ESP32 / Pico) or Python + gpiozero (Raspberry Pi) with comments.
- E2 As Max, I can edit the code in an editor with syntax highlighting; the simulation runs *exactly this code*.
- E3 As Max, required drivers (ssd1306.py, mpu6050.py, …) are included as separate files, matching what I'd copy onto the real board.
- E4 As Nia, errors (syntax / runtime) show the line number in plain language with a hint.

## F. Simulation
- F1 As Nia, I press ▶ and the board boots: LEDs light, the OLED draws, serial output appears in a console.
- F2 As Nia, I can press on-screen buttons, turn knobs, and set sensor values (temperature slider, tilt the IMU, distance, motion, light).
- F3 As Max, I see pin states / PWM duty / I2C traffic live.
- F4 As Max, I can stop, restart, and change speed of the simulation.
- F5 As Eli, analog/discrete circuits (LED+resistor, transistor switch, RC, 555 blinker, divider) are solved with a real circuit solver; LED currents and over-current are reported.
- F6 As Eli, I can export a SPICE netlist and run it in ngspice; results match the built-in solver.
- F7 As Nia, wiring mistakes (sensor not connected, LED without resistor, 5 V on a 3.3 V pin) show up as clear simulation warnings, not silent failures.

## G. Design checks (ERC / DRC)
- G1 As Max, I see a checklist of problems: unconnected required pins, missing ground, voltage mismatch, I2C address clash, LED without resistor, input-only pin used as output, strapping pins, current budget.
- G2 As Nia, every check has a plain-English explanation and a one-click fix where possible.

## H. Outputs (the deliverables)
- H1 Schematic (in-app SVG + KiCad export).
- H2 Working simulator (in-app, shareable).
- H3 Parts list / BOM with quantities, descriptions, approximate prices and supplier search links; CSV export.
- H4 Full blog post (Markdown/HTML) explaining the project, with schematic and code.
- H5 Step-by-step build instructions (wiring table, assembly steps, flashing firmware, testing, troubleshooting).
- H6 As Eli, I can download everything as a single ZIP (code, KiCad, SPICE, BOM, docs).

## I. Projects lifecycle
- I1 As Max, my project autosaves in the browser and I can come back to it.
- I2 As Max, I can start new, rename, duplicate, and delete projects.
- I3 As Tess, I can import/export the project JSON to share it.
- I4 As Max, undo/redo for edits.

## J. Boards & tooling coverage
- J1 ESP32 DevKit (MicroPython), Raspberry Pi Pico (MicroPython), Raspberry Pi 4 (Python/gpiozero), and pure discrete circuits (no MCU).
- J2 At least 10 complete example projects, each with schematic, simulation, BOM, blog, build guide.
- J3 Open-source toolchain interop: KiCad (schematic/netlist), ngspice (SPICE), MicroPython / mpremote (flashing instructions).

## K. Quality
- K1 Works at laptop widths (1280px) and degrades sensibly on narrow screens.
- K2 No console errors during the main flows.
- K3 Automated tests cover the planner, pin assignment, netlist, checks, exporters, circuit solver and every example project's simulation.
