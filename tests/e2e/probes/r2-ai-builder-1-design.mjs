// node r2-ai-builder-1-design.mjs <proj> "<prompt>"
import { open, info, chat, serial } from './r2-ai-builder-1-lib.mjs';
import fs from 'fs';
const [proj, prompt] = process.argv.slice(2);
const { p, shot, close, dir } = await open(proj, 'http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.fill('.hero-input textarea', prompt);
await p.click('.hero-input button');
await p.waitForTimeout(5000);
await shot('00-designing');
const t0 = Date.now();
try { await p.waitForSelector('.part', { timeout: 300000 }); } catch (e) { await shot('fail'); }
console.log('design took', Date.now() - t0);
await p.waitForTimeout(3000);
await shot('01-design');
const o = await info(p); o.chat = await chat(p); o.serial = await serial(p);
fs.writeFileSync(dir + 'design.json', JSON.stringify(o, null, 1));
console.log(JSON.stringify(o, null, 1));
await close();
