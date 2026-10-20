// The requirements card: what the device will do, how it's powered, how big it is and what it
// costs — in plain words, so a beginner can confirm the design matches what they meant.
import type { Project, Requirements } from './types';
import { projectBehaviours } from './docs';
import { buildBom, bomTotal } from './bom';
import { planBreadboard } from './bbplace';
import { boardFor } from './boards';

export function deriveRequirements(project: Project): Requirements {
  const does = projectBehaviours(project)
    .map((b) => b.does)
    .filter((d) => !/^When it powers up, it prints/.test(d))
    .slice(0, 6);
  const board = boardFor(project.board);
  const power = !board
    ? `${project.parts.find((p) => p.type === 'battery-9v')?.props.volts ?? 9} V battery`
    : board.id === 'rpi4'
      ? 'Raspberry Pi USB-C power supply (5 V, 3 A)'
      : `USB cable from a computer or phone charger (5 V)${project.parts.some((p) => ['servo', 'dc-motor', 'relay', 'neopixel-ring'].includes(p.type)) ? '; the motor/LED parts are happiest with a 2 A charger' : ''}`;
  const cols = planBreadboard(project).layout.cols ?? 63;
  const size = cols > 63 ? 'two breadboards joined end to end' : 'fits on one standard breadboard (830 holes)';
  const total = bomTotal(buildBom(project));
  return { does, power, size, budget: `about $${Math.round(total)} in parts (hobby-store prices)` };
}
