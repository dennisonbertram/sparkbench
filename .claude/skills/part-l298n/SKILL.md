---
name: part-l298n
description: Pinout, electrical limits, wiring and MicroPython driver for the L298N dual H-bridge motor driver module (ST L298N). Use when designing, wiring, simulating or writing code for an L298N in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# L298N dual H-bridge motor driver (L298N)

## Overview
The **L298** from ST is a dual full-bridge driver: two independent H-bridges, each able to run a DC motor forwards, backwards, braked or coasting at up to 2 A continuous (or one bipolar stepper using both). Its inputs are TTL-level, so 3.3 V GPIOs drive it directly. Hobbyists buy it as the red **L298N dual H-bridge motor driver module** (43 × 43 mm, heatsink, 78M05 5 V regulator, e.g. Handson Technology MDU-1049).

## Pinout (module, going round the board)
| Pin | Function |
|---|---|
| OUT1, OUT2 | Motor A screw terminal |
| +12V | Motor supply VS, 5–35 V on the module (chip max 46 V) |
| GND | Ground: motor supply minus AND the microcontroller GND |
| +5V | Logic supply VSS (4.5–7 V): regulator output with the 5V-EN jumper fitted, otherwise a 5 V input |
| ENA | Enable bridge A, high = on; PWM for speed (jumpered to 5 V on delivery) |
| IN1, IN2 | Bridge A inputs |
| IN3, IN4 | Bridge B inputs |
| ENB | Enable bridge B (jumpered to 5 V on delivery) |
| OUT3, OUT4 | Motor B screw terminal |

## Electrical limits
- VS (+12V): VIH + 2.5 V (about 4.8 V) up to 46 V on the chip; the module's 35 V capacitors limit it to **5–35 V**.
- VSS (+5V): 4.5–7 V (absolute max 7 V). Never connect it to a 3V3 pin.
- Inputs/enables: low ≤ 1.5 V, high ≥ 2.3 V (up to VSS).
- Output current: 2 A DC per bridge, 2.5 A repetitive, 3 A for 100 µs.
- Voltage drop across the bridge: 1.8–3.2 V at 1 A, up to 4.9 V at 2 A.
- Logic current: up to 36 mA; PWM up to 25 kHz typical (40 kHz max).

## Interface details (datasheet truth table)
| EN | IN1 | IN2 | Motor A |
|---|---|---|---|
| H | H | L | Forward |
| H | L | H | Reverse |
| H | IN1 = IN2 | | Fast stop (brake) |
| L | X | X | Coasts to a stop |
Bridge B is the same with ENB, IN3, IN4. Drive EN low before switching the supply on or off.

## Wiring
- Power: battery + → +12V, battery − → GND, and GND → board GND. With the 5V-EN jumper fitted (motor supply about 7–12 V) the +5V terminal gives out 5 V; leave it unconnected or use it to power a 5 V board. Above 12 V, or below 7 V, remove the jumper and feed 5 V into +5V.
- ESP32: IN1 → D25, IN2 → D26 (IN3/IN4 to any other output pins; ENA/ENB to PWM pins if you remove the jumpers).
- Pico: IN1 → GP2, IN2 → GP3.
- Raspberry Pi 4: IN1 → GPIO17 (pin 11), IN2 → GPIO27 (pin 13).

## Using the driver
```python
from l298n import L298N
a = L298N(25, 26)            # IN1, IN2; ENA jumper fitted = full speed
b = L298N(27, 14, en=12)     # IN3, IN4, ENB on a PWM pin (jumper removed)
a.forward(); b.reverse(60)   # speed in % needs the EN pin
a.brake(); b.coast()
```

## Gotchas
- No common ground = motors twitch randomly or not at all.
- The bridge eats 2–3 V: a 6 V motor on a 6 V supply runs slowly. Budget for the drop.
- USB 5 V can only run very small motors; motor start-up current can brown out and reset the microcontroller. Use a separate battery.
- Brake (IN1 = IN2) shorts the motor through the bridge; keep the current under 2 A.
- Big heatsink, still gets hot near 2 A. For small 3–6 V motors a MOSFET driver (TB6612FNG, DRV8833) wastes far less power.

## Datasheet
https://www.st.com/resource/en/datasheet/l298.pdf
