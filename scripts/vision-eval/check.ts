import { CASES } from './layouts';
import { faultsFor } from './faults';
import { connectivity, diffConnectivity } from '../../src/core/breadboard';
for (const c of CASES) {
  const d = diffConnectivity(connectivity(c.layout), c.nets);
  console.log(c.id, d.length ? d : 'OK');
  for (const f of faultsFor(c)) console.log('   ', f.kind, '|', f.description, '|', diffConnectivity(connectivity(f.layout), c.nets).slice(0, 2).join('; '));
}
