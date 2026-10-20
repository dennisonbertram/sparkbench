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
- 🟡 A2 **Clarifying questions**: when the idea is ambiguous (power source, size, connectivity), ask up to 3 multiple-choice questions rather than guessing.
- ⬜ A3 **Requirements card**: before designing, show "What it will do / How you'll power it / Roughly how big / Budget" for the user to confirm or edit.
- ⬜ A4 **Acceptance tests from intent**: "when soil is dry the screen says Water me" becomes an executable test, run in the simulator and later on the real board.
- ✅ A5 Change the design by chatting ("add a buzzer", "use a Pico instead").
- ⬜ A6 Start from a photo or sketch of an existing gadget ("make something like this").

### B. Design
- ✅ B1 Automatic part choice, pin assignment, resistors, level shifting and I2C/SPI bus sharing.
- ✅ B2 Any component via its datasheet: the AI extracts pins and limits, writes a driver, and saves a reusable skill.
- 🟡 B3 Power design: power budget, battery-life estimate, regulator and charger selection, reverse-polarity and ESD protection.
- ⬜ B4 **Two parts libraries**: prototyping modules (breakout boards) for the breadboard, and production parts (bare chips plus their support circuitry) for the PCB, with automatic mapping between them.
- ⬜ B5 Safety rules: mains, LiPo and motor current are flagged; enforced fuses and isolation, or a refusal with an explanation.
- ✅ B6 Electrical rule checks with beginner explanations, plus KiCad ERC.

### C. Simulation
- ✅ C1 Firmware (MicroPython) and circuit (MNA solver) simulated together in the browser.
- ✅ C2 Interactive inputs (sliders, buttons, tilt) and live outputs (screens, LEDs, sound, plots).
- ✅ C3 Internet simulation (weather APIs, NTP).
- ✅ C4 SPICE export with an ngspice cross-check.
- ⬜ C5 Acceptance tests (A4) run automatically on every change, with a green/red badge.
- ⬜ C6 Battery-life simulation over a day of use.
- ⬜ C7 Arduino/C++ (and PlatformIO) firmware as well as MicroPython.

### D. Code
- ✅ D1 The AI writes and edits firmware and verifies it in the simulator before proposing it.
- ✅ D2 Code editor with an inline AI assistant ("Fix with AI" on errors).
- ⬜ D3 Explain any line in plain words on hover.
- ⬜ D4 OTA updates for Wi-Fi boards.

### E. Prototype build (breadboard)
- ✅ E1 Build guide, wiring table and blog post.
- ✅ E2 **Exact breadboard layout** for every project: every leg and jumper in a named hole, verified net-for-net against the schematic.
- ✅ E3 Step-by-step build mode: one step per screen, a picture of each step, progress saved.
- ⬜ E4 One-click kit cart at a distributor (DigiKey, Mouser, Adafruit, AliExpress), with live price and stock.
- ⬜ E5 A "what you'll need" tools list (USB cable type, wire strippers…) with pictures.

### F. Verify the real thing
- ✅ F1 Photo wiring check: Claude compares a photo with the design, lists fixes, and says what it couldn't see.
- ✅ F2 The photo check uses the exact hole-by-hole layout. In our eval this raised correct localisation from 52% to 86%.
- ⬜ F3 **Flash from the browser** (WebSerial / esptool-js / Pico UF2) with no installs.
- ⬜ F4 **Self-test firmware**: an I2C scan, "press each button", "watch the LED blink", sensor readings within plausible ranges, all compared with the simulator.
- ⬜ F5 AI debugging that combines the serial log, photos, the self-test result and the schematic.
- ⬜ F6 Measure with a multimeter, guided ("touch the red probe to hole j12: you should see about 3.3 V").

### G. Product: PCB
- ✅ G1 KiCad schematic, netlist and footprint library export, all verified with KiCad's own tools.
- 🟡 G2 **Auto-placement** (built: compact wirelength-driven placement, outline, mounting holes; not yet: edge connectors, antenna keep-out, decoupling-cap proximity rules):
  - board outline sized to the parts and the enclosure;
  - connectors on the edges, mounting holes, antenna keep-out;
  - decoupling capacitors placed next to their chips.
- ✅ G3 **Auto-routing** (Freerouting) with sensible trace widths for power, plus a ground pour.
- 🟡 G4 **DRC** with the chosen factory's rules (JLCPCB/PCBWay/OSH Park), explained in plain words.
- ✅ G5 3D board view (KiCad render / STEP).
- ⬜ G6 Manual nudge: drag parts on the board and the AI re-routes.
- ⬜ G7 Silkscreen with labels, the logo, the project name and a QR code to the build page.

### H. Product: enclosure
- ⬜ H1 A parametric case (OpenSCAD/CadQuery) generated from the board's 3D model: openings, standoffs, button caps, a screen window.
- ⬜ H2 Style choices (rounded, minimal, wall-mount, desk-stand) and 3D preview.
- ⬜ H3 STL/STEP export, and an order link for a 3D-printing service.

### I. Manufacture and order
- 🟡 I1 **Fab package** (built: Gerbers, drill, BOM, CPL, KiCad project, STEP; not yet: LCSC part numbers, assembly drawing, test procedure):
  - Gerbers and drill files;
  - BOM with LCSC/DigiKey part numbers;
  - pick-and-place (CPL);
  - assembly drawing;
  - a test procedure.
- ⬜ I2 Live quote for prototype and production quantities, with alternatives for out-of-stock parts.
- ⬜ I3 Design-for-manufacture checks: parts available at the assembler, basic vs extended parts, panelisation.
- ⬜ I4 Compliance pre-check list (FCC/CE/RoHS) and a labels/markings template.
- ⬜ I5 Version and revision tracking (Rev A → Rev B, what changed and why).

### J. Learning, sharing and teamwork
- ✅ J1 Blog post, glossary tooltips and beginner explanations.
- ⬜ J2 Gallery: publish, remix and fork other people's projects.
- ⬜ J3 Classroom: assignments, rubric, photo and self-test submission, teacher dashboard.
- ⬜ J4 Real-time collaboration and comments on parts or wires.

### K. Trust and quality (always on)
- ✅ K1 Every example is built end to end in CI (simulation, KiCad ERC, ngspice).
- 🟡 K2 Measured AI quality:
  - done: the vision eval;
  - planned: a design eval (does the AI's design meet the intent?);
  - planned: a code eval (simulator-verified pass rate);
  - planned: a PCB eval (DRC-clean rate).
- ⬜ K3 A cost and time estimate before anything slow or paid.

## Manufacture-ready output package (definition of done for Journey 2)

```
my-plant-monitor/
  firmware/              main.py (or PlatformIO project) + drivers + self-test
  hardware/
    *.kicad_sch *.kicad_pcb *.kicad_pro     editable in KiCad
    fab/gerbers/*.gbr  fab/drill.drl        → upload to the PCB fab
    fab/bom-lcsc.csv   fab/cpl.csv          → PCB assembly (PCBA)
    3d/board.step      3d/board.png
    sim/*.cir                               ngspice
  enclosure/  case.scad  case.stl  case.step
  docs/  BUILD.md  TEST.md  BLOG.md  schematic.pdf  assembly.pdf  compliance-checklist.md
  quote.json                                factory, quantity, price, lead time
```

## Build order (each step stands on its own)

1. ✅ **E2/F2:** exact breadboard layout, and the photo check using it.
2. ✅ (first version) **G2–G5 + I1: the PCB.** Open-source tools do the heavy lifting:
   - Sparkbench writes the `.kicad_pcb` with auto-placement and a ground pour;
   - [Freerouting](https://github.com/freerouting/freerouting) routes the board;
   - `kicad-cli` produces DRC, Gerbers, drill files, the 3D render and STEP;
   - Sparkbench writes the JLCPCB BOM and CPL files.

   This is the "lay out the chips" feature.
3. **F3/F4:** browser flashing plus the self-test.
4. **B4:** production parts (bare chips) for the PCB.
5. **H1:** the enclosure.
6. **A2–A4/C5:** clarifying questions and acceptance tests.
7. **I2/E4:** live quotes and carts. These need distributor API keys.
8. **J2/J3:** gallery and classroom.
