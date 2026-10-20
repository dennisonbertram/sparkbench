import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
for(const tab of ['Parts list','Build guide','Code','Schematic']){
  await p.click(`.tabs button:has-text("${tab}")`); await p.waitForTimeout(1500);
  await shot(p,'40-'+tab.replace(' ','_'));
  const main = await p.locator('main, .workspace, .center, .tab-body').first().innerText().catch(()=>'' );
  console.log('\n#####',tab,'\n',main.slice(0,3500));
}
await ctx.close();
