import { buildExample } from '../../../src/core/examples';
import { buildGuide } from '../../../src/core/docs';
console.log(buildGuide(buildExample(process.argv[2])));
