import { chromium } from 'playwright';
const B='http://localhost:5173', O='test-results/qa2/visual/ai';
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1440,height:900}});
// Designing view
{
  const page = await ctx.newPage();
  await page.goto(B+'/?welcome&notour'); await page.waitForSelector('.hero');
  await page.fill('.hero-input textarea','A Pico plant moisture monitor with an OLED display and a buzzer alarm when the soil is dry');
  await page.click('.hero-input button');
  let prev=0; for (const t of [1500,4000,15000,35000]) { await page.waitForTimeout(t-prev); prev=t; await page.screenshot({path:`${O}/designing-${t}.png`}); }
  try { await page.waitForSelector('[data-testid="breadboard"] .part',{timeout:120000}); await page.waitForTimeout(1500); await page.screenshot({path:`${O}/designed-result.png`}); } catch(e){ console.log('design not finished', String(e)); await page.screenshot({path:`${O}/designed-timeout.png`}); }
  await page.close();
}
// Code assistant proposal
{
  const page = await ctx.newPage();
  await page.goto(B+'/?example=pico-traffic-light&notour'); await page.waitForSelector('[data-testid="breadboard"] .part');
  await page.locator('.tabs button',{hasText:'Code'}).click(); await page.waitForTimeout(800);
  await page.screenshot({path:`${O}/code-before.png`});
  const ta = page.locator('[data-testid=code-assistant] textarea');
  await ta.fill('Make the green phase last twice as long and print the current light to serial');
  await page.locator('[data-testid=code-assistant] button[type=submit], [data-testid=code-assistant] button').last().click();
  await page.waitForTimeout(3000); await page.screenshot({path:`${O}/code-working.png`});
  try { await page.waitForSelector('[data-testid=ai-proposal]',{timeout:150000}); await page.waitForTimeout(800);
    await page.screenshot({path:`${O}/code-proposal.png`});
    await page.locator('[data-testid=ai-proposal]').screenshot({path:`${O}/code-proposal-el.png`}).catch(()=>{});
    await page.setViewportSize({width:1024,height:768}); await page.waitForTimeout(500); await page.screenshot({path:`${O}/code-proposal-1024.png`});
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:/Accept & run/}).click(); await page.waitForTimeout(4000); await page.screenshot({path:`${O}/code-accepted.png`});
  } catch(e){ console.log('no proposal', String(e)); await page.screenshot({path:`${O}/code-noproposal.png`}); }
  await page.close();
}
await browser.close();
