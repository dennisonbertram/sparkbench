import { open } from './r2-ai-builder-1-lib.mjs';
import fs from 'fs';
const [proj] = process.argv.slice(2);
const { p, close, dir } = await open(proj);
const pr = await p.evaluate(() => { const all = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /project/i.test(k) && localStorage.getItem(k).startsWith('{'))) || '{}'); return all; });
fs.writeFileSync(dir + 'projects.json', JSON.stringify(pr, null, 1));
console.log(Object.keys(pr));
await close();
