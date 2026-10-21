---
name: part-max30102
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX30102 pulse oximeter & heart-rate sensor (Analog Devices / Maxim MAX30102, MH-ET LIVE MAX30102 module). Use when designing, wiring, simulating or writing code for a MAX30102 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX30102 pulse oximeter & heart-rate sensor (MAX30102)

## Overview
The **MAX30102** (Analog Devices, formerly Maxim) packs a red (660 nm) and an infrared (880 nm) LED, a photodetector and an 18-bit ADC with ambient light cancellation. A fingertip on the window reflects less light each time a heartbeat pushes blood in, so the samples carry a pulse wave (PPG). Samples (50–3200/s, optional on-chip averaging) go into a 32-sample FIFO that the host reads over I2C. It also has a die temperature sensor (0.0625 °C steps). Hobbyists buy it on the **MH-ET LIVE MAX30102 module**: a small board with 1.8 V and 3.3 V regulators and 4.7 kΩ pull-ups, so it runs from 3.3–5 V.

## Pinout (MH-ET LIVE MAX30102 module, two 4-pin edges, as printed on the back)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (feeds the 1.8 V chip and 3.3 V LED regulators) |
| SDA | I2C data (4.7 kΩ pull-up to the jumper-selected logic level) |
| SCL | I2C clock, up to 400 kHz |
| GND | Ground |
| GND | Ground (second edge; listed as GND2) |
| RD | Red LED driver pin, leave unconnected |
| IRD | IR LED driver pin, leave unconnected |
| INT | Active-low open-drain interrupt (optional) |

The pins sit on two edges, so the module is wired with jumper leads rather than plugged straight into a breadboard row.

## Electrical limits
- Module supply: 3.3–5 V on VIN (MH-ET LIVE listing: VIN 1.8–5 V; 3.3 V needed for the LED regulator). Chip itself: VDD 1.7–2.0 V, VLED+ 3.1–5.0 V (both made on the board).
- Current: about 0.6 mA for the chip plus the pulsed LED current (0.2 mA per LSB of LEDx_PA, up to 51 mA peak, low duty cycle).
- Shutdown: 0.7 µA typical.
- I2C up to 400 kHz. INT is open-drain, active low.

## Interface details
- **I2C address 0x57** (0xAE write / 0xAF read). PART_ID register 0xFF reads **0x15**.
- Reset: write 0x40 to MODE_CONFIG (0x09), then poll until bit 6 reads 0.
- FIFO_CONFIG 0x08: SMP_AVE[7:5] (1, 2, 4, 8, 16, 32), FIFO_ROLLOVER_EN bit 4, FIFO_A_FULL[3:0].
- MODE_CONFIG 0x09: SHDN bit 7, RESET bit 6, MODE[2:0] = 010 HR (Red only), 011 SpO2 (Red + IR).
- SPO2_CONFIG 0x0A: ADC_RGE[6:5] (2048/4096/8192/16384 nA full scale), SR[4:2] (50…3200 sps), LED_PW[1:0] (69/118/215/411 µs → 15/16/17/18-bit). Long pulses limit the highest sample rate (datasheet Tables 11/12).
- LED1_PA 0x0C (red), LED2_PA 0x0D (IR): 0.2 mA per LSB.
- FIFO: FIFO_WR_PTR 0x04, OVF_COUNTER 0x05, FIFO_RD_PTR 0x06, FIFO_DATA 0x07. Unread samples = (WR − RD) & 0x1F. FIFO_DATA does not auto-increment: burst-read 3 bytes per channel per sample (Red then IR), value = 18-bit big-endian, left-justified (MSB at bit 17 whatever the resolution).
- Clear WR/OVF/RD pointers to 0 after setting the mode.
- Die temperature: write 1 to TEMP_EN (0x21, self-clearing, ~29 ms), then T = TINT (0x1F, two's complement, 1 °C) + TFRAC (0x20 bits 3:0) × 0.0625 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- INT (optional) to any GPIO; RD and IRD unconnected.

## Using the driver
```python
from machine import I2C, Pin
from max30102 import MAX30102
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
s = MAX30102(i2c)
s.setup(mode='spo2', sample_rate=400, average=4, pulse_width=215, adc_range=16384, red_ma=6.4, ir_ma=6.4)
for red, ir in s.read_fifo():   # call every few tens of ms; 100 samples/s here
    print(red, ir)
print(s.temperature())
```
The example program collects 8 s of IR samples, drops the first second while the signal settles, smooths the rest, finds the dip in reflected light at each heartbeat and prints `BPM=…`.

## Gotchas
- Check the **1V8/3V3 solder jumper** on the back: it must be on 3V3 for a 3.3 V microcontroller. With the pull-ups on 1.8 V the bus is flaky or the sensor is not found.
- Read the FIFO at least every 32 samples (320 ms at 100 samples/s) or samples are lost (OVF_COUNTER counts them).
- Rest the finger lightly and keep still; pressing hard squeezes the blood out and the pulse disappears. Direct sunlight can overflow the ambient light cancellation (ALC_OVF).
- The raw IR/red counts depend on LED current, ADC range and skin; tune LEDx_PA so the DC level sits well inside full scale.
- Hobby SpO2 / BPM values are not medical measurements.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf
