// Fetch a component from its datasheet and save it as a skill: npx tsx scripts/fetch-part.ts "TMP36"
import { fetchPart } from '../server/parts';
import { LOCAL_CONTEXT } from '../server/tenancy/context';
const t0 = Date.now();
const r = await fetchPart(LOCAL_CONTEXT, process.argv.slice(2).join(' '));
const { skill, driver, ...rest } = r.spec;
console.log(JSON.stringify(rest, null, 1));
console.log('driver:', driver?.filename, driver?.code.split('\n').length, 'lines');
console.log('skill dir:', r.skillDir, 'reused:', r.reused, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
