---
name: part-pcf8591
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF8591 8-bit 4-input ADC / 1-output DAC (YL-40 module). Use when designing, wiring, simulating or writing code for a PCF8591 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF8591 8-bit ADC/DAC module (PCF8591)

## Overview
The NXP **PCF8591** is an 8-bit successive-approximation ADC with four analog inputs (single-ended or differential) plus one 8-bit DAC output, all on I2C. Hobbyists buy it as the **YL-40 "PCF8591 AD/DA converter module"**, which adds an LDR, a thermistor and a 10 kΩ potentiometer (each connected through a removable jumper), a power LED, an LED on AOUT, and 10 kΩ pull-ups on SDA/SCL. A0–A2 are grounded, so the address is fixed at 0x48. VREF is tied to VCC, so readings are ratiometric to the supply.

## Pinout (YL-40, header by header)
| Pin | Function |
|---|---|
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |
| GND | Ground |
| VCC | Supply 2.5–6 V, also the converter reference |
| AOUT | DAC output, 0 V … VREF × 255/256 |
| AIN0 | Analog input 0 (LDR via jumper P5) |
| AIN1 | Analog input 1 (thermistor via jumper P4) |
| AIN2 | Analog input 2 (free) |
| AIN3 | Analog input 3 (potentiometer via jumper P6) |

The two headers sit on opposite edges, so the module is wired with jumper leads.

## Electrical limits
- Supply: 2.5–6.0 V. Use 3.3 V with a 3.3 V microcontroller (the on-board pull-ups go to VCC).
- Current: about 0.125 mA operating with AOUT off, up to 1 mA with AOUT on.
- Analog inputs must stay between GND and VCC.
- I2C up to 100 kHz (standard mode).

## Interface details
- **I2C address 0x48** (fixed on the YL-40).
- Control byte: bit 6 = AOUT enable, bits 5–4 = input mode (00 = four single-ended), bit 2 = auto-increment, bits 1–0 = channel.
- A conversion starts with every read; the **first byte of a read is the previous cycle's result** (0x80 after power-on). Write the control byte, read 2 bytes, keep the second.
- Single-ended: code = Vin / Vlsb, Vlsb = VREF / 256 (VREF = VCC on the YL-40). Volts = code × VCC / 256.
- DAC: write control byte (bit 6 set) followed by a data byte; AOUT = data / 256 × VREF.
- Auto-increment (control 0x44): after the stale first byte, reads return AIN0, AIN1, AIN2, AIN3 in turn. Keep bit 6 set in this mode so the oscillator keeps running.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from pcf8591 import PCF8591
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = PCF8591(i2c, vref=3.3)   # vref = the module's VCC
print(adc.read(3), adc.read_voltage(0))   # pot code, AIN0 volts
adc.write_dac(128)                         # AOUT ≈ VCC / 2
```

## Gotchas
- Forgetting the stale first byte makes every reading one step behind (and shows the previous channel).
- Remove jumpers P4/P5/P6 before connecting your own signal to AIN1/AIN0/AIN3, or the on-board part fights it.
- Some YL-40 boards have a broken ground on the thermistor, so AIN1 always reads 255.
- Powering the module from 5 V with a 3.3 V board pulls SDA/SCL up to 5 V through the on-board resistors: power it from 3.3 V.
- In Sparkbench the sliders set each AIN voltage with a 3.3 V supply; AOUT is not simulated.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCF8591.pdf
