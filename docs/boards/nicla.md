# Arduino Nicla Vision (ABX00051) and Nicla Voice (ABX00061)

Board definitions: `src/core/boards.ts` (`nicla-vision`, `nicla-voice`). Every electrical fact there comes from the
sources below, quoted verbatim. Where official sources disagree, the stricter value is used and the conflict is
listed under **Conflicts and gaps**. Sources were downloaded on 2026-10-22.

## Sources

| Key | Document | URL |
| --- | --- | --- |
| VIS-DS | Nicla Vision datasheet / user manual, SKU ABX00051 (revision 9, "Modified: 21/10/2026") | https://docs.arduino.cc/resources/datasheets/ABX00051-datasheet.pdf |
| VIS-PO | Nicla Vision full pinout ("Last update: 14 Dec, 2022") | https://docs.arduino.cc/resources/pinouts/ABX00051-full-pinout.pdf |
| VIS-VAR | ArduinoCore-mbed `variants/NICLA_VISION/variant.cpp`, `pins_arduino.h` (branch main) | https://github.com/arduino/ArduinoCore-mbed/tree/main/variants/NICLA_VISION |
| VIS-UM | Nicla Vision user manual (docs-content, `content/hardware/nicla/boards/nicla-vision/tutorials/user-manual/content.md`) | https://docs.arduino.cc/tutorials/nicla-vision/user-manual/ |
| VIS-MP | MicroPython `ports/stm32/boards/ARDUINO_NICLA_VISION/pins.csv`, `mpconfigboard.h` (identical in OpenMV's fork at the commit used by OpenMV v5.0.1, `openmv/micropython@dd98455`) | https://github.com/micropython/micropython/tree/master/ports/stm32/boards/ARDUINO_NICLA_VISION |
| OMV-PWM | OpenMV v5.0.1 MicroPython fork: `ports/stm32/mpconfigport.h`, `machine_pwm.c`, `machine_i2c.c` | https://github.com/openmv/micropython/tree/dd984559aa42841908b78397b7dac32f57da803f/ports/stm32 |
| VOI-DS | Nicla Voice datasheet / user manual, SKU ABX00061 (revision 6, "Modified: 21/10/2026") | https://docs.arduino.cc/resources/datasheets/ABX00061-datasheet.pdf |
| VOI-PO | Nicla Voice full pinout ("Last update: 27 Feb, 2024") | https://docs.arduino.cc/resources/pinouts/ABX00061-full-pinout.pdf |
| VOI-VAR | ArduinoCore-mbed `variants/NICLA/variant.cpp`, `pins_arduino.h`; `boards.txt` sets `nicla_voice.build.variant=NICLA` | https://github.com/arduino/ArduinoCore-mbed/tree/main/variants/NICLA |
| VOI-UM | Nicla Voice user manual (docs-content, `.../nicla-voice/tutorials/user-manual/content.md`) | https://docs.arduino.cc/tutorials/nicla-voice/user-manual/ |
| NS | ArduinoCore-mbed `libraries/Nicla_System/src/Nicla_System.h/.cpp` | https://github.com/arduino/ArduinoCore-mbed/tree/main/libraries/Nicla_System |
| TXB | TI TXB0108 datasheet (SCES643L) — the translator on both boards' header I/O (U11) | https://www.ti.com/lit/ds/symlink/txb0108.pdf |
| BQ | TI BQ25120A datasheet — Nicla Voice PMIC (U9) | https://www.ti.com/lit/ds/symlink/bq25120a.pdf |
| PF | NXP PF1550 datasheet — Nicla Vision PMIC (U10, MC34PF1550A0EP) | https://www.nxp.com/docs/en/data-sheet/PF1550.pdf |
| STORE | Arduino USA store product pages (prices, 2026-10-22) | https://store-usa.arduino.cc/products/nicla-vision, https://store-usa.arduino.cc/products/nicla-voice |

## Verified facts: Nicla Vision

| Fact (as used in `boards.ts`) | Source | Verbatim quote |
| --- | --- | --- |
| J1 pin order 1–8: D0, A2, CS, COPI, CIPO, SCK, A1, A0 | VIS-DS §5.1 | "1 D0/LPIO0 … 2 A2/D18 … 3 SS … 4 COPI … 5 CIPO … 6 SCK … 7 A1/D17 … 8 A0/D16" |
| J2 pin order 1–9: SDA, SCL, D1, D2, D3, GND, VDDIO_EXT, N/C, VIN | VIS-DS §5.2 | "1 SDA … 2 SCL … 3 D1/LPIO1/UART_TX … 4 D2/LPIO2/UART_RX … 5 D3/LPIO3 … 6 GND … 7 VDDIO_EXT … Logic Level Reference … 8 N/C … 9 VIN … Input Voltage" |
| MCU pins: J1-1 PG_12, J1-2 PF_3, J1-3 PE_11, J1-4 PE_14, J1-5 PE_13, J1-6 PE_12, J1-7 PF_13, J1-8 PC_4; J2-1 PB_9, J2-2 PB_8, J2-3 PA_9, J2-4 PA_10, J2-5 PG_1 | VIS-PO p.5 | "PG_12 J1-1 LPIO0 … PF_3 J1-2 A2 … PE_11 J1-3 CS … PE_14 J1-4 COPI … PE_13 J1-5 CIPO … PE_12 J1-6 SCLK … PF_13 J1-7 A1 … PC_4 J1-8 A0 … PB_9 J2-1 SDA … PB_8 J2-2 SCL … PA_9 J2-3 LPIO1 … PA_10 J2-4 LPIO2 … PG_1 J2-5 LPIO3" |
| Same mapping in the Arduino core | VIS-VAR variant.cpp | "{ PG_12, … }, // D0", "{ PA_9, … }, // D1 TX", "{ PA_10, … }, // D2 RX", "{ PG_1, … }, // D3", "{ PE_11, … }, // SPI_SS", "{ PE_14, … }, // SPI_COPI", "{ PE_12, … }, // SPI_SCK", "{ PE_13, … }, // SPI_CIPO", "{ PB_9, … }, // SDA", "{ PB_8, … }, // SCL", "{ PC_4, … }, // A0", "{ PF_13, … }, // A1", "{ PF_3, … }, // A2" |
| Logic level 3.3 V (VDDIO_EXT typ.) | VIS-DS §2.1; VIS-PO p.4 | "VDDIO_EXT Level Translator Voltage 1.8 3.3 3.3 V"; "VDDIO_EXT (+3V3)" |
| VDDIO_EXT is programmable 1.8–3.3 V and an output | VIS-PO p.1 | "VDDIO_EXT is software programmable between 1.8 and 3.3V"; J2-7 drawn as "OUT VDDIO_EXT … PMIC BUCK SW2" |
| Header I/O is "low power" → `maxPinMa: 1`, LEDs via transistor | VIS-UM; VIS-PO; TXB §7.3.1 | "The Nicla Vision digital I/O's are low power, so to drive output devices like LEDs, resistive loads, buzzers, etc, it is recommended to use a MOSFET driver or a buffer"; "These translators are meant for low power and can only drive very limited current. Please check translator datasheet for details."; TXB0108 I/O cell figure shows a "4k" resistor in each output path. 1 mA is derived (3.3 V / 4 kΩ ≈ 0.8 mA), not an Arduino figure. |
| Analog pins A0–A2 limited to 1.8 V (caution) | VIS-UM; VIS-PO p.1 | "The analog inputs of the Nicla Vision can be used as digital pins but they can just handle 1.8 V, a greater input may damage the board."; "Analog pins work only at 1.8V" |
| ADC 12-bit | VIS-VAR pins_arduino.h; VIS-UM | "#define ADC_RESOLUTION 12"; "Using Micropython on the OpenMV IDE the Nicla boards ADC resolution is fixed to 12 bits" |
| I2C on SDA/SCL = I2C1 (MicroPython `I2C(1)`, no scl=/sda=) | VIS-PO p.5; VIS-MP; OMV-PWM machine_i2c.c | "PB_8 J2-2 SCL … I2C1_SCL", "PB_9 J2-1 SDA … I2C1_SDA"; "#define MICROPY_HW_I2C1_SCL (pin_B8)", "#define MICROPY_HW_I2C1_SDA (pin_B9)"; "explicit choice of scl/sda is not implemented" |
| I2C1 has 10 k pull-ups in the NTS0304 translator | VIS-DS §5 | "I2C1 is connected to the level translator U12 which has internal 10k pullups." |
| SPI on J1 = SPI4 | VIS-PO p.5; VIS-MP | "SPI4_SCK … SPI4_CIPO … SPI4_COPI … SPI4_NSS"; "#define MICROPY_HW_SPI4_NSS (pin_E11)" … "MICROPY_HW_SPI4_MOSI (pin_E14)" |
| MicroPython pin names D0–D3, A0–A2, SDA, SCL, CS, CIPO, COPI; SCK addressed as "PE12" | VIS-MP pins.csv | "D0,PG12", "D1,PA9", "D2,PA10", "D3,PG1", "A0,PC4", "A1,PF13", "A2,PF3", "SCKL,PE12", "CIPO,PE13", "COPI,PE14", "CS,PE11", "SCL,PB8", "SDA,PB9"; "PE12,PE12" (we avoid the "SCKL" spelling) |
| `Pin("D1")` style is how Arduino documents MicroPython on this board | VIS-UM | `button = Pin("D1", Pin.IN, Pin.PULL_UP)` |
| PWM pins: D1 (TIM1_CH2), D2 (TIM1_CH3), SCL (TIM4_CH3), SDA (TIM4_CH4), CS (TIM1_CH2), CIPO (TIM1_CH3), COPI (TIM1_CH4); not D0, D3, SCK | VIS-UM PWM table; VIS-PO p.5 | "PA_9 D1 TIMER1 CH2 … PA_10 D2 TIMER1 CH3 … PB_8 SCL TIMER4 CH3 … PB_9 SDA TIMER4 CH4 … PE_11 CS TIMER1 CH2 … PE_13 CIPO TIMER1 CH3 … PE_14 COPI TIMER1 CH4"; pinout gives PE_12 only "TIM1_CH3N", PG_12 only "HRTIM_EEV5 … LPTIM1_IN1", PG_1 no timer |
| `machine.PWM` exists in the OpenMV v5.0.1 firmware and needs a TIMx_CH1–4 (not CHxN) | OMV-PWM | "#define MICROPY_PY_MACHINE_PWM (1)"; `pin->af[i].type >= AF_PIN_TYPE_TIM_CH1 && pin->af[i].type <= AF_PIN_TYPE_TIM_CH4`; "Pin(%q) doesn't have PWM capabilities" |
| VIN 3.5–5.5 V, a power input | VIS-DS §2.1; VIS-PO p.1 | "VIN Input voltage from VIN pad 3.5 5.0 5.5 V"; J2-9 drawn as "IN VIN" |
| VDDIO_EXT budget 1000 mA (PMIC SW2) | VIS-PO p.6; PF | "SW2LX … J2-7 VDDIO"; "SW2, 1.0 A" |
| On-board RGB LED: LEDR PE_3, LEDG PC_13, LEDB PF_4 (not on the header, so no `ledPin`) | VIS-PO p.1; VIS-VAR | "PF_4 LEDB", "PC_13 LEDG", "PE_3 LEDR"; "#define LED_BUILTIN PIN_LED" with "#define PIN_LED (24u)" = LEDG |
| Board 22.85 mm square, 8 pads left / 9 right | VIS-DS §6 drawing | "22.85mm" × "22.85mm" (the Nicla Voice drawing gives 22.86 mm, 2.54 mm pitch) |
| Programmed with OpenMV IDE; firmware install dialog | VIS-UM | "Click on the "connect" symbol at the bottom of the left toolbar." … "Select `Install the latest release firmware`" … "`DFU firmware update complete!`" |
| main.py runs at boot; files copied to the storage drive | VIS-UM | "If you overwrite the __main.py__ script on your Nicla Vision, then it will run whatever code you loaded on it instead."; "copy it to the Nicla Vision storage drive" |
| Micro USB | VIS-DS §4.1 | "you will need a micro USB cable" |
| Battery input has no reverse-polarity protection | VIS-DS §3.9 | "Input voltage from the battery does NOT have reverse polarity protection" |
| `currentMa: 105` | VIS-DS §2.2 | "Average current consumption during image capture 105 mA" |

## Verified facts: Nicla Voice

| Fact | Source | Verbatim quote |
| --- | --- | --- |
| J1 pin order 1–8: LPIO0, NC, CS, COPI, CIPO, SCLK, ADC2, ADC1 | VOI-DS §6.1 | "1 LPIO0_EXT … 2 NC … 3 CS … 4 COPI … 5 CIPO … 6 SCLK … 7 ADC2 Analog … 8 ADC1 Analog" |
| J2 pin order 1–9: SDA, SCL, LPIO1, LPIO2, LPIO3, GND, VDDIO_EXT, N/C, VIN | VOI-DS §6.2 | "1 SDA … 2 SCL … 3 LPIO1_EXT … 4 LPIO2_EXT … 5 LPIO3_EXT … 6 GND … 7 VDDIO_EXT … 8 N/C … 9 VIN Digital Input Voltage" |
| MCU / Arduino pin: LPIO0 P0_24 = 5, CS P0_29 = 6, COPI P0_27 = 8, CIPO P0_28 = 7, SCLK P0_11 = 9, ADC2 P0_30 = 11 (A1), ADC1 P0_02 = 10 (A0), SDA P0_22 = 4, SCL P0_23 = 3, LPIO1 P0_20 = 2, LPIO2 P0_09 = 1, LPIO3 P0_10 = 0 | VOI-PO p.1; VOI-VAR variant.cpp | "ADC1 P0_02 10 8 … ADC2 P0_30 11 7 … SCLK P0_11 9 6 … CIPO P0_28 7 5 … COPI P0_27 8 4 … CS P0_29 6 3 … LPIO0_EXT P0_24 5 1"; "5 0 P0_10 LPIO3_EXT … 4 1 P0_09 LPIO2_EXT/RX … 3 2 P0_20 LPIO1_EXT/TX … 2 3 P0_23 SCL … 1 4 P0_22 SDA"; variant: "{ P0_10, … }, // 0: GPIO3", "{ P0_9, … }, // 1: GPIO2/RX", "{ P0_20, … }, // 2: GPIO1/TX", "{ P0_23, … }, // 3: SCL1", "{ P0_22, … }, // 4: SDA1", "{ P0_24, … }, // 5: GPIO0", "{ P0_29, … }, // 6: CS", "{ P0_28, … }, // 7: CIPO", "{ P0_27, … }, // 8: COPI", "{ P0_11, … }, // 9: SCLK", "{ P0_2, … }, // 10: A0", "{ P0_30, … }, // 11: A1" |
| SPI pins in the core | VOI-VAR pins_arduino.h | "#define PIN_SPI_MISO (7u)", "#define PIN_SPI_MOSI (8u)", "#define PIN_SPI_SCK (9u)", "#define PIN_SPI_SS (6u)" |
| LPIO pins also wired to the NDP120 (noted in `alt`) | VOI-PO p.1 | "GPIO15 LPIO0_EXT P0_24"; "LPIO3_EXT GPIO6", "LPIO2_EXT/RX GPIO16", "LPIO1_EXT/TX GPIO14" |
| MCU runs at 1.8 V; header I/O translated to VDDIO_EXT | VOI-DS §4.3, §4.9 | "While the module itself runs at 1.8 V, a level shifter can adjust the logic level between 1.8 V and 3.3 V"; "All I/O broken out to the pins are fed through a bi-direction voltage translator running at VDDIO_EXT." |
| Logic level 3.3 V (VDDIO_EXT enabled at 3.3 V by `nicla::begin()`) | VOI-DS §2; VOI-PO p.1; VOI-UM; NS | "VDDIO_EXT Level Translator Voltage 1.8 3.3 3.3 V"; "LS/LDO pin is an output of an LDO in the PMIC, it is enabled by default at 3.3V"; "nicla::begin(); // Nicla peripherals initialization, this enables the VDDIO_EXT 3.3V output."; `static bool begin(bool mountedOnMkr = false);` |
| Header I/O "low power" → `maxPinMa: 1`, LEDs via transistor | VOI-UM; VOI-PO | "The Nicla Voice digital I/O's are low power, so to drive output devices like LEDs, resistive loads, buzzers, etc, it is recommended to use a MOSFET driver or a buffer"; "These translators are meant for low power and can only drive very limited current." |
| ADC1/ADC2 at 1.8 V; reference fixed 1.8 V; inputs tolerate 3.3 V (caution) | VOI-DS §2; VOI-UM | "All I/O pins operate at VDDIO_EXT apart from the following: ADC1 and ADC2 - 1.8 V"; "The Nicla boards ADC reference voltage is fixed to 1.8V"; "The ADC inputs support 3.3V even when the ADC reference is 1.8V. In this perspective, the ADC will not sense any change from 1.8V and above." |
| ADC 12-bit | VOI-DS features; VOI-UM | "12-bit/200 ksps ADC"; "analogReadResolution(12); // ADC resolution set to 12 bits (0-4095)" |
| VIN 3.5–5.5 V input (to the PMIC IN) | VOI-DS §2; VOI-PO p.1 | "VIN Input voltage from VIN pad 3.5 5.0 5.5 V"; "IN VIN_BQ25120 … IN" |
| VDDIO_EXT budget 100 mA | VOI-PO p.1; BQ | "VDDIO_EXT … LS/LDO"; "ILS/LDO Output Current from LS/LDO 100 mA" |
| Programmed in Arduino C++ with the "Arduino Mbed OS Nicla Boards" core | VOI-UM | "search for `nicla` and install the latest `Arduino Mbed OS Nicla Boards` version" |
| Uses `#include "Nicla_System.h"` | VOI-UM | `#include "Nicla_System.h"` |
| Board 22.86 mm square, 2.54 mm pitch, pad 1.27 mm from the edge | VOI-DS §7.1 | "22.86mm", "22.86mm", "2.54mm", "1.27mm", "Ø1.01mm" |
| ESLOV is a 5 V *input* | VOI-DS §5.4 | "Pin 1 of the ESLOV connector of the Nicla Voice board is a 5V voltage input, not a voltage output." |
| On-board RGB LED is I2C-driven (no `ledPin`) | VOI-DS §4.6; VOI-VAR | "An I2C LED driver (U8) drives the common anode RGB LED (DL1)"; `extern I2CLed LED_BUILTIN;` |
| Micro USB | VOI-DS §5.1 | "you'll need a micro USB cable" |
| `currentMa: 2.4` | VOI-DS §3 | "Alexa demo ON with BLE advertising and sensor polling at 1 Hz - 2.4 - mA" (VBAT = 3.7 V) |
| Radio: Bluetooth LE only | VOI-DS | "nRF52832 microcontroller, Bluetooth® Low Energy module" |

## Prices (BOM)

STORE, 2026-10-22: Nicla Vision `"price":"80.20"` USD, Nicla Voice `"price":"49.40"` USD.

## Conflicts and gaps (deliberately left out or flagged)

- **Vision analog input range.** VIS-DS §2.1 Note 1 says "While the ADC inputs can accept up to 3.3V, the AREF value is at the STM32 operating voltage", but VIS-UM and VIS-PO say 1.8 V max and "a greater input may damage the board". We use 1.8 V (caution on A0–A2), and the planner refuses analog parts on the Nicla Vision because the header has no 1.8 V supply.
- **Vision Arduino numbers for A0–A2.** VIS-DS §5.1 labels them "A0/D16", "A1/D17", "A2/D18", but VIS-VAR has `PIN_A0 (15u)`, `PIN_A1 (16u)`, `PIN_A2 (17u)`. Not used by Sparkbench (Vision code is MicroPython by name).
- **Voice Arduino pins 7/8.** VOI-UM's digital-pin table lists "P0_27 → 7, P0_28 → 8", but VOI-VAR (`// 7: CIPO` = P0_28, `// 8: COPI` = P0_27), `PIN_SPI_MISO (7u)`/`PIN_SPI_MOSI (8u)` and VOI-PO all agree on CIPO P0_28 = 7, COPI P0_27 = 8. We follow the core.
- **Maximum current per pin.** Neither Arduino document gives a number. `maxPinMa: 1` is derived from the TXB0108's 4 kΩ series output path (TXB) and is only used to keep loads off the pins; every LED is driven through an NPN transistor (10 kΩ base resistor).
- **TXB0108 and pull-ups / open-drain.** TXB says "If pullup or pulldown resistors are needed, the resistor value must be over 50kΩ" and points open-drain uses to the TXS family. Buttons use the MCU pull-up exactly as Arduino's own examples do; one-wire/open-drain parts (DHT22) are refused on Nicla boards.
- **PWM channel sharing on the Vision.** D1 and CS share TIM1_CH2; D2 and CIPO share TIM1_CH3 (VIS-UM table). Two PWM outputs on such a pair would mirror each other. Not checked automatically.
- **Voice PWM.** VOI-UM: "Most digital and analog pins of the Nicla Voice can be used as PWM … the PWM signal frequency is fixed at 500 Hz". It doesn't say which pins, so no Voice pin has the `pwm` capability; the sketch drives LEDs on/off.
- **5 V.** Neither board has a 5 V output on the header (VIN is an input); parts needing 5 V (LCD, HC-SR04, PIR, NeoPixel, servo, relay) are refused.
- **Vision VDDIO_EXT budget.** 1000 mA is the PF1550 SW2 regulator rating; the real limit also depends on the USB/battery input. No Arduino figure exists.
- **Nicla Voice simulation.** Not simulated: the sketch is C++ and the browser simulator runs Python. The UI says "Simulation for the Arduino Nicla Voice needs the firmware emulator (coming)".
- **Board drawing.** Component positions (camera, STM32, ANNA-B112, NDP120) are approximate, from the topology pictures; pad positions and outline follow the mechanical drawings. The ESLOV connector (J5) is on the underside and isn't drawn in the top view.
