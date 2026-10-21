# Evals

How well the AI and the board pipeline do when nobody is checking their work. Each eval has a
script you can re-run, and the results are written to `test-results/`. Last full run: 2026-10-20.

| eval | what it measures | result |
|---|---|---|
| Photo check (vision) | Claude finds wiring mistakes in breadboard photos | 85% of faults found, 78% pinpointed, 10% false alarms (with the hole-by-hole plan: 86% / 86% / 0% on phone photos) |
| Design | A plain-English request becomes a working design | 8 of 8 pass hidden tests |
| Code change | A change request on a working project gives the asked-for behaviour | 6 of 6 pass hidden tests |
| Circuit board, prototype | Every example becomes a routed board with dev-board sockets | 19 of 19 with 0 DRC errors, 0 unconnected |
| Circuit board, product | Every example becomes a board with the chips placed directly on it | 19 of 19 with 0 DRC errors, 0 unconnected |

## Photo check

Details and per-fault tables: [VISION-EVAL.md](VISION-EVAL.md). Run with `npx tsx scripts/vision-eval/run.ts`.

## Design

`npx tsx scripts/evals/design-eval.mts` writes `test-results/evals/design.json`.

Each request goes to the full design pipeline: Claude designs it, writes its own tests and repairs the
design in the simulator. The eval then checks the design independently:
- it contains the parts the request needs;
- the design checks find no errors;
- **hidden** behaviour tests, written in the eval script, pass in the simulator. Claude never sees these tests.

| request | hidden tests | Claude's own tests | time |
|---|---|---|---|
| Pico blinks a red LED once a second | pass | 4/4 | 35 s |
| ESP32 thermometer on an OLED | pass | 5/6 | 88 s |
| Doorbell: button beeps a buzzer | pass | 4/4 | 44 s |
| Pico plant monitor: dry soil lights a red LED | pass (2 tests) | 3/4 | 121 s |
| Parking sensor beeps under 20 cm | pass | 5/5 | 54 s |
| Night light turns on in the dark | pass | 4/4 | 46 s |
| Servo follows a knob | pass | 5/5 | 40 s |
| 555 blinker, no microcontroller | pass | 1/1 | 11 s |

All 8 designs passed the hidden tests. Claude's own tests passed 31 of 33. Its two failures were
stricter than the request (exact screen layout, an exact timing), and the design still did what was
asked.

## Code change

`npx tsx scripts/evals/code-eval.mts` writes `test-results/evals/code.json`.

A built-in example gets a change request in the code editor's AI chat. A hidden test then decides
pass or fail.

| example | request | result | time |
|---|---|---|---|
| pico-traffic-light | print the colour name on every change | pass | 18 s |
| esp32-weather-imu | show Fahrenheit instead of Celsius | pass | 33 s |
| pico-night-light | fully off above 500 lux, no dimming | pass | 30 s |
| esp32-parking-sensor | print "Distance: 42 cm" | pass | 22 s |
| pico-servo-dial | reverse the servo | pass | 20 s |
| esp32-motion-alarm | print INTRUDER on motion | pass | 22 s |

None of the six edits crashed in the simulator, so no repair rounds were needed.

## Circuit boards

`npx tsx scripts/make-pcb.ts --all` builds the prototype version, and `--all --product` the product
version. Logs are in `test-results/pcb-all.log` and `test-results/pcb-product-all.log`.

Each board is placed, routed by Freerouting and then checked by KiCad 10's DRC with schematic parity.
To count as a pass, a board needs 0 errors and 0 unconnected nets. Warnings are silkscreen notes,
such as text near the board edge.

- **Prototype (19/19):** boards from 35×94 mm to 104×45 mm, with 0 to 1 vias.
- **Product (19/19):** ESP32-WROOM modules, USB-C/micro-USB with a 3.3 V regulator, and the parts
  soldered directly to the board. The first run had one failure: `esp32-tilt-game` had a 0.1989 mm gap
  against a 0.2 mm rule. Freerouting now routes with a 0.22 mm margin. The full rebuild after the new-user review fixes passes 19/19 for both versions on the first try.

## What these evals don't cover

- Real-world assembly: nobody has ordered these boards and soldered them yet.
- The sample is small (8 designs, 6 code changes), so expect occasional failures that these runs didn't show.
- Each design and code eval was run once. Response times vary a lot between runs.
