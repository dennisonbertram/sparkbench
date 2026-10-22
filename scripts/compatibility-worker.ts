import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCompatibility, validateCompatibilityProject } from '../server/compatibility';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: compatibility-worker.ts <project.json> <output-directory>');
const project = validateCompatibilityProject(JSON.parse(await readFile(input, 'utf8')));
await runCompatibility(project, resolve(output));
