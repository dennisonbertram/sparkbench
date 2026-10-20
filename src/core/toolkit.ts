// "What you'll need" beyond the parts list: the board-specific cable, breadboard, wires and tools,
// each with why it's needed. Rendered with pictures in the Build guide.
import type { Project } from './types';
import { planBreadboard } from './bbplace';

export interface ToolItem {
  id: 'breadboard' | 'jumpers' | 'jumpers-mf' | 'usb-micro' | 'usb-c-power' | 'computer' | 'battery-snap' | 'multimeter' | 'soldering' | 'screwdriver' | 'tweezers' | 'microsd';
  name: string;
  why: string;
  required: boolean;
}

export function toolkit(project: Project): ToolItem[] {
  const out: ToolItem[] = [];
  const plan = planBreadboard(project);
  const twoBoards = (plan.layout.cols ?? 63) > 63;
  const jumpers = plan.layout.wires.length;
  const offBoard = plan.layout.parts.filter((p) => p.kind === 'offboard').reduce((n, p) => n + Object.keys(p.legs).length, 0);
  out.push({ id: 'breadboard', name: twoBoards ? 'Two full-size breadboards (830 holes each)' : 'A full-size breadboard (830 holes)', why: 'Everything plugs into it, no soldering. The layout in this guide is for this size.', required: true });
  out.push({ id: 'jumpers', name: `Male-to-male jumper wires (at least ${Math.ceil((jumpers + 4) / 5) * 5})`, why: `This build uses ${jumpers} jumpers. A mixed-length kit is easiest; pre-cut "breadboard jumper" kits lie flat and make mistakes easy to see.`, required: true });
  if (offBoard) out.push({ id: 'jumpers-mf', name: `Male-to-female jumper wires (${offBoard})`, why: 'For the parts that sit off the breadboard (screens, servos, modules with pins): the female end slides onto their pins.', required: true });
  if (project.board === 'esp32' || project.board === 'pico') {
    out.push({ id: 'usb-micro', name: 'Micro-USB data cable', why: `Powers the ${project.board === 'esp32' ? 'ESP32 DevKit' : 'Pico'} and carries the program. Many cables only charge: if the computer doesn't see the board, try another cable.`, required: true });
    out.push({ id: 'computer', name: 'A computer with Chrome or Edge', why: 'To copy the program onto the board from Sparkbench ("Your board") and watch what it prints.', required: true });
  }
  if (project.board === 'rpi4') {
    out.push({ id: 'usb-c-power', name: 'USB-C power supply (5 V, 3 A)', why: 'The Raspberry Pi 4 needs a proper supply; a phone charger often causes random restarts.', required: true });
    out.push({ id: 'microsd', name: 'microSD card (16 GB or more) with Raspberry Pi OS', why: 'The Pi runs from it. Raspberry Pi Imager writes it for you.', required: true });
    out.push({ id: 'computer', name: 'A computer on the same Wi-Fi', why: 'To copy the program to the Pi over the network.', required: true });
  }
  if (project.parts.some((p) => p.type === 'battery-9v')) out.push({ id: 'battery-snap', name: '9 V battery snap with wire leads', why: 'Its two leads plug straight into the power rails.', required: true });
  if (project.parts.some((p) => p.type === 'neopixel-ring')) out.push({ id: 'soldering', name: 'Soldering iron and solder', why: 'The NeoPixel ring has bare pads: three short wires need soldering on.', required: true });
  if (project.parts.some((p) => p.type === 'lcd1602' || p.type === 'pir')) out.push({ id: 'screwdriver', name: 'Small screwdriver', why: 'For the adjustment screw on the screen or sensor module.', required: true });
  out.push({ id: 'multimeter', name: 'Multimeter (optional)', why: 'For the guided voltage checks if something doesn’t work. A basic one is fine.', required: false });
  out.push({ id: 'tweezers', name: 'Small pliers or tweezers (optional)', why: 'Make it easier to push short legs into the right hole.', required: false });
  return out;
}
