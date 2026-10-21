// Friendly names for wire colours, shared by the wiring table, the build steps and the breadboard
// layout so every view calls a wire the same colour.

export const COLOR_NAMES: [string, string][] = [
  ['#1f2328', 'black'], ['#000000', 'black'], ['#d32f2f', 'red'], ['#ef6c00', 'orange'], ['#1e88e5', 'blue'], ['#f9a825', 'yellow'],
  ['#2e7d32', 'green'], ['#8e24aa', 'purple'], ['#00838f', 'teal'], ['#c2185b', 'pink'], ['#6d4c41', 'brown'], ['#5c6bc0', 'indigo'],
  ['#7cb342', 'light green'], ['#546e7a', 'grey'], ['#ffffff', 'white'],
];
/** Nearest friendly colour name for a hex wire colour. */
export function colourName(hex?: string): string {
  if (!hex || !/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return 'any colour';
  let h = hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  const rgb = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r, g, b] = rgb(h);
  let best = 'any colour';
  let bd = Infinity;
  for (const [hx, name] of COLOR_NAMES) {
    const [r2, g2, b2] = rgb(hx);
    const d2 = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d2 < bd) {
      bd = d2;
      best = name;
    }
  }
  return best;
}

