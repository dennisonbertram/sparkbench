---
name: part-piezo-vibration-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the analog piezo disk vibration sensor module (DFRobot Gravity DFR0052, piezo disc + 1 MΩ + 5.1 V zener). Use when designing, wiring, simulating or writing code for a piezo vibration / knock sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Piezo vibration sensor module (DFRobot DFR0052)

## Overview
The **DFRobot Gravity: Analog Piezo Disk Vibration Sensor (DFR0052, "Piezo Disk Vibration Sensor V2")** is a 20 mm brass piezo disc (FT-20T-6.5A) on a short lead, screwed into a small board with a 3-pin Gravity connector. The board is **passive**: the disc sits in parallel with a **1 MΩ resistor** and a **5.1 V zener diode** between the Analog pin and GND (DFRobot schematic rev 2.0). The middle pin is not connected, so the module needs **no supply**.
- At rest the 1 MΩ resistor holds Analog at **0 V**.
- A knock, tap or vibration bends the disc and it produces a **short voltage spike**: the harder the hit, the higher the spike, up to about **5.1 V** where the zener clamps it (about −0.7 V in the other direction).
- It detects knocks, taps, footsteps and vibration strength. It is not a calibrated accelerometer.

## Pinout (Gravity connector, as on the DFRobot pinout drawing)
| Pin | Name | Function |
|-----|------|----------|
| 1 | Analog | Piezo output, 0 V at rest, spikes on vibration |
| 2 | NC | Not connected (the Gravity cable's red VCC wire goes nowhere) |
| 3 | GND | Ground |

## Electrical limits
- No supply needed (DFRobot: "not necessary to power the module"; < 1 mA).
- Analog can reach **5.1 V** on a hard hit. That is above the 3.3 V limit of ESP32, Pico and Raspberry Pi ADC pins. For hard impacts put a **10 kΩ resistor in series** with Analog so the pin's protection diodes see only a small current, or tap gently.
- Piezo element: max input 30 Vp-p, resonance 6.5 kHz, 15 nF, −20 to 70 °C.

## Interface details
- Plain analog voltage: V = ADC reading × 3.3 / 65535 (`read_u16`), or `read_uv()` on the ESP32.
- The spikes are only milliseconds long, so one ADC reading usually misses them. Sample quickly for a window (e.g. 50 ms) and keep the **peak** (`peak()` in the driver). A peak above about 0.5 V is a clear knock.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Analog | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115) |
| NC | leave unconnected | leave unconnected | leave unconnected |
| GND | GND | GND | GND (pin 6) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from piezo_vibration import PiezoVibration
import time
s = PiezoVibration(34)          # Analog GPIO
while True:
    p = s.peak(50)              # highest voltage in 50 ms
    print('Peak=%.1fV %s' % (p, 'knock' if p > 0.5 else 'quiet'))
    time.sleep_ms(200)
```

## Gotchas
- **Single readings read 0 V**: the pulse is over before you sample. Use `peak()`.
- **Up to 5.1 V on the pin** on a hard hit: add a 10 kΩ series resistor for a 3.3 V board.
- **Mount the disc firmly** (tape or glue it flat to the surface); a loose disc on its wires picks up little.
- The red wire of a Gravity cable goes to NC: it is fine to leave it plugged in, nothing is powered.


## On a 3.3 V board
- **Analog** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 100 kΩ from Analog to the pin, 200 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.5 (the driver's `divider` / `div` argument does this).

## Datasheet
Schematic: https://dfimg.dfrobot.com/wiki/17157/DFR0052_digital-piezo-disk-vibration-sensor_schematics_v1.0.pdf. Piezo element: https://dfimg.dfrobot.com/wiki/17157/DFR0052_digital-piezo-disk-vibration-sensor_datasheet_v1.0.pdf. Wiki: https://wiki.dfrobot.com/dfr0052/
