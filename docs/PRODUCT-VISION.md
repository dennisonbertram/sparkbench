# Sparkbench, the complete version: from an idea to a manufactured device, with no prior knowledge

**Promise:** a person who has never touched electronics describes what they want in plain words. Sparkbench designs it and simulates it. It walks them through building a prototype and checks that the prototype works. It then produces a factory-ready package: a circuit board, assembly files and an enclosure, ready to order and receive by post.

Status legend: ✅ built · 🟡 partly built · ⬜ not started

## Who it's for

| Persona | Who | What they need |
|---|---|---|
| **Sam, the curious beginner** | Has never soldered and doesn't know what a resistor is | Plain language, no jargon, never a dead end, safe defaults |
| **Priya, the maker with an idea** | Wants a product (a plant monitor for her shop, a gift, a Kickstarter prototype) | Something that looks finished: a real PCB, an enclosure, a parts cost, a manufacturing quote |
| **Leo, the student** | Learning in a class | Explanations, "why it's wired this way", feedback on mistakes |
| **Ms. Ortiz, the teacher** | Runs a class of 30 | Assignments, checking builds from photos, progress tracking |
| **Dana, the engineer** | Knows KiCad | Clean, editable outputs and no lock-in; tweaks by hand, then lets the AI continue |

## Design principles

1. **Never a blank page.** Every screen says what to do next, in one sentence.
2. **Every step is verified, not assumed.** The AI's work is checked by a simulator, design rules, the KiCad tools, and photos or measurements of the real thing.
3. **Plain words first, details on demand.** Every term has a hover explanation; the expert view is one click away.
4. **Real, open outputs.** KiCad, SPICE, Gerber, STEP and MicroPython, so nothing is trapped in Sparkbench.
5. **Safe by default.** Mains voltage, LiPo batteries and high current are flagged and either designed safely or refused with an explanation.
6. **Undo everything; the AI explains every change.**

## The end-to-end journey (the "golden path")

```
 1 Describe  ─▶ 2 Clarify ─▶ 3 Design ─▶ 4 Simulate ─▶ 5 Prototype ─▶ 6 Verify ─▶ 7 Board ─▶ 8 Enclosure ─▶ 9 Order ─▶ 10 Bring-up ─▶ 11 Share
   words         questions    parts &     firmware +    breadboard     photo +     PCB layout   3D-printed     factory     first power     blog, remix,
                              wiring      circuit       hole by hole   self-test   & routing    case           files       & test          gallery
```

### Journey 1: Sam builds a first project ("a plant that tells me when it's thirsty")
1. Sam types the idea. Sparkbench asks 2–3 multiple-choice questions: battery or USB? Show it on a screen or a light? Wi-Fi notifications?
2. It shows a picture of the finished thing, a parts list with a price, and what Sam will learn. Sam clicks **Build it**.
3. The simulator runs. Sam drags the "soil moisture" slider and the screen says "Water me!"
4. Sam orders the kit with one click: an exact cart at a distributor.
5. The kit arrives. The breadboard view shows one step at a time ("Push the red wire into hole j12"), with a picture of each step.
6. Sam takes a photo after each stage. Sparkbench says "the LED is backwards: turn it around".
7. Sam plugs in USB. Sparkbench flashes the firmware from the browser and runs a self-test: "Press the button… ✓. Touch the sensor… ✓. Everything works!"
8. Sparkbench writes a blog post with Sam's photos; Sam shares it.

### Journey 2: Priya makes a product ("make it a real thing I can sell 50 of")
1. Priya starts from her working prototype and clicks **Make it a product**.
2. Sparkbench asks:
   - **Size:** about the size of a matchbox, or credit card?
   - **Power:** battery life target? Rechargeable?
   - **Quantity:** 5, 50, or 500?
3. It swaps the hobby modules for chips on the board: a bare ESP32-C3 module, an on-board charger, a USB-C connector and a sensor footprint. It explains each swap and its cost.
4. It re-runs the simulation and the design rules for the new circuit.
5. **PCB layout:**
   - It places the parts sensibly: connectors on the edges, the antenna clear of copper, decoupling capacitors next to their chips.
   - It routes the board automatically and runs DRC with the chosen factory's rules.
   - It shows a 3D view of the board.
6. **Enclosure:** it generates a 3D-printable case with openings for USB, the button and the screen, plus mounting posts. The case is checked against the board's 3D model.
7. **Order:**
   - It exports Gerbers, drill files, the BOM and pick-and-place (CPL) files in JLCPCB/PCBWay format.
   - It shows a live quote ("50 assembled boards: $4.80 each, 12 days") and flags any part that is out of stock, with an in-stock substitute.
8. **Bring-up:** when the boards arrive, a test checklist and test firmware confirm each board works. Sparkbench also produces an FCC/CE pre-compliance checklist.

### Journey 3: Leo and Ms. Ortiz in class
1. The teacher creates an assignment, "traffic light with a pedestrian button", with a rubric.
2. Students design, simulate and build it, then submit a photo plus a self-test run.
3. Sparkbench pre-grades: wiring matches, code works, explanation questions answered. The teacher reviews the exceptions.

### Journey 4: Dana takes it to KiCad and back
1. Dana exports the KiCad project, moves the parts by hand and changes the routing.
2. Dana re-imports it. Sparkbench keeps Dana's placement, re-checks the design rules and continues: firmware, docs, ordering.

### Journey 5: "It doesn't work", AI debugging
1. The user says "my screen stays black".
2. Sparkbench asks for a photo and reads the serial log from the board over USB.
3. It runs an I2C scan on the real hardware: "no device at 0x3C".
4. Diagnosis: "SDA and SCL are swapped: move the blue wire from j21 to j22." The user fixes it and the self-test passes.

## Feature areas and user stories

### A. Understanding what the user wants
- ✅ A1 Describe a project in plain words and get a working design.
- ✅ A2 **Clarifying questions**: when the idea is ambiguous, up to 3 multiple-choice questions (suggested answer first) before designing. *Tested live: "a little gadget for my desk that keeps me company" asked about personality, internet and power, and the chosen answer shaped the design (`tests/e2e/ai-clarify.mjs`).*
- ✅ A3 **Requirements card**: "What it will do / Power / Size / Budget" with every design, editable ("Not quite right? Change it" re-designs). Offline designs derive it from the circuit.
- ✅ A4 **Acceptance tests from intent**: Claude turns the request into executable tests (set sensors, press buttons, read the screen by OCR, LEDs, buzzer, servo, serial). They run in the simulator, and if the code fails them Claude fixes it (two rounds). *Tested live: the plant-watering request produced "When the soil is dry, the screen says WATER ME and the red LED lights", 5/5 passing (`tests/e2e/ai-intent.mjs`).*
- ✅ A5 Change the design by chatting ("add a buzzer", "use a Pico instead").
- ✅ A6 Start from a photo or sketch (📎 on the Welcome screen and in the chat). *Tested live: a hand sketch alone produced an ESP32 + OLED + DHT22 + 2 buttons + buzzer with the alarm behaviour (`tests/e2e/sketch-design.mjs`).*

### B. Design
- ✅ B1 Automatic part choice, pin assignment, resistors, level shifting and I2C/SPI bus sharing.
- ✅ B2 Any component via its datasheet: the AI extracts pins and limits, writes a driver, and saves a reusable skill.
- ✅ B3 Power design (Power and batteries card):
  - current measured by running the firmware in the simulator, per part;
  - battery life for each battery type over the hours of use per day;
  - the regulator or charger each battery needs (HT7333/MCP1700, TP4056+DW01), reverse-polarity and ESD/fuse protection, and a deep-sleep estimate.
- ✅ B4 **Product version** ("Circuit board → Product"):
  - the ESP32 DevKit becomes a bare ESP32-WROOM-32E with Micro-USB, an AMS1117, a CH340C, auto-reset transistors and RESET/BOOT buttons;
  - the Pico is soldered by its castellated pads;
  - passives and chips become 0805/SOIC parts the factory assembles;
  - modules stay on connectors.

  *Tested: all 19 examples pass design checks in the product version; the ESP32 weather station routes DRC-clean with the USB socket flush on the edge (`tests/e2e/pcb-product.mjs`).*
- ✅ B5 Safety: mains wording in a request triggers a clear warning with safe alternatives, relay builds are told "low voltage only", a motor on a GPIO is an error, and the AI is instructed to refuse direct-mains and dangerous designs (`tests/unit/safety.test.ts`).
- ✅ B6 Electrical rule checks with beginner explanations, plus KiCad ERC.

### C. Simulation
- ✅ C1 Firmware (MicroPython) and circuit (MNA solver) simulated together in the browser.
- ✅ C2 Interactive inputs (sliders, buttons, tilt) and live outputs (screens, LEDs, sound, plots).
- ✅ C3 Internet simulation (weather APIs, NTP).
- ✅ C4 SPICE export with an ngspice cross-check.
- ✅ C5 Acceptance tests run after every change (Tests tab with a ✓/✗ badge), add a test in plain words, "Fix the code with AI".
- ✅ C6 Battery life from a 30-second simulated run of the real firmware, scaled to hours of use per day.
- ✅ C7 Arduino/C++ version: Claude translates the program, the real `arduino-cli` compiles it for the ESP32 / Pico, and compiler errors go back to Claude. A PlatformIO project is included. *Tested: the Pico traffic light, ESP32 weather station and ESP32 internet e-paper station all compile (`tests/e2e/arduino.mjs`).*

### D. Code
- ✅ D1 The AI writes and edits firmware and verifies it in the simulator before proposing it.
- ✅ D2 Code editor with an inline AI assistant ("Fix with AI" on errors).
- ✅ D3 Hover any line: a plain-English explanation that names the part on its pin ("pin 13 is Button A"), plus "Explain with AI" (`tests/unit/explain.test.ts`, `tests/e2e/explain.mjs`).
- ✅ D4 Over-the-air updates for ESP32: `ota.py` (token-protected) and `boot.py` installed over USB once, then "Send the program over Wi-Fi". *Tested against the real MicroPython (`tests/unit/ota.test.ts`, `tests/e2e/ota.mjs`).*

### E. Prototype build (breadboard)
- ✅ E1 Build guide, wiring table and blog post.
- ✅ E2 **Exact breadboard layout** for every project: every leg and jumper in a named hole, verified net-for-net against the schematic.
- ✅ E3 Step-by-step build mode: one step per screen, a picture of each step, progress saved.
- ✅ E4 Live stock and prices from LCSC/JLCPCB for every part they sell, a one-file LCSC cart (upload at lcsc.com/bom), and store links for boards and modules. *A true one-click cart at DigiKey or Mouser needs their partner APIs and an account.*
- ✅ E5 An illustrated "What you'll need" list (breadboard size, number of male-male and male-female jumpers, the right USB cable, tools).

### F. Verify the real thing
- ✅ F1 Photo wiring check: Claude compares a photo with the design, lists fixes, and says what it couldn't see.
- ✅ F2 The photo check uses the exact hole-by-hole layout. In our eval this raised correct localisation from 52% to 86%.
- ✅ F3 **Your board**: connect over Web Serial, install MicroPython (esptool-js for ESP32; the Pico UF2 written onto its drive), copy the program, serial monitor. *The protocol is tested against the real MicroPython (`tests/unit/rawrepl.test.ts`) and the UI against a simulated USB board (`tests/e2e/board.mjs`). Flashing an actual chip still needs a person with a board to try it.*
- ✅ F4 Self-test firmware (`selftest.py`): I2C scan, plausible sensor readings, "press each button", look-checks for outputs, with the simulator's output alongside for comparison. *It passes on all 16 board examples in the simulator, and pinpoints a swapped SDA/SCL (`tests/sim/selftest.test.ts`).*
- ✅ F5 "Ask AI what is wrong": combines the symptom, live serial log, self-test output, the simulator's expected output, the layout and the code. *Live test: it correctly reasoned about a missing OLED from the layout.*
- ✅ F6 Guided multimeter checks: the probe hole from the layout and the expected voltage from the circuit solver, including ranges for signals that swing (555).

### G. Product: PCB
- ✅ G1 KiCad schematic, netlist and footprint library export, all verified with KiCad's own tools.
- ✅ G2 **Auto-placement**:
  - connectors for off-board parts pulled to the edge;
  - the dev board's USB end at the board edge with a free corridor, and the ESP32 antenna keep-out;
  - plug-in module bodies reserved (they overhang their sockets), USB sockets flush on the edge in the product version;
  - mounting holes.
- ✅ G3 **Auto-routing** (Freerouting) with sensible trace widths for power, plus a ground pour.
- ✅ G4 **DRC and schematic parity** against the chosen factory's rules (JLCPCB / PCBWay / OSH Park), explained in plain words.
- ✅ G5 3D board view (KiCad render / STEP).
- ✅ G6 "Arrange the parts myself": drag or rotate parts (overlaps shown in red), then re-route with exactly those positions (`tests/e2e/board-editor.mjs`).
- ✅ G7 Silkscreen: pin names beside every socket, module outlines, the logo, project name, revision, and an optional QR code to your build page.

### H. Product: enclosure
- ✅ H1 A case generated from the routed board (JSCAD):
  - standoffs on the mounting holes, the USB opening where the USB actually is;
  - button holes with printed caps, LED windows, screen windows, sensor vents, ultrasonic eyes, cable slots.
- ✅ H2 Styles (rounded, minimal, wall-mount with keyholes, desk stand) with a three.js 3D preview (open/closed lid).
- ✅ H3 STL for printing and STEP for CAD (verified readable by OpenCascade, `tests/kicad/step.test.ts`), plus JLC3DP and Craftcloud print links.

### I. Manufacture and order
- ✅ I1 **Fab package**:
  - Gerbers and drill files;
  - BOM with live LCSC part numbers, including the sockets for plug-in boards;
  - CPL;
  - assembly drawing PDF;
  - TEST.md, a bring-up test procedure with the expected self-test output;
  - the full KiCad project.
- ✅ I2 Live part costs at 5 / 50 / 500 boards from LCSC prices, with in-stock alternatives picked automatically. The bare-board price comes from the maker's own quote page (linked), because PCB makers don't publish a quoting API.
- ✅ I3 Design-for-manufacture notes:
  - board size class, parts not at LCSC, low stock for 50 boards;
  - basic vs extended parts, hand-solder vs factory assembly;
  - V-scored 2×2 / 3×3 panels (KiKit), DRC-checked (`tests/e2e/pcb-panel.mjs`).
- ✅ I4 COMPLIANCE.md: an FCC/CE/RoHS checklist tailored to the design (radio module, mains relay, batteries) and a labels/markings template.
- ✅ I5 Revisions: release Rev A, B… with a note. The change list since the last release is computed (parts, values, wiring, program), and the revision is printed on the board (`tests/unit/revisions.test.ts`).

### J. Learning, sharing and teamwork
- ✅ J1 Blog post, glossary tooltips and beginner explanations.
- ✅ J2 Gallery on this Sparkbench server: publish, like, open a copy (remix) that credits the original.
- ✅ J3 Classes:
  - a teacher writes requirements in plain words; students join with a code and hand in;
  - each requirement is graded by a test Claude writes for that student's design and the simulator runs. Grading is strict: a night light handed in for a traffic-light assignment scores 2/4;
  - teacher dashboard (`tests/e2e/community.mjs`, `tests/e2e/grading.mts`).
- ✅ J4 Live co-editing via a shared link (presence, last-writer-wins with notice, no echo loops) and comments on parts.

### K. Trust and quality (always on)
- ✅ K1 Every example is built end to end in CI (simulation, KiCad ERC, ngspice).
- ✅ K2 Measured AI quality ([EVALS.md](EVALS.md)): vision, design, code and PCB evals.
- ✅ K3 Every slow or AI action says how long it takes and what it uses (your Claude Code plan or API key, or local and free).

## Manufacture-ready output package (definition of done for Journey 2)

What Sparkbench produces today (Export → Everything, plus Circuit board → All board files):

```
my-plant-monitor/
  firmware/      main.py + drivers, selftest.py, (ota.py, boot.py, secrets.py when Wi-Fi updates are on)
  arduino/       <name>/<name>.ino, src/main.cpp, platformio.ini      (compiled for the board)
  hardware/      KiCad schematic/project/netlist/footprints, SPICE netlist
  schematic.svg  breadboard.svg  bom.csv  BUILD.md  BLOG.md  project.sparkbench.json
  <name>-board/
    <name>.kicad_pro/.kicad_sch/.kicad_pcb/.kicad_dru                 editable in KiCad
    fab/gerbers/*  fab/bom-jlcpcb.csv  fab/cpl-jlcpcb.csv  fab/positions.csv  fab/assembly.pdf  fab/sourcing.json
    fab/panel/     <name>-panel.kicad_pcb, gerbers/*, panel-top.png    (when a panel is chosen)
    board.step  board-top.png  board-bottom.png  board.svg  drc.json
    TEST.md  COMPLIANCE.md
    enclosure/<style>/  case-base.stl/.step  case-lid.stl/.step  button-cap-*.stl  desk-stand.stl  CASE.md
```

## What still needs the real world

- Flashing and self-testing an actual ESP32/Pico through the browser: the protocol, installers and UI are tested against real MicroPython and a simulated USB board, but no physical chip has been flashed yet.
- Ordering a real board and case: every file is checked by KiCad/OpenCascade/KiKit, but nobody has held the result.
- Photo checks on real (not rendered) breadboard photos.
- Live board-fabrication prices: makers don't offer a public quoting API; parts prices are live.
