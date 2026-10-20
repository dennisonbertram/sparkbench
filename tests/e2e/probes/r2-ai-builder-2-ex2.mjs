import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p } = await L.open('http://localhost:5173/?notour', 'clock');
await L.consoleTab(p, /problem/i);
console.log(await p.locator('[data-testid=problems]').innerHTML());
await L.shot(p, 'clock-70-problems');
await ctx.close();
