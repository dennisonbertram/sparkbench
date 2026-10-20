// The example gallery: ten-plus complete projects, each built by the same planner a user's
// prompt goes through, so every example is also a regression test of the whole pipeline.
import type { Project } from './types';
import { planFromPrompt } from './planner';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  prompt: string;
  board: 'esp32' | 'pico' | 'rpi4' | 'none';
  level: 'Beginner' | 'Intermediate';
  /** What to try in the simulator. */
  tryIt: string[];
}

export const EXAMPLES: Example[] = [
  {
    id: 'esp32-weather-imu',
    title: 'Weather & motion station',
    blurb: 'ESP32 with an OLED, two buttons, a DHT22 and an MPU-6050. Shows readings and a bubble level.',
    prompt: 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU',
    board: 'esp32',
    level: 'Intermediate',
    tryIt: ['Drag the temperature slider on the DHT22 and watch the OLED update.', 'Press button A to switch to the bubble-level screen, then tilt the IMU.', 'Shake the IMU and press button B to reset the shake counter.'],
  },
  {
    id: 'pico-traffic-light',
    title: 'Traffic light',
    blurb: 'Raspberry Pi Pico cycling red, amber and green LEDs — the classic first project.',
    prompt: 'Raspberry Pi Pico traffic light',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Press Run and watch the 10-second red → green → amber cycle.', 'Open the Code tab and change the timings.'],
  },
  {
    id: 'esp32-parking-sensor',
    title: 'Parking sensor',
    blurb: 'HC-SR04 ultrasonic sensor and a buzzer that beeps faster as you get closer, with a warning LED.',
    prompt: 'ESP32 parking sensor with an ultrasonic distance sensor, a buzzer and a red LED',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Slide the distance down below 100 cm — the beeps speed up.', 'Below 20 cm the red LED comes on.'],
  },
  {
    id: 'pico-servo-dial',
    title: 'Servo dial',
    blurb: 'Turn a potentiometer and a servo follows — the basis of every robot arm.',
    prompt: 'Raspberry Pi Pico servo controlled by a potentiometer knob',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Turn the knob and watch the servo horn follow.'],
  },
  {
    id: 'rpi-plant-waterer',
    title: 'Plant waterer',
    blurb: 'Raspberry Pi with a soil moisture probe (via an MCP3008), a 16×2 LCD and a pump relay.',
    prompt: 'Raspberry Pi plant monitor with a soil moisture sensor, a relay for a water pump and an LCD',
    board: 'rpi4',
    level: 'Intermediate',
    tryIt: ['Drop the soil moisture below 30 % — the pump relay clicks on.', 'Raise it above 60 % and the pump stops.'],
  },
  {
    id: 'esp32-motion-alarm',
    title: 'Motion alarm',
    blurb: 'PIR sensor, siren buzzer, warning LED and an arm/disarm button.',
    prompt: 'ESP32 motion alarm with a PIR sensor, a buzzer, a red LED and a button',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Press "Motion" on the PIR sensor — the siren sounds.', 'Press the button to disarm the alarm.'],
  },
  {
    id: 'pico-night-light',
    title: 'Automatic night light',
    blurb: 'A photoresistor measures the light; a white LED fades up as it gets dark.',
    prompt: 'Pico night light with a light sensor',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Lower the light level and watch the LED brighten.'],
  },
  {
    id: 'esp32-neopixel-thermo',
    title: 'NeoPixel thermometer',
    blurb: 'A 12-LED NeoPixel ring glows blue when cold and red when hot.',
    prompt: 'ESP32 with a neopixel ring that shows the temperature from a DHT22',
    board: 'esp32',
    level: 'Intermediate',
    tryIt: ['Move the temperature from 15 °C to 35 °C — the ring changes colour.'],
  },
  {
    id: 'rpi-thermostat',
    title: 'Fan thermostat',
    blurb: 'Raspberry Pi reads a DHT22, shows it on an OLED and switches a fan relay above 28 °C.',
    prompt: 'Raspberry Pi thermostat with a DHT22 temperature sensor, an OLED display and a relay for a fan',
    board: 'rpi4',
    level: 'Intermediate',
    tryIt: ['Raise the temperature above 28 °C — the fan relay switches on.'],
  },
  {
    id: 'esp32-tilt-game',
    title: 'Tilt maze level',
    blurb: 'An IMU-driven bubble level on an OLED with a buzzer click when you tilt too far.',
    prompt: 'ESP32 tilt meter with an IMU, an OLED and a buzzer',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Tilt the IMU sliders and watch the dot move.', 'Press Shake for a buzz.'],
  },
  {
    id: 'pico-mood-lamp',
    title: 'RGB mood lamp',
    blurb: 'An RGB LED cycles through the rainbow; a knob sets the colour.',
    prompt: 'Pico RGB mood light with an RGB LED and a knob',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Turn the knob to pick a colour.'],
  },
  {
    id: '555-blinker',
    title: '555 LED blinker',
    blurb: 'No microcontroller: an NE555 timer, two resistors and a capacitor blink an LED at 1.4 Hz.',
    prompt: '555 timer LED blinker with no microcontroller',
    board: 'none',
    level: 'Beginner',
    tryIt: ['Press Run and watch the LED blink by itself.', 'Change R2 or the capacitor in the Inspector and run again.'],
  },
  {
    id: 'transistor-switch',
    title: 'Transistor button light',
    blurb: 'A push button drives an NPN transistor that switches an LED — how every motor driver works.',
    prompt: 'transistor led switch with a button and no microcontroller',
    board: 'none',
    level: 'Beginner',
    tryIt: ['Hold the button: the transistor turns on and the LED lights.'],
  },
];

export function buildExample(id: string): Project {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`Unknown example ${id}`);
  const p = planFromPrompt(ex.prompt);
  return { ...p, name: p.name, prompt: ex.prompt, id: `${ex.id}-${Date.now().toString(36)}` };
}
