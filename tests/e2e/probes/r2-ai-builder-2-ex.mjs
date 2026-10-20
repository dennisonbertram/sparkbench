import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p } = await L.open('http://localhost:5173/?example=esp32-internet-clock&notour', 'ex');
await p.waitForTimeout(2000);
console.log('PROBLEMS\n', await L.problems(p));
await ctx.close();
