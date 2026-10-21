---
name: part-bme688
description: Pinout, electrical limits, wiring and MicroPython driver for the BME688 gas, temperature, humidity & pressure sensor (Bosch BME688, Adafruit #5046 breakout). Use when designing, wiring, simulating or writing code for a BME688 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BME688 gas, temperature, humidity & pressure sensor (BME688)

## Overview
The **Bosch BME688** combines temperature (−40 to 85 °C, ±0.5 °C), relative humidity (0–100 %, ±3 %), barometric pressure (300–1100 hPa, ±0.6 hPa) and a heated metal-oxide **gas sensor**. It is the successor of the BME680. Its gas sensor can run scans of up to 10 heater temperatures, which Bosch's BSEC/AI Studio tools use to tell gases apart. Read on its own, the gas resistance drops when VOCs (fumes, solvents, stale breath) are in the air. That makes it a relative air-quality indicator, not a calibrated ppm reading. Hobbyists usually buy it on the **Adafruit BME688 breakout (#5046)**. The board adds a 3.3 V regulator and I2C level shifting, so it works from 3.3 V or 5 V boards.

## Pinout (Adafruit #5046, header order)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V (onboard 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCK | I2C SCL (SPI clock), pull-up + level shifter |
| SDO | Address select: pulled up = 0x77; GND = 0x76 (SPI data out) |
| SDI | I2C SDA (SPI data in), pull-up + level shifter |
| CS | SPI chip select, pulled high = I2C; leave open |

The board also has two STEMMA QT / Qwiic connectors that carry the same I2C bus.

## Electrical limits
- Chip: VDD 1.71–3.6 V, absolute maximum 4.25 V. The Adafruit board takes 3–5 V on VIN.
- Current: about 12 mA while heating at 320 °C, 18 mA peak, 0.09–0.9 mA average in Bosch's low-power modes.
- I2C up to 3.4 MHz. SDO and CS are 3.3 V logic and are not level shifted.

## Interface details
- **I2C address 0x77** on the Adafruit board (SDO high), or 0x76 with SDO to GND. Chip ID register 0xD0 = **0x61** (the same as the BME680). **Variant ID 0xF0 = 0x01** on a BME688 (0x00 on a BME680). Soft reset: write 0xB6 to 0xE0.
- Calibration (same layout as the BME680): 0x8A–0xA0 (T2, T3, P1–P10), 0xE1–0xEE (H1–H7, T1, G1–G3), res_heat_val 0x00, res_heat_range 0x02<5:4>. H1 and H2 share 0xE2: H1 = 0xE3<<4 | 0xE2[3:0], H2 = 0xE1<<4 | 0xE2[7:4].
- Forced mode measurement:
  1. Write osrs_h to 0x72.
  2. For gas, set res_heat_0 (0x5A), gas_wait_0 (0x64; 6-bit ms × 1/4/16/64) and **0x71 = 0x20** (run_gas is **bit 5** on the BME688, nb_conv = 0).
  3. Start the measurement with 0x74 = osrs_t<<5 | osrs_p<<2 | 0b01.
- Field 0 data at 0x1D–0x2D:
  - 0x1D: status (bit 7 new_data).
  - 0x1F–0x21: pressure (20 bit). 0x22–0x24: temperature (20 bit). 0x25–0x26: humidity (16 bit).
  - **0x2C<7:0>, 0x2D<7:6>**: gas ADC (10 bit).
  - 0x2D: gas_valid bit 5, heat_stab bit 4, gas_range bits 3:0.
- Compensation (datasheet section 3.6): the floating-point formulas are the same as the BME680's. Compute temperature first: its t_fine feeds pressure, and humidity uses the result in °C.
- Gas resistance (BME688 formula, section 3.7): R = 1 000 000 × (262144 >> gas_range) / (4096 + 3 × (gas_adc − 512)) Ω. The BME680's range tables and range_sw_err do **not** apply.
- Heater code: res_heat_x is computed from par_g1/g2/g3, the target and the ambient temperature (section 3.6.5). Keep the target at or below 400 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDI → D21, SCK → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDI → GP4, SCK → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDI → pin 3, SCK → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bme688 import BME688
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = BME688(i2c, addr=0x77, heater_temp=320, heater_ms=150)
t, p, h, gas = s.read()   # °C, Pa, %RH, ohms (None if the heater was not stable)
print('T=%.1fC P=%.1fhPa H=%.1f%% G=%.1fkOhm' % (t, p / 100, h, gas / 1000))
```

## Simulation
The simulator stores calibration values in the chip's registers. It inverts the datasheet's own compensation formulas, so the driver's full maths reads back each slider value.

- Pressure is set in Pa, the unit the datasheet's formula returns.
- The gas slider is the gas resistance in Ω. It is modelled in gas range 9, which covers about 91–200 kΩ. The real chip picks its range automatically.

## Gotchas
- **Don't use a BME680 driver**: on a BME688 it reads the wrong gas registers, sets the wrong run_gas bit and uses the wrong formula. Check variant ID 0xF0 = 0x01.
- Gas resistance is relative. After burn-in (minutes at each power-up, about 48 h for a new sensor), log a baseline in clean air and watch for drops. You need Bosch's closed BSEC library for an "IAQ index" or gas classes.
- Check gas_valid and heat_stab. If heat_stab is 0, either the heater time was too short or the target was too hot.
- The heater warms the chip. Read at most about once per second and keep the heater time short, or the temperature reads high and the humidity low.
- The pin names are SPI-style: SCK is the I2C clock and SDI is I2C data.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme688-ds000.pdf
