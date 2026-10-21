---
name: part-m5stack-unit-4-relay
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit 4Relay (SKU U097; STM32F030F4P6 I2C controller at 0x26 driving four 5 V 10 A SPDT relays, Grove GND/5V/SDA/SCL). Use when designing, wiring, simulating or writing code for an M5Stack 4-Relay unit in a Sparkbench project or any ESP32 / M5Stack / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit 4Relay (U097)

## Overview
Four mechanical relays on one Grove I2C port. An **STM32F030F4P6** running M5Stack's firmware answers at **I2C address 0x26** and drives four **SS8050** transistors, each switching a 5 V relay coil (TH 932-05VDC-SL-AH type, flyback diode across each coil). Each channel also has a red status LED that can follow its relay (sync mode) or be set by hand. An XC6206 regulator makes 3.3 V for the MCU, so SDA/SCL are 3.3 V lines. Hobbyists buy it as the **M5Stack Unit 4Relay (SKU U097)** with a 20 cm Grove cable and four HT3.96-4P plug-in terminals for the contacts.

## Pinout (Grove HY2.0-4P, M5Stack PinMap)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply 5 V: relay coils + 3.3 V regulator |
| SDA | yellow | I2C data (3.3 V logic, no pull-up on the unit) |
| SCL | white | I2C clock (3.3 V logic, no pull-up on the unit) |

Load terminals J1-J4 (3.96 mm, one per relay) are on the long edge, so the unit is wired with the Grove cable or jumper leads, not plugged into a breadboard.

## Electrical limits
- Supply 5 V nominal (M5Stack gives no tolerance range; use a regulated 5 V rail such as USB 5 V or an M5Stack Port A). Each energised coil takes roughly 70 mA (0.36 W class 5 V relay), so all four on is about 300 mA from the 5 V rail. 3.3 V will not pull the relays in.
- Contacts: AC 250 V / DC 28 V, 10 A rated, 16 A peak (M5Stack figures).
- I2C pins are STM32 pins at 3.3 V. The unit has **no I2C pull-ups** (an M5Stack Core supplies them); on a bare ESP32/Pico add 4.7 kΩ from SDA and SCL to 3.3 V.

## Interface details
- Address **0x26**. Register write: `[reg, value]`. Register read: write `[reg]`, then read 1 byte.
- `0x10` mode: bit 0 = 1 sync (LED n follows relay n), 0 = manual (LEDs set by hand).
- `0x11` state: bits 0-3 = relays 1-4, bits 4-7 = LEDs 1-4 (1 = on). Change one relay with read-modify-write.
- Bit order follows M5Stack's Arduino `Unit_4RELAY` and UiFlow2 `relay4.py` libraries (relay n = bit n-1). The docs page's register table lists RELAY1 at bit 3; the libraries are what ship, so trust them and check on your unit if the channel number matters.
- M5Stack's drivers wait ~1 ms between transactions; the driver does the same.

## Wiring
- ESP32: GND → GND, 5V → 5V/VIN, SDA → GPIO21, SCL → GPIO22, plus 4.7 kΩ pull-ups SDA/SCL → 3V3.
- M5Stack Core: plug into PORT.A (SDA 21, SCL 22 on Core; 32/33 on Core2).
- Pico: GND → GND, 5V → VBUS, SDA → GP4, SCL → GP5, plus 4.7 kΩ pull-ups to 3V3(OUT).
- Raspberry Pi 4: GND → pin 6, 5V → pin 2, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups).
- Load: supply + → COM, NO → load → supply −.

## Using the driver
```python
from machine import I2C, Pin
from unit_4relay import Unit4Relay
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
r = Unit4Relay(i2c)      # 0x26, sync mode, all off
r.relay(1, True)         # relay 1 on (LED 1 follows)
print(r.relays())        # 1 = 0b0001
r.all(False)
```

## Gotchas
- Feed 5 V; four coils together draw about 300 mA, so use a USB supply that can give it.
- No I2C pull-ups on the unit: without a Core or external resistors the bus will not work.
- Mains on the terminals is dangerous: closed insulated box, adult/qualified person only. Start with a low-voltage DC load.
- Relays are slow and wear out: never PWM them.

## Datasheet
Product page and register map: https://docs.m5stack.com/en/unit/4relay ·
Schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/589/Sch_UNIT-4RELAY.pdf ·
Libraries: https://github.com/m5stack/M5Unit-RELAY, https://github.com/m5stack/uiflow-micropython/blob/master/m5stack/libs/unit/relay4.py
